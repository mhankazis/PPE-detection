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


@router.post("/video")
async def detect_video(file: UploadFile = File(...)):
    """
    Upload a video, run smart frame-by-frame PPE detection with motion detection.
    Only re-detects when significant movement is detected.
    Returns JSON with per-frame detection data and URL to browser-playable video.
    """
    from detection import get_detector
    import numpy as np

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

    try:
        detector = get_detector()

        # Open video for frame processing
        cap = cv2.VideoCapture(str(temp_input))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frame_count = 0
        frames_detected = 0
        frames_skipped = 0
        frame_detections = []
        all_compliance = []

        prev_detection_frame = None  # frame used for last detection (for motion comparison)
        last_detections = []
        last_compliance = []

        # Periodic forced detection interval (in frames) — every 2 seconds
        forced_interval = max(1, int(fps * 2))

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
                _has_significant_motion(prev_detection_frame, frame)  # Motion detected
            )

            if should_detect:
                _, detections, compliance = detector.detect_frame(frame)
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
    """
    return StreamingResponse(
        _generate_detection_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


def _generate_detection_frames():
    """Generator that yields MJPEG frames with YOLO detection overlay."""
    from detection import get_detector
    import main as main_module

    detector = get_detector()

    # Ensure camera stream is started
    main_module.camera_stream.start()

    import numpy as np

    while True:
        frame_bytes = main_module.camera_stream.get_frame()
        if frame_bytes is not None:
            # Decode the JPEG frame from camera stream
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is not None:
                try:
                    annotated_frame, _, _ = detector.detect_frame(frame)
                    _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    frame_bytes = buffer.tobytes()
                except Exception:
                    pass  # If detection fails, send original frame

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        # Limit to ~15fps for detection (YOLO inference takes time)
        time.sleep(0.066)
