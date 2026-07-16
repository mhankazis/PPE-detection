"""
API Router for PPE Detection endpoints.
Handles image upload detection, video upload detection, and live feed with YOLO overlay.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Form
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


def _get_face_recognition_context():
    """
    Lazy-load face recognizer + student name lookup for upload endpoints.
    Returns (face_recognizer_or_None, student_names_dict).
    Returns (None, {}) if no students enrolled or recognizer unavailable.
    """
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        if recognizer.app is None or recognizer.get_cache_size() == 0:
            return None, {}
    except Exception as e:
        print(f"[Detect] Face recognizer init failed: {e}")
        return None, {}

    student_names = {}
    try:
        from database import SessionLocal
        import models
        db = SessionLocal()
        try:
            students = db.query(models.Student).all()
            student_names = {s.id: s.name for s in students}
        finally:
            db.close()
    except Exception as e:
        print(f"[Detect] Failed to load student names: {e}")

    return recognizer, student_names


def _identify_persons_in_compliance(frame, compliance, face_recognizer, student_names):
    """
    Run face recognition on each detected person bbox in `compliance`.
    Mutates each comp dict: adds `identified_student_id` and `identified_name`.
    Expands bbox by 20% if first identification attempt fails (more face context).
    """
    if face_recognizer is None:
        print("[Detect] Face recognizer is None — skipping identification")
        return

    h, w = frame.shape[:2]
    print(f"[Detect] Running face recognition on {len(compliance)} person(s), frame {w}x{h}, cache size={face_recognizer.get_cache_size()}")
    for idx, comp in enumerate(compliance):
        try:
            bbox = comp.get("person_bbox", [])
            if not bbox or len(bbox) != 4:
                print(f"[Detect] Person {idx}: no valid bbox, skipping")
                continue

            print(f"[Detect] Person {idx}: bbox={bbox}")
            student_id = face_recognizer.identify(frame, bbox)

            # Retry with expanded bbox if first attempt failed
            if student_id is None:
                x1, y1, x2, y2 = bbox
                bw, bh = x2 - x1, y2 - y1
                ex1 = max(0, int(x1 - bw * 0.2))
                ey1 = max(0, int(y1 - bh * 0.2))
                ex2 = min(w, int(x2 + bw * 0.2))
                ey2 = min(h, int(y2 + bh * 0.2))
                print(f"[Detect] Person {idx}: retrying with expanded bbox={[ex1, ey1, ex2, ey2]}")
                student_id = face_recognizer.identify(frame, [ex1, ey1, ex2, ey2])

            if student_id is not None:
                comp["identified_student_id"] = student_id
                comp["identified_name"] = student_names.get(student_id, f"ID:{student_id}")
                print(f"[Detect] Person {idx}: identified as {comp['identified_name']} (id={student_id})")
            else:
                print(f"[Detect] Person {idx}: not identified")
        except Exception as e:
            print(f"[Detect] Face recognition error for person: {e}")


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

    # Face recognition: identify each detected person by name
    import numpy as np
    try:
        face_recognizer, student_names = _get_face_recognition_context()
        if face_recognizer is not None:
            # Decode original image for face recognition (annotated bytes may have overlay)
            img_array = np.frombuffer(image_bytes, dtype=np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if frame is not None:
                _identify_persons_in_compliance(frame, compliance, face_recognizer, student_names)
    except Exception as e:
        print(f"[Detect] Image face recognition failed: {e}")

    # Save annotated image
    filename = f"det_{uuid.uuid4().hex[:8]}.jpg"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(annotated_bytes)

    # Build summary
    total_persons = len(compliance)
    compliant = sum(1 for c in compliance if c["is_compliant"])
    non_compliant = total_persons - compliant
    identified_persons = sum(1 for c in compliance if c.get("identified_student_id") is not None)

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
            "identified_persons": identified_persons,
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

    # Save uploaded video to persistent file (kept for annotated re-render)
    video_id = uuid.uuid4().hex[:8]
    raw_suffix = Path(file.filename).suffix or ".mp4"
    temp_input = UPLOAD_DIR / f"src_{video_id}{raw_suffix}"
    try:
        with open(temp_input, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

    # Re-encode original video to H.264 for browser playback
    video_filename = f"vid_{video_id}.mp4"
    video_path = UPLOAD_DIR / video_filename
    _reencode_to_h264(str(temp_input), str(video_path))

    def _process_video():
        """Synchronous video processing — runs in thread pool."""
        detector = get_detector()

        # Face recognition: identify each detected person by name
        face_recognizer, student_names = _get_face_recognition_context()

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

                # Face recognition on the original-resolution frame
                if face_recognizer is not None:
                    _identify_persons_in_compliance(frame, compliance, face_recognizer, student_names)

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
        identified_persons = 0
        identified_names = set()
        from detection import ppe_to_id
        for c in all_compliance:
            for m in c.get("missing_ppe", []):
                all_missing.add(ppe_to_id(m))
            if c.get("identified_student_id") is not None:
                identified_persons += 1
                identified_names.add(c.get("identified_name", f"ID:{c['identified_student_id']}"))

        result = {
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
                "identified_persons": identified_persons,
                "identified_names": sorted(identified_names),
                "violation_types": list(all_missing),
                "fps": fps,
                "duration_seconds": round(frame_count / fps, 1) if fps > 0 else 0,
            }
        }

        # Persist detections metadata so /video-annotated can re-render with burn-in
        try:
            import json
            meta_path = UPLOAD_DIR / f"{video_filename}.json"
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({
                    "video_id": video_id,
                    "source_path": str(temp_input),
                    "fps": fps,
                    "width": width,
                    "height": height,
                    "frame_detections": frame_detections,
                }, f)
        except Exception as e:
            print(f"[Detect] Failed to save video metadata: {e}")

        return result

    try:
        # Run video processing in thread pool to avoid blocking the event loop
        result = await asyncio.to_thread(_process_video)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")


@router.post("/video-annotated")
async def detect_video_annotated(video_filename: str = Form(...)):
    """
    Re-render a previously processed video with annotations (bounding boxes,
    PPE status, identified names) burned into each frame.
    Returns URL to annotated MP4 (H.264).
    """
    import json
    import asyncio

    # Resolve paths
    base_name = Path(video_filename).name  # sanitize (e.g. vid_e8cae7f7.mp4)
    meta_path = UPLOAD_DIR / f"{base_name}.json"

    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Detection metadata not found. Re-upload the video.")

    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read metadata: {e}")

    # Source video is saved as src_{video_id}{ext} during detect_video
    video_id = meta.get("video_id")
    if not video_id:
        raise HTTPException(status_code=404, detail="video_id missing from metadata.")

    src_path = None
    for candidate in UPLOAD_DIR.glob(f"src_{video_id}*"):
        src_path = candidate
        break

    if src_path is None or not src_path.exists():
        raise HTTPException(status_code=404, detail=f"Source video not found for id {video_id}.")

    frame_detections = meta.get("frame_detections", [])
    fps = meta.get("fps", 25.0)
    width = meta.get("width")
    height = meta.get("height")

    def _render():
        cap = cv2.VideoCapture(str(src_path))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open source video")

        out_name = f"ann_{Path(base_name).stem}.mp4"
        out_path = UPLOAD_DIR / out_name
        tmp_path = UPLOAD_DIR / f"tmp_{out_name}"

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(tmp_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            cap.release()
            raise HTTPException(status_code=500, detail="Failed to open video writer")

        # Build frame lookup: frame_number -> detections + compliance
        fd_map = {fd["frame"]: fd for fd in frame_detections}

        # Interpolation state (carry forward last detection until next detected frame)
        last_dets = []
        last_compliance = []
        frame_idx = 0

        CLASS_COLORS = {
            "Person": (255, 206, 86),     # yellow (BGR)
            "Helmet": (74, 222, 128),     # green
            "Uniform": (20, 184, 166),    # teal
            "Hijab": (239, 68, 239),      # fuchsia
            "Glasses": (0, 194, 255),     # orange-ish
        }

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1

            fd = fd_map.get(frame_idx)
            if fd is not None:
                last_dets = fd.get("detections", [])
                last_compliance = fd.get("compliance", [])

            annotated = frame.copy()

            # Draw detection boxes
            for det in last_dets:
                label = det.get("label", "")
                x1, y1, x2, y2 = det.get("bbox", [0, 0, 0, 0])
                color = CLASS_COLORS.get(label, (255, 255, 255))
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                # Label tag
                tag = f"{label} {det.get('confidence', 0) * 100:.0f}%"
                (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 4, y1), color, -1)
                cv2.putText(annotated, tag, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

            # Draw compliance status + name per person
            for comp in last_compliance:
                from detection import ppe_to_id
                x1, y1, x2, y2 = comp.get("person_bbox", [0, 0, 0, 0])
                status_text = "APD LENGKAP" if comp.get("is_compliant") else f"KURANG: {', '.join(ppe_to_id(m) for m in comp.get('missing_ppe', []))}"
                bg = (22, 163, 74) if comp.get("is_compliant") else (220, 38, 38)

                # Status bar (below person box)
                (stw, sth), _ = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                bar_w = stw + 12
                bar_y = min(height - 1, y2)
                cv2.rectangle(annotated, (x1, bar_y), (x1 + bar_w, bar_y + 22), bg, -1)
                cv2.putText(annotated, status_text, (x1 + 6, bar_y + 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

                # Name bar (above person box)
                name = comp.get("identified_name")
                if name:
                    name_text = f"ID: {name}"
                    (nw, nh), _ = cv2.getTextSize(name_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    nbar_w = nw + 12
                    nbar_y = max(0, y1 - 22)
                    cv2.rectangle(annotated, (x1, nbar_y), (x1 + nbar_w, nbar_y + 22), (37, 99, 235), -1)
                    cv2.putText(annotated, name_text, (x1 + 6, nbar_y + 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

            writer.write(annotated)

        cap.release()
        writer.release()

        # Re-encode to H.264 for browser compatibility
        _reencode_to_h264(str(tmp_path), str(out_path))
        try:
            os.remove(tmp_path)
        except Exception:
            pass

        return {"success": True, "annotated_video_url": f"/.uploads/detections/{out_name}"}

    try:
        result = await asyncio.to_thread(_render)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Annotated render failed: {str(e)}")


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


# Live detection configuration — tuned for low-latency real-time detection.
# Using camera sub-stream (768x432) keeps YOLO input small; these values
# balance smoothness vs inference cost on CPU/GPU.
LIVE_INFER_MAX_DIM = 640         # Downscale frame to this max dimension for inference (640 = YOLO native, good accuracy)
LIVE_JPEG_QUALITY = 65           # Lower quality for faster encoding + smaller MJPEG payload
LIVE_TARGET_FPS = 10             # Target output FPS — realistic for YOLO + face recognition per frame
LIVE_MIN_DETECT_INTERVAL = 0.35  # Min seconds between YOLO inferences.
                                 # On CPU YOLO ~180ms; 0.35s lets ~3 frames reuse
                                 # last annotation → smoother stream, detection ~3 FPS.
LIVE_FACE_REC_INTERVAL = 0.6     # Run face recognition at most every N seconds (heavy model, throttle it)
LIVE_FACE_DET_SIZE = 320         # InsightFace det_size for live (lower = faster, minor accuracy tradeoff)


# --- Live performance metrics (EMA-based, near-zero overhead) ---
# Updated by _generate_detection_frames each detection cycle. Read via
# /api/perf/live-metrics endpoint. Single writer (generator) → no lock needed.
_live_metrics = {
    "fps": 0.0,                # EMA frames-per-second (end-to-end loop)
    "inference_ms": 0.0,       # EMA YOLO + postprocess time per detection
    "total_ms": 0.0,           # EMA full loop time (grab + infer + encode)
    "frame_count": 0,          # total frames yielded since stream start
    "last_frame_ts": 0.0,      # unix ts of last yielded frame
    "width": 0,                # stream resolution width
    "height": 0,               # stream resolution height
    "detections_per_frame": 0, # EMA count of detections per frame
}


def update_live_metrics(infer_ms: float, total_ms: float, frame_w: int, frame_h: int, num_dets: int) -> None:
    """Update EMA metrics. Called once per detection cycle."""
    alpha = 0.1  # smoothing factor — 10% new, 90% old
    _live_metrics["inference_ms"] = _live_metrics["inference_ms"] * (1 - alpha) + infer_ms * alpha
    _live_metrics["total_ms"] = _live_metrics["total_ms"] * (1 - alpha) + total_ms * alpha
    _live_metrics["detections_per_frame"] = _live_metrics["detections_per_frame"] * (1 - alpha) + num_dets * alpha
    _live_metrics["width"] = frame_w
    _live_metrics["height"] = frame_h
    _live_metrics["frame_count"] += 1
    _live_metrics["last_frame_ts"] = time.time()
    # FPS from total_ms (end-to-end): 1000 / total_ms
    if _live_metrics["total_ms"] > 0:
        _live_metrics["fps"] = 1000.0 / _live_metrics["total_ms"]


def reset_live_metrics() -> None:
    """Reset metrics when stream stops."""
    _live_metrics["fps"] = 0.0
    _live_metrics["inference_ms"] = 0.0
    _live_metrics["total_ms"] = 0.0
    _live_metrics["frame_count"] = 0
    _live_metrics["last_frame_ts"] = 0.0
    _live_metrics["detections_per_frame"] = 0.0


def _generate_detection_frames():
    """
    Generator that yields MJPEG frames with YOLO detection overlay.
    
    Optimizations:
    - Uses raw BGR frame directly from CameraStream (no JPEG re-decode)
    - Adaptive frame skipping: skips detection if previous inference is still running
    - Downscaling for faster YOLO inference
    - Lower JPEG quality for faster encoding
    - No sleep when frames are immediately available
    - EMA metrics instrumentation (near-zero overhead)
    """
    from detection import get_detector
    import main as main_module
    import numpy as np
    import time

    detector = get_detector()

    # Lazy-load face recognizer (only when students are enrolled)
    face_recognizer = None
    student_names = {}  # {student_id: name} lookup for display
    try:
        from face_recognition import get_recognizer
        face_recognizer = get_recognizer()
        if face_recognizer.get_cache_size() == 0:
            face_recognizer = None  # No students enrolled, skip face recognition
        else:
            # Lower det_size for live feed — faster inference, minor accuracy tradeoff
            face_recognizer.set_det_size(LIVE_FACE_DET_SIZE)
    except Exception as e:
        print(f"[LiveDetect] Face recognizer init failed: {e}")
        face_recognizer = None

    # Load student name lookup from DB
    if face_recognizer is not None:
        try:
            from database import SessionLocal
            import models
            db = SessionLocal()
            try:
                students = db.query(models.Student).all()
                student_names = {s.id: s.name for s in students}
                print(f"[LiveDetect] Loaded {len(student_names)} student names for face recognition display")
            finally:
                db.close()
        except Exception as e:
            print(f"[LiveDetect] Failed to load student names: {e}")

    # Ensure camera stream is started
    main_module.camera_stream.start()

    last_annotated_frame = None
    last_detections = []      # Cached detections for skip-frame redraw
    last_compliance = []      # Cached compliance for skip-frame redraw
    last_frame_id = -1
    last_detect_time = 0
    last_face_rec_time = 0.0  # Throttle face recognition (heavy model)
    # Cache last identified student per bbox-center key to avoid re-running
    # InsightFace every frame when the person hasn't moved.
    # {bbox_key: (student_id, name)}
    face_id_cache = {}
    frame_interval = 1.0 / LIVE_TARGET_FPS

    # --- Auto-violation logging via ViolationLogger state machine ---
    # Replaces flat debounce with: temporal buffer (5s persist) + known face
    # cooldown (300s) + unknown tracker permanent lock. See violation_logger.py.
    from violation_logger import ViolationLogger

    VIOLATION_LOG_DIR = Path(".uploads/logs")
    VIOLATION_LOG_DIR.mkdir(parents=True, exist_ok=True)

    class _LiveViolationLogger(ViolationLogger):
        """ViolationLogger subclass that persists to DB + triggers siren."""

        # Hard cap: minimum seconds between ANY two unknown-person logs.
        # Prevents spam when tracker ID changes (person leaves/re-enters frame,
        # brief occlusion, detection miss). 5 min = same as known-face cooldown.
        UNKNOWN_GLOBAL_COOLDOWN = 300.0

        def __init__(self, student_names_map):
            super().__init__()
            self._student_names = student_names_map
            self._last_cleanup = 0.0
            self._last_unknown_log = 0.0  # timestamp of last unknown log

        def _save_to_database(self, tracker_id, face_id, timestamp):
            import random
            # face_id format from caller: "student:<id>" or "Unknown"
            student_id = None
            if face_id.startswith("student:"):
                try:
                    student_id = int(face_id.split(":", 1)[1])
                except (ValueError, IndexError):
                    student_id = None
            else:
                # Unknown person — apply global cooldown hard cap.
                if timestamp - self._last_unknown_log < self.UNKNOWN_GLOBAL_COOLDOWN:
                    return  # throttled — too soon since last unknown log
                self._last_unknown_log = timestamp

            try:
                from database import SessionLocal
                db = SessionLocal()
                try:
                    # Snapshot already captured by caller via set_evidence_frame
                    img = self._evidence_frame
                    log_number = f"V-{random.randint(1000, 9999)}"
                    label_id = student_id if student_id is not None else tracker_id
                    img_filename = f"{log_number}_{int(timestamp)}_{label_id}.jpg"
                    img_path = VIOLATION_LOG_DIR / img_filename
                    if img is not None:
                        cv2.imwrite(str(img_path), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    else:
                        img_path = None

                    # Reconstruct missing PPE list from evidence context
                    from detection import ppe_to_id
                    missing = self._evidence_missing.get(tracker_id, [])
                    missing_id = [ppe_to_id(m) for m in missing]
                    severity = "High" if len(missing) >= 2 else "Medium" if len(missing) == 1 else "Low"
                    violation_type = f"Kurang: {', '.join(missing_id)}" if missing_id else "PPE Violation"

                    new_log = models.Log(
                        log_number=log_number,
                        violation_type=violation_type,
                        camera_id=None,
                        student_id=student_id,
                        severity=severity,
                        status="Belum Dihukum",
                        image_path=str(img_path) if img_path else None,
                    )
                    db.add(new_log)
                    db.commit()

                    student_label = (
                        self._student_names.get(student_id, f"ID:{student_id}")
                        if student_id else "Unknown"
                    )
                    print(f"[LiveDetect] Violation logged: {student_label} — {violation_type} ({severity})")

                    # Trigger EZVIZ siren if enabled
                    try:
                        from ezviz_alarm import trigger_siren
                        trigger_siren()
                    except Exception as e:
                        print(f"[LiveDetect] EZVIZ siren trigger skipped: {e}")
                finally:
                    db.close()
            except Exception as e:
                print(f"[LiveDetect] Failed to log violation: {e}")

    violation_state = _LiveViolationLogger(student_names)
    # Stash latest annotated frame + per-tracker missing PPE for the save hook
    violation_state._evidence_frame = None
    violation_state._evidence_missing = {}

    def _log_violation(comp, annotated_img):
        """Feed one observation through the ViolationLogger state machine."""
        student_id = comp.get("identified_student_id")
        # Prefer real ByteTrack ID; fall back to bbox-center pseudo-tracker
        # if tracker lost this person (box.id None on first frame / occlusion).
        tracker_id = comp.get("tracker_id")
        if tracker_id is None:
            px1, py1, px2, py2 = comp["person_bbox"]
            cx, cy = (px1 + px2) // 2, (py1 + py2) // 2
            tracker_id = (cx // 40) * 100000 + (cy // 40)

        face_id = f"student:{student_id}" if student_id is not None else "Unknown"

        # Remember missing PPE list so _save_to_database can rebuild message
        violation_state._evidence_missing[tracker_id] = comp.get("missing_ppe", [])
        violation_state._evidence_frame = annotated_img

        violation_state.process(
            tracker_id=tracker_id,
            face_id=face_id,
            is_violating=not comp["is_compliant"],
        )

        # Periodic cleanup once per minute
        now = time.time()
        if now - violation_state._last_cleanup > 60:
            violation_state._last_cleanup = now
            violation_state.cleanup(now)

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
                _t_infer_start = time.time()
                try:
                    # Run YOLO with ByteTrack tracking — assigns stable tracker_id
                    # per person across frames (replaces bbox-center pseudo-tracker).
                    _, detections, compliance = detector.detect_frame_tracked(raw_frame, annotate=False)
                    _t_infer_end = time.time()
                    last_detections = detections
                    last_compliance = compliance

                    annotated_frame = detector._draw_annotations(raw_frame.copy(), detections, compliance, lightweight=True)

                    # Face recognition — THROTTLED for low latency.
                    # InsightFace is heavy; running it every frame stalls the MJPEG stream.
                    # Strategy:
                    #   1. Run at most every LIVE_FACE_REC_INTERVAL seconds.
                    #   2. Cache identity per bbox-center between runs so labels persist.
                    #   3. No bbox-expand retry in live mode (saves ~50% face-rec time).
                    run_face_rec = (
                        face_recognizer is not None and
                        (now - last_face_rec_time) >= LIVE_FACE_REC_INTERVAL
                    )
                    if run_face_rec:
                        last_face_rec_time = now
                        face_id_cache.clear()  # refresh cache this cycle

                    for comp in compliance:
                        px1, py1, px2, py2 = comp["person_bbox"]
                        # Cache key: prefer real ByteTrack tracker_id (stable across
                        # movement); fall back to quantized bbox center if tracker
                        # lost this person (first frame / brief occlusion).
                        tracker_id = comp.get("tracker_id")
                        if tracker_id is not None:
                            bbox_key = ("tid", tracker_id)
                        else:
                            cx, cy = (px1 + px2) // 2, (py1 + py2) // 2
                            bbox_key = (cx // 40, cy // 40)

                        student_id = None
                        if run_face_rec:
                            try:
                                student_id = face_recognizer.identify(raw_frame, comp["person_bbox"])
                            except Exception as e:
                                print(f"[LiveDetect] Face recognition error: {e}")
                            if student_id is not None:
                                student_name = student_names.get(student_id, f"ID:{student_id}")
                                face_id_cache[bbox_key] = (student_id, student_name)
                        else:
                            cached = face_id_cache.get(bbox_key)
                            if cached is not None:
                                student_id, student_name = cached

                        if student_id is not None:
                            comp["identified_student_id"] = student_id
                            # Draw student name label above person box
                            frame_w = annotated_frame.shape[1]
                            sf = max(frame_w / 640, 1.0)
                            name_scale = 0.7 * sf
                            name_thick = max(2, int(2 * sf))
                            pad = int(6 * sf)
                            (text_w, text_h), _ = cv2.getTextSize(student_name, cv2.FONT_HERSHEY_SIMPLEX, name_scale, name_thick)
                            cv2.rectangle(annotated_frame, (px1, py1 - text_h - pad * 3), (px1 + text_w + pad * 2, py1 - pad), (0, 0, 0), -1)
                            cv2.putText(annotated_frame, student_name,
                                        (px1 + pad, py1 - pad * 2), cv2.FONT_HERSHEY_SIMPLEX,
                                        name_scale, (0, 255, 255), name_thick, cv2.LINE_AA)

                    # Auto-log violations for non-compliant persons (with debounce)
                    for comp in compliance:
                        if not comp["is_compliant"]:
                            _log_violation(comp, annotated_frame)

                    # Release violation state for trackers that disappeared this
                    # cycle (person left frame). Frees the permanent lock so the
                    # tracker ID can be safely reused by ByteTrack later.
                    for tid in getattr(detector, "_last_disappeared_trackers", ()):
                        violation_state.forget_tracker(tid)
                    detector._last_disappeared_trackers = set()

                    last_annotated_frame = annotated_frame
                except Exception as e:
                    import traceback
                    if not hasattr(_generate_detection_frames, "_logged_err"):
                        _generate_detection_frames._logged_err = 0
                    _generate_detection_frames._logged_err += 1
                    if _generate_detection_frames._logged_err <= 3:
                        print(f"[LiveDetect] detect_frame FAILED: {type(e).__name__}: {e}")
                        traceback.print_exc()
                    last_annotated_frame = raw_frame

            # Build output frame:
            # - If we just ran detection this cycle → use fresh annotated_frame
            # - If skipping (between detections) → redraw CACHED detections on
            #   the LATEST raw frame. This keeps the video motion live/smooth
            #   while only paying YOLO cost every LIVE_MIN_DETECT_INTERVAL.
            if last_annotated_frame is not None and not should_detect and last_detections:
                out_frame = detector._draw_annotations(
                    raw_frame.copy(), last_detections, last_compliance, lightweight=True
                )
            else:
                out_frame = last_annotated_frame if last_annotated_frame is not None else raw_frame
            _, buffer = cv2.imencode('.jpg', out_frame,
                                     [cv2.IMWRITE_JPEG_QUALITY, LIVE_JPEG_QUALITY])
            frame_bytes = buffer.tobytes()

            # Update live metrics (only when detection ran this cycle)
            if should_detect:
                _t_total_end = time.time()
                _infer_ms = (_t_infer_end - _t_infer_start) * 1000.0
                _total_ms = (_t_total_end - loop_start) * 1000.0
                _h, _w = raw_frame.shape[:2]
                update_live_metrics(
                    infer_ms=_infer_ms,
                    total_ms=_total_ms,
                    frame_w=_w,
                    frame_h=_h,
                    num_dets=len(last_detections),
                )

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        else:
            # Camera disconnected — yield the error frame so browser doesn't hang
            error_frame = main_module.camera_stream.get_frame()
            if error_frame is not None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + error_frame + b'\r\n')
            else:
                # No frame at all — yield a placeholder
                import numpy as np
                placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, "Waiting for camera...", (100, 250),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2, cv2.LINE_AA)
                _, buf = cv2.imencode('.jpg', placeholder)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
            time.sleep(0.5)  # Slow poll when camera is offline

        # Adaptive sleep — maintain target FPS without wasting cycles
        elapsed = time.time() - loop_start
        sleep_time = frame_interval - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)
