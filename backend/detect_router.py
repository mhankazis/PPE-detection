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
    Upload a video, run frame-by-frame PPE detection, and return annotated video.
    Returns JSON with URL to annotated video and summary statistics.
    """
    from detection import get_detector
    import subprocess

    # Validate file type
    allowed_types = ["video/mp4", "video/avi", "video/x-msvideo", "video/quicktime", "video/x-matroska"]
    if file.content_type and file.content_type not in allowed_types:
        # Be lenient — some browsers send wrong MIME types
        pass

    # Save uploaded video to temp file
    temp_input = UPLOAD_DIR / f"tmp_in_{uuid.uuid4().hex[:8]}{Path(file.filename).suffix}"
    try:
        with open(temp_input, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

    # Output files
    output_filename = f"det_{uuid.uuid4().hex[:8]}.mp4"
    output_path = UPLOAD_DIR / output_filename
    temp_output = UPLOAD_DIR / f"tmp_out_{uuid.uuid4().hex[:8]}.mp4"

    try:
        detector = get_detector()

        # Open input video
        cap = cv2.VideoCapture(str(temp_input))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Write with mp4v first (reliable with OpenCV)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(temp_output), fourcc, fps, (width, height))

        frame_count = 0
        all_compliance = []
        last_annotated_frame = None
        # Process every Nth frame for speed
        process_interval = max(1, int(fps / 10))  # ~10 detections per second

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            if frame_count % process_interval == 0 or frame_count == 1:
                annotated_frame, detections, compliance = detector.detect_frame(frame)
                all_compliance.extend(compliance)
                last_annotated_frame = annotated_frame
                out.write(annotated_frame)
            else:
                # For non-key frames, write original frame
                out.write(frame)

        cap.release()
        out.release()

        # Re-encode to H.264 for browser compatibility
        _reencode_to_h264(str(temp_output), str(output_path))

        # Build summary
        total_persons = len(all_compliance)
        compliant = sum(1 for c in all_compliance if c["is_compliant"])
        non_compliant = total_persons - compliant

        # Collect unique violation types
        all_missing = set()
        for c in all_compliance:
            for m in c.get("missing_ppe", []):
                all_missing.add(m)

        return {
            "success": True,
            "annotated_video_url": f"/.uploads/detections/{output_filename}",
            "summary": {
                "total_frames": frame_count,
                "frames_analyzed": frame_count // process_interval + 1,
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
        # Clean up temp files
        for tmp in [temp_input, temp_output]:
            if tmp.exists():
                try:
                    os.remove(tmp)
                except:
                    pass


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
