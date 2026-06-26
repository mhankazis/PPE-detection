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
        for c in all_compliance:
            for m in c.get("missing_ppe", []):
                all_missing.add(m)
            if c.get("identified_student_id") is not None:
                identified_persons += 1
                identified_names.add(c.get("identified_name", f"ID:{c['identified_student_id']}"))

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
                "identified_persons": identified_persons,
                "identified_names": sorted(identified_names),
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

    # --- Auto-violation logging with debounce ---
    # Tracks last log time per (student_id, violation_type) or (bbox_hash, violation_type)
    # to prevent spamming the database with duplicate violations.
    VIOLATION_COOLDOWN = 60.0  # seconds — minimum time between same violation for same person
    _violation_log_times = {}  # key: (identifier, violation_key) -> last_log_timestamp
    VIOLATION_LOG_DIR = Path(".uploads/logs")
    VIOLATION_LOG_DIR.mkdir(parents=True, exist_ok=True)

    def _log_violation(comp, annotated_img):
        """Create a violation log entry in the database with debounce protection."""
        import random
        student_id = comp.get("identified_student_id")
        missing = comp.get("missing_ppe", [])
        violation_key = ",".join(sorted(missing))

        # Build identifier: use student_id if identified, else bbox hash for anonymous tracking
        if student_id is not None:
            identifier = f"student:{student_id}"
        else:
            # Hash the bbox to track anonymous persons by location
            bbox = comp.get("person_bbox", [])
            identifier = f"anon:{hash(tuple(bbox))}"

        # Debounce check — skip if same violation was logged recently for this person
        cache_key = (identifier, violation_key)
        now = time.time()
        last_log = _violation_log_times.get(cache_key, 0)
        if now - last_log < VIOLATION_COOLDOWN:
            return  # Cooldown not elapsed — skip

        try:
            from database import SessionLocal
            db = SessionLocal()
            try:
                # Save annotated frame as evidence
                log_number = f"V-{random.randint(1000, 9999)}"
                img_filename = f"{log_number}_{int(now)}_{identifier.split(':')[1]}.jpg"
                img_path = VIOLATION_LOG_DIR / img_filename
                cv2.imwrite(str(img_path), annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])

                # Determine severity based on missing items
                severity = "High" if len(missing) >= 2 else "Medium" if len(missing) == 1 else "Low"
                violation_type = f"Kurang: {', '.join(missing)}"

                new_log = models.Log(
                    log_number=log_number,
                    violation_type=violation_type,
                    camera_id=None,
                    student_id=student_id,
                    severity=severity,
                    status="Belum Dihukum",
                    image_path=str(img_path)
                )
                db.add(new_log)
                db.commit()

                # Update debounce tracker
                _violation_log_times[cache_key] = now

                # Cleanup old entries from tracker (keep last 100)
                if len(_violation_log_times) > 100:
                    sorted_keys = sorted(_violation_log_times.items(), key=lambda x: x[1])
                    for k, _ in sorted_keys[:len(sorted_keys) - 100]:
                        del _violation_log_times[k]

                student_label = student_names.get(student_id, f"ID:{student_id}") if student_id else "Unknown"
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
                    # Run YOLO directly on raw frame — YOLO handles internal resizing (imgsz=640)
                    # No manual downscale needed; YOLO's internal resize is optimized
                    _, detections, compliance = detector.detect_frame(raw_frame, annotate=False)
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
                        # Stable key from bbox center (quantized) — survives minor jitter
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
