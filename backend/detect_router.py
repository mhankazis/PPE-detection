"""
API Router for PPE Detection endpoints.
Handles image upload detection, video upload detection, and live feed with YOLO overlay.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
import cv2
import os
import time
import uuid
import shutil
import tempfile
from pathlib import Path

router = APIRouter(prefix="/api/detect", tags=["detection"])

UPLOAD_DIR = Path(".uploads/detections")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/image")
async def detect_image(file: UploadFile = File(...)):
    """
    Upload an image and run PPE detection.
    Returns JSON with detections, compliance data, and URL to annotated image.
    """
    from detection import get_detector

    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read image bytes
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        detector = get_detector()
        annotated_bytes, detections, compliance = detector.detect_image_bytes(image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

    # Save annotated image
    filename = f"det_{uuid.uuid4().hex[:8]}.jpg"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(annotated_bytes)

    # Build summary
    total_persons = len(compliance)
    compliant = sum(1 for c in compliance if c["is_compliant"])
    non_compliant = total_persons - compliant

    return {
        "success": True,
        "annotated_image_url": f"/.uploads/detections/{filename}",
        "detections": detections,
        "compliance": compliance,
        "summary": {
            "total_detections": len(detections),
            "total_persons": total_persons,
            "compliant": compliant,
            "non_compliant": non_compliant,
        }
    }


# Video detection configuration
VIDEO_INFER_MAX_DIM = 640         # Max dimension for inference downscaling
VIDEO_SAMPLE_INTERVAL = 1.0       # Minimum seconds between detections (adaptive)


@router.post("/video")
async def detect_video(file: UploadFile = File(...)):
    """
    Upload a video, run smart frame-by-frame PPE detection with motion detection.
    Only re-detects when significant movement is detected or periodically.
    Uses downscaling for faster inference. Runs detection in a thread to avoid blocking.
    Returns JSON with per-frame detection data and URL to browser-playable video.
    """
    from detection import get_detector
    import numpy as np
    import asyncio

    # Save uploaded video to temp file
    temp_input = UPLOAD_DIR / f"tmp_in_{uuid.uuid4().hex[:8]}{Path(file.filename).suffix}"
    try:
        with open(temp_input, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

    # Re-encode original video to H.264 for browser playback
    video_filename = f"vid_{uuid.uuid4().hex[:8]}.mp4"
    video_path = UPLOAD_DIR / video_filename
    _reencode_to_h264(str(temp_input), str(video_path))

    def _process_video():
        """Synchronous video processing — runs in thread pool."""
        detector = get_detector()

        cap = cv2.VideoCapture(str(temp_input))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Calculate downscale factor
        max_dim = max(width, height)
        infer_scale = min(VIDEO_INFER_MAX_DIM / max_dim, 1.0)
        infer_w = int(width * infer_scale)
        infer_h = int(height * infer_scale)

        frame_count = 0
        frames_detected = 0
        frames_skipped = 0
        frame_detections = []
        all_compliance = []

        prev_detection_frame = None
        last_detections = []
        last_compliance = []

        # Periodic forced detection interval (in frames) — every VIDEO_SAMPLE_INTERVAL seconds
        forced_interval = max(1, int(fps * VIDEO_SAMPLE_INTERVAL))

        # Motion detection uses small grayscale — no need for full resolution
        motion_scale = 0.25  # Downscale to 25% for motion detection

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1
            timestamp = round(frame_count / fps, 3)

            # Decide whether to run detection on this frame
            should_detect = (
                frame_count == 1 or                              # Always detect first frame
                frame_count % forced_interval == 0 or            # Periodic forced check
                _has_significant_motion_fast(prev_detection_frame, frame, motion_scale)
            )

            if should_detect:
                # Downscale for inference
                if infer_scale < 1.0:
                    small_frame = cv2.resize(frame, (infer_w, infer_h), interpolation=cv2.INTER_LINEAR)
                else:
                    small_frame = frame

                _, detections, compliance = detector.detect_frame(small_frame, annotate=False)

                # Scale bounding boxes back to original resolution
                if infer_scale < 1.0:
                    for det in detections:
                        det["bbox"] = [int(v / infer_scale) for v in det["bbox"]]
                    for comp in compliance:
                        comp["person_bbox"] = [int(v / infer_scale) for v in comp["person_bbox"]]

                last_detections = detections
                last_compliance = compliance
                prev_detection_frame = frame.copy()
                all_compliance.extend(compliance)
                frames_detected += 1

                frame_detections.append({
                    "frame": frame_count,
                    "timestamp": timestamp,
                    "detections": detections,
                    "compliance": compliance,
                })
            else:
                frames_skipped += 1

        cap.release()

        # Build summary
        total_persons = len(all_compliance)
        compliant = sum(1 for c in all_compliance if c["is_compliant"])
        non_compliant = total_persons - compliant

        all_missing = set()
        for c in all_compliance:
            for m in c.get("missing_ppe", []):
                all_missing.add(m)

        return {
            "success": True,
            "video_url": f"/.uploads/detections/{video_filename}",
            "video_dimensions": {"width": width, "height": height},
            "frame_detections": frame_detections,
            "summary": {
                "total_frames": frame_count,
                "frames_detected": frames_detected,
                "frames_skipped": frames_skipped,
                "total_person_detections": total_persons,
                "compliant_detections": compliant,
                "non_compliant_detections": non_compliant,
                "violation_types": list(all_missing),
                "fps": fps,
                "duration_seconds": round(frame_count / fps, 1) if fps > 0 else 0,
            }
        }

    try:
        # Run video processing in thread pool to avoid blocking the event loop
        result = await asyncio.to_thread(_process_video)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")
    finally:
        # Clean up temp input file
        if temp_input.exists():
            try:
                os.remove(temp_input)
            except:
                pass


def _has_significant_motion(prev_frame, curr_frame, threshold=25, min_area_pct=0.02):
    """
    Check if there's significant motion between two frames.
    Uses frame differencing with Gaussian blur to reduce noise.
    Returns True if more than min_area_pct of pixels changed significantly.
    """
    import numpy as np

    if prev_frame is None:
        return True

    # Convert to grayscale
    gray1 = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)

    # Blur to reduce noise
    gray1 = cv2.GaussianBlur(gray1, (21, 21), 0)
    gray2 = cv2.GaussianBlur(gray2, (21, 21), 0)

    # Absolute difference
    diff = cv2.absdiff(gray1, gray2)

    # Threshold
    _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

    # Calculate percentage of changed pixels
    changed_pct = np.count_nonzero(thresh) / thresh.size

    return changed_pct > min_area_pct


def _has_significant_motion_fast(prev_frame, curr_frame, scale=0.25, threshold=25, min_area_pct=0.02):
    """
    Optimized motion detection — downscales frames before comparison.
    Much faster than full-resolution motion detection.
    """
    import numpy as np

    if prev_frame is None:
        return True

    # Downscale both frames for fast comparison
    h, w = curr_frame.shape[:2]
    small_w, small_h = int(w * scale), int(h * scale)

    gray1 = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)

    gray1 = cv2.resize(gray1, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
    gray2 = cv2.resize(gray2, (small_w, small_h), interpolation=cv2.INTER_LINEAR)

    # Blur to reduce noise (smaller kernel for small images)
    gray1 = cv2.GaussianBlur(gray1, (11, 11), 0)
    gray2 = cv2.GaussianBlur(gray2, (11, 11), 0)

    # Absolute difference
    diff = cv2.absdiff(gray1, gray2)

    # Threshold
    _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

    # Calculate percentage of changed pixels
    changed_pct = np.count_nonzero(thresh) / thresh.size

    return changed_pct > min_area_pct


def _reencode_to_h264(input_path: str, output_path: str):
    """Re-encode video to H.264 codec for browser compatibility."""
    import subprocess

    # Try to get ffmpeg path from imageio-ffmpeg (bundled binary)
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ffmpeg_path = "ffmpeg"  # fallback to system PATH

    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-i", input_path,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",  # required for browser compatibility
                "-movflags", "+faststart",  # enable streaming playback
                "-y",  # overwrite output
                output_path,
            ],
            check=True,
            capture_output=True,
            timeout=300,  # 5 minute timeout
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
        # If ffmpeg fails, copy the mp4v file as fallback
        print(f"[Warning] ffmpeg re-encode failed: {e}. Using mp4v fallback.")
        shutil.copy2(input_path, output_path)


@router.get("/live")
def detect_live_feed():
    """
    Stream MJPEG with YOLO PPE detection overlay on the CCTV feed.
    Uses frame skipping + downscaling for low-latency detection.
    """
    return StreamingResponse(
        _generate_detection_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# Live detection configuration
LIVE_INFER_MAX_DIM = 416         # Downscale frame to this max dimension for inference (416 = fast)
LIVE_JPEG_QUALITY = 70           # Lower quality for faster encoding
LIVE_TARGET_FPS = 20             # Target output FPS
LIVE_MIN_DETECT_INTERVAL = 0.1   # Minimum seconds between YOLO inferences (adaptive)


def _generate_detection_frames():
    """
    Generator that yields MJPEG frames with YOLO detection overlay.
    
    Optimizations:
    - Uses raw BGR frame directly from CameraStream (no JPEG re-decode)
    - Adaptive frame skipping: skips detection if previous inference is still running
    - Downscaling for faster YOLO inference
    - Lower JPEG quality for faster encoding
    - No sleep when frames are immediately available
    """
    from detection import get_detector
    import main as main_module
    import numpy as np
    import time

    detector = get_detector()

    # Ensure camera stream is started
    main_module.camera_stream.start()

    last_annotated_frame = None
    last_frame_id = -1
    last_detect_time = 0
    frame_interval = 1.0 / LIVE_TARGET_FPS

    while True:
        loop_start = time.time()

        # Get raw BGR frame directly — avoids JPEG decode overhead
        raw_frame, frame_id = main_module.camera_stream.get_raw_frame()

        if raw_frame is not None:
            now = time.time()
            time_since_detect = now - last_detect_time

            # Run detection if enough time has passed AND we have a new frame
            should_detect = (
                last_annotated_frame is None or
                (time_since_detect >= LIVE_MIN_DETECT_INTERVAL and frame_id != last_frame_id)
            )

            if should_detect:
                last_frame_id = frame_id
                last_detect_time = now
                try:
                    # Downscale for faster inference
                    h, w = raw_frame.shape[:2]
                    scale = min(LIVE_INFER_MAX_DIM / max(h, w), 1.0)
                    if scale < 1.0:
                        small_frame = cv2.resize(raw_frame, (int(w * scale), int(h * scale)),
                                                 interpolation=cv2.INTER_LINEAR)
                    else:
                        small_frame = raw_frame

                    # Run detection on downscaled frame (no annotation — we draw on full res)
                    _, detections, compliance = detector.detect_frame(small_frame, annotate=False)

                    # Scale detections back to original resolution and draw on full frame
                    if scale < 1.0:
                        for det in detections:
                            det["bbox"] = [int(v / scale) for v in det["bbox"]]
                        for comp in compliance:
                            comp["person_bbox"] = [int(v / scale) for v in comp["person_bbox"]]

                    annotated_frame = detector._draw_annotations(raw_frame.copy(), detections, compliance, lightweight=True)
                    last_annotated_frame = annotated_frame
                except Exception:
                    last_annotated_frame = raw_frame

            # Encode the (possibly cached) annotated frame
            out_frame = last_annotated_frame if last_annotated_frame is not None else raw_frame
            _, buffer = cv2.imencode('.jpg', out_frame,
                                     [cv2.IMWRITE_JPEG_QUALITY, LIVE_JPEG_QUALITY])
            frame_bytes = buffer.tobytes()

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        # Adaptive sleep — maintain target FPS without wasting cycles
        elapsed = time.time() - loop_start
        sleep_time = frame_interval - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)
