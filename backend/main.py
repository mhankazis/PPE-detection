from fastapi import FastAPI, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time

app = FastAPI(title="PPE Detection API (YOLOv11 Backend)")

# Database and Auth setup
import models
from database import engine
from auth import router as auth_router, get_current_user
from students import router as students_router
from logs import router as logs_router
from detect_router import router as detect_router

# Create tables if they don't exist (optional, but good for setup)
models.Base.metadata.create_all(bind=engine)

app.include_router(auth_router)
app.include_router(students_router)
app.include_router(logs_router)
app.include_router(detect_router)


# EZVIZ Alarm Configuration API
class EzvizConfigRequest(BaseModel):
    enabled: bool = None
    email: str = None
    password: str = None
    device_serial: str = None
    siren_duration: int = None

@app.get("/api/ezviz-config")
def get_ezviz_config(current_user: models.User = Depends(get_current_user)):
    from ezviz_alarm import get_config
    return get_config()

@app.put("/api/ezviz-config")
def update_ezviz_config(body: EzvizConfigRequest, current_user: models.User = Depends(get_current_user)):
    from ezviz_alarm import update_config
    update_config(
        enabled=body.enabled,
        email=body.email,
        password=body.password,
        device_serial=body.device_serial,
        siren_duration=body.siren_duration,
    )
    return {"message": "Konfigurasi EZVIZ berhasil diperbarui"}

@app.post("/api/ezviz-test")
def test_ezviz_siren(current_user: models.User = Depends(get_current_user)):
    from ezviz_alarm import trigger_siren
    trigger_siren()
    return {"message": "Alarm test dikirim — browser akan membunyikan siren"}

@app.get("/api/alarm/status")
def alarm_status():
    """Poll endpoint for frontend to check if alarm should sound."""
    from ezviz_alarm import get_alarm_status
    return get_alarm_status()

@app.post("/api/alarm/acknowledge")
def alarm_acknowledge(current_user: models.User = Depends(get_current_user)):
    """Stop alarm sound (operator acknowledged)."""
    from ezviz_alarm import acknowledge_alarm
    acknowledge_alarm()
    return {"message": "Alarm dihentikan"}


@app.on_event("startup")
def startup_preload():
    """Preload YOLO model and student face embeddings on app startup."""
    # Preload YOLO PPE detection model
    try:
        from detection import get_detector
        detector = get_detector()
        if detector.model is not None:
            print("[Startup] YOLO PPE detector loaded and ready.")
        else:
            print("[Startup] WARNING: YOLO model failed to load — detection will not work.")
    except Exception as e:
        print(f"[Startup] YOLO preload failed: {e}")

    # Preload student face embeddings
    from database import SessionLocal
    try:
        from face_recognition import preload_student_embeddings
        db = SessionLocal()
        try:
            preload_student_embeddings(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[Startup] Face recognition preload skipped: {e}")


@app.get("/api/face-status")
def face_recognition_status():
    """Return face recognition model + cache status."""
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        return {
            "enabled": recognizer.app is not None,
            "enrolled_students": recognizer.get_cache_size(),
            "model_loaded": recognizer.app is not None,
        }
    except Exception as e:
        return {"enabled": False, "enrolled_students": 0, "model_loaded": False, "error": str(e)}


@app.get("/api/face-diag")
def face_recognition_diagnostic():
    """TEMP diagnostic: run identify() on first dataset photo using server recognizer."""
    import os, cv2, numpy as np
    from face_recognition import get_recognizer, SIMILARITY_THRESHOLD, MIN_FACE_SIZE
    recognizer = get_recognizer()
    result = {
        "model_loaded": recognizer.app is not None,
        "cache_size": recognizer.get_cache_size(),
        "threshold": SIMILARITY_THRESHOLD,
        "min_face_size": MIN_FACE_SIZE,
        "raw_embeddings_keys": list(recognizer._raw_embeddings.keys()),
        "cache_keys": list(recognizer.embedding_cache.keys()),
        "tests": [],
    }
    dataset_dir = ".uploads/dataset"
    if not os.path.isdir(dataset_dir):
        result["error"] = f"Dataset dir not found: {dataset_dir}"
        return result
    photos = sorted([f for f in os.listdir(dataset_dir) if f.endswith(".jpg")])[:5]
    for fname in photos:
        fpath = os.path.join(dataset_dir, fname)
        img = cv2.imread(fpath)
        if img is None:
            result["tests"].append({"file": fname, "error": "cannot read"})
            continue
        h, w = img.shape[:2]
        # Detect faces in full image
        faces = recognizer.app.get(img) if recognizer.app else []
        face_info = [{"bbox": [int(v) for v in f.bbox], "size": int(f.bbox[2]-f.bbox[0])} for f in faces]
        test = {"file": fname, "img_size": [w, h], "faces_found": len(faces), "face_details": face_info}
        if faces:
            # Compute similarity to all cached embeddings
            best_face = max(faces, key=lambda f: f.bbox[2]-f.bbox[0])
            query = best_face.normed_embedding
            sims = {}
            with recognizer._cache_lock:
                for sid, emb in recognizer.embedding_cache.items():
                    sims[sid] = round(float(np.dot(query, emb)), 4)
            test["similarities"] = sims
            test["identified"] = max(sims, key=sims.get) if sims else None
        result["tests"].append(test)
    return result


@app.post("/api/face-reload")
def face_recognition_reload(current_user: models.User = Depends(get_current_user)):
    """Reload InsightFace model without restarting server. Admin/operator only."""
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        ok = recognizer.reload_model()
        return {
            "success": ok,
            "model_loaded": recognizer.app is not None,
            "enrolled_students": recognizer.get_cache_size(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/dashboard")
def dashboard_stats(range_type: str = "today", date: str = None, severity: str = None):
    """Return dashboard statistics from the database.

    Query params:
      - range_type: "today" | "week" | "month" | "all"  (default: today)
      - date:       "YYYY-MM-DD" — anchor date for the range (default: today)
      - severity:   "Low" | "Medium" | "High" | "Critical" — filter recent list (default: none)
    """
    from database import SessionLocal
    from datetime import datetime, timedelta, date as date_cls

    db = SessionLocal()
    try:
        # Parse anchor date
        if date:
            try:
                anchor = datetime.strptime(date, "%Y-%m-%d").date()
            except ValueError:
                anchor = datetime.now().date()
        else:
            anchor = datetime.now().date()

        # Determine window
        if range_type == "today":
            window_start = datetime.combine(anchor, datetime.min.time())
            window_end = datetime.combine(anchor + timedelta(days=1), datetime.min.time())
            span_days = 1
        elif range_type == "week":
            # 7 days ending at anchor (inclusive)
            window_start = datetime.combine(anchor - timedelta(days=6), datetime.min.time())
            window_end = datetime.combine(anchor + timedelta(days=1), datetime.min.time())
            span_days = 7
        elif range_type == "month":
            # 30 days ending at anchor (inclusive)
            window_start = datetime.combine(anchor - timedelta(days=29), datetime.min.time())
            window_end = datetime.combine(anchor + timedelta(days=1), datetime.min.time())
            span_days = 30
        else:  # all
            window_start = None
            window_end = None
            span_days = 30

        def in_window(q):
            if window_start is not None:
                q = q.filter(models.Log.timestamp >= window_start)
            if window_end is not None:
                q = q.filter(models.Log.timestamp < window_end)
            return q

        # Violations within window
        violations_in_window = in_window(db.query(models.Log)).count()

        # Total violations all time
        violations_total = db.query(models.Log).count()

        # Total students
        total_students = db.query(models.Student).count()

        # Unresolved / resolved within window
        unresolved = in_window(db.query(models.Log)).filter(models.Log.status == "Belum Dihukum").count()
        resolved = in_window(db.query(models.Log)).filter(models.Log.status == "Sudah Dihukum").count()

        # Compliance rate within window
        compliance_rate = round((resolved / violations_in_window * 100) if violations_in_window > 0 else 100, 1)

        # Severity breakdown within window
        severity_counts = {}
        for sev in ["Low", "Medium", "High", "Critical"]:
            severity_counts[sev] = in_window(db.query(models.Log)).filter(models.Log.severity == sev).count()

        # Recent 5 violations within window (optionally filtered by severity)
        recent_q = in_window(db.query(models.Log))
        if severity:
            recent_q = recent_q.filter(models.Log.severity == severity)
        recent_q = recent_q.order_by(models.Log.timestamp.desc()).limit(5)
        recent_list = []
        for log in recent_q.all():
            ts = log.timestamp
            student_name = log.student.name if log.student else "Unknown"
            recent_list.append({
                "id": log.log_number,
                "time": ts.strftime("%I:%M %p") if ts else "",
                "date": ts.strftime("%Y-%m-%d") if ts else "",
                "camera": log.camera.name if log.camera else "Main Camera",
                "type": log.violation_type,
                "severity": log.severity,
                "student": student_name,
                "status": log.status,
            })

        # Daily violations chart — last `span_days` days ending at anchor
        daily = []
        for i in range(span_days - 1, -1, -1):
            d = anchor - timedelta(days=i)
            d_start = datetime.combine(d, datetime.min.time())
            d_end = datetime.combine(d + timedelta(days=1), datetime.min.time())
            count_q = db.query(models.Log).filter(models.Log.timestamp >= d_start, models.Log.timestamp < d_end)
            if severity:
                count_q = count_q.filter(models.Log.severity == severity)
            count = count_q.count()
            daily.append({
                "date": d.strftime("%Y-%m-%d"),
                "day": d.strftime("%a") if span_days <= 7 else d.strftime("%d/%m"),
                "count": count,
            })

        return {
            "violations_today": violations_in_window,
            "violations_total": violations_total,
            "total_students": total_students,
            "unresolved": unresolved,
            "resolved": resolved,
            "compliance_rate": compliance_rate,
            "severity_counts": severity_counts,
            "recent_violations": recent_list,
            "daily_violations": daily,
            "range": range_type,
            "anchor_date": anchor.strftime("%Y-%m-%d"),
        }
    finally:
        db.close()

# Mount a directory to serve uploaded images statically
from fastapi.staticfiles import StaticFiles
import os
os.makedirs(".uploads/students", exist_ok=True)
os.makedirs(".uploads/detections", exist_ok=True)
app.mount("/.uploads", StaticFiles(directory=".uploads"), name="uploads")
# Also mount /uploads to .uploads for backward compatibility with existing DB entries
app.mount("/uploads", StaticFiles(directory=".uploads"), name="uploads_legacy")

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "YOLOv11 Backend System Operational"}

from fastapi.responses import StreamingResponse
import cv2

# Credentials provided:
# username: mhankazis@gmail.com (URL encoded as mhankazis%40gmail.com)
# password: Skripsi22
# Verification code (often used for EZVIZ cameras with username 'admin'): OGXCCS

# Option 1: Tapo/General RTSP with account
#CAMERA_URL = "rtsp://mhankazis%40gmail.com:Skripsi22@192.168.1.26:554/stream1"

# Option 2: Ezviz/Other cameras using Verification Code
# EZVIZ RTSP auth: admin password = device verification code (OGXCCS), NOT the app account password.
#
# Stream choice (verified via probe):
#   /H.264                  -> main stream 2880x1616 (heavy for real-time detection)
#   /Streaming/Channels/102 -> sub  stream 768x432   (4x lighter, ideal for live detection)
# Using sub stream so YOLO + face recognition stay responsive when Detection ON.
CAMERA_URL = "rtsp://admin:OGXCCS@192.168.1.26:554/Streaming/Channels/102"
# Main stream kept as fallback (higher quality for evidence snapshots if needed)
CAMERA_URL_MAIN = "rtsp://admin:OGXCCS@192.168.1.26:554/H.264"

def create_error_frame(message):
    import numpy as np
    # Create a black image
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Add text
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(frame, "Stream Error:", (50, 200), font, 1, (0, 0, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, message, (50, 250), font, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    ret, buffer = cv2.imencode('.jpg', frame)
    return buffer.tobytes()

import threading

class CameraStream:
    def __init__(self):
        self.camera = None
        self.frame = None
        self.raw_frame = None  # Raw BGR numpy array for detection
        self.running = False
        self.lock = threading.Lock()
        self.thread = None
        self._frame_id = 0  # Monotonic counter to detect new frames

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self):
        import os
        import time
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        print(f"Connecting to camera at {CAMERA_URL}...")
        self.camera = cv2.VideoCapture(CAMERA_URL, cv2.CAP_FFMPEG)
        self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        consecutive_failures = 0
        while self.running:
            if not self.camera.isOpened():
                success = False
            else:
                # Grab multiple frames to flush buffer — always get the LATEST frame
                # This prevents latency buildup from buffered RTSP frames
                for _ in range(3):
                    self.camera.grab()
                success, frame = self.camera.retrieve()

            if success:
                consecutive_failures = 0
                if hasattr(frame, 'size') and getattr(frame, 'size', 0) > 0:
                    ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    if ret:
                        with self.lock:
                            self.frame = buffer.tobytes()
                            self.raw_frame = frame  # Keep raw BGR for detection
                            self._frame_id += 1
            else:
                consecutive_failures += 1
                print(f"Camera read error. Failures: {consecutive_failures}")
                
                # Show error frame
                error_bytes = create_error_frame("Connection lost. Reconnecting...")
                with self.lock:
                    self.frame = error_bytes
                    self.raw_frame = None
                
                time.sleep(3)
                if consecutive_failures > 2:
                    print("Reconnecting to camera...")
                    if self.camera:
                        self.camera.release()
                    self.camera = cv2.VideoCapture(CAMERA_URL, cv2.CAP_FFMPEG)
                    self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    consecutive_failures = 0

    def stop(self):
        """Stop the camera stream and release resources."""
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=5)
            self.thread = None
        with self.lock:
            if self.camera is not None:
                try:
                    self.camera.release()
                except Exception:
                    pass
                self.camera = None
            self.frame = None
            self.raw_frame = None
        print("[CameraStream] Stopped and resources released")

    def get_frame(self):
        """Get latest JPEG frame bytes."""
        with self.lock:
            return self.frame

    def get_raw_frame(self):
        """Get latest raw BGR numpy array (for detection, avoids re-decoding JPEG)."""
        with self.lock:
            return self.raw_frame, self._frame_id

camera_stream = CameraStream()

def generate_frames():
    import time
    camera_stream.start()
    
    # Keep sending loading frames until camera produces real frames
    loading_frame = create_error_frame("Connecting to camera stream...")
    while True:
        frame_bytes = camera_stream.get_frame()
        if frame_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        else:
            # Camera not ready yet — keep sending loading frame so browser doesn't timeout
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + loading_frame + b'\r\n')
        # Limit frame rate to ~30fps to avoid CPU overload
        time.sleep(0.033)

@app.get("/api/video_feed")
def video_feed():
    """
    Stream MJPEG endpoint dari kamera CCTV (YOLOv11 ready).
    """
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/api/camera/stop")
def stop_camera():
    """Stop the camera stream and release RTSP resources."""
    camera_stream.stop()
    # Clear any active alarm so it doesn't carry over to the next session
    try:
        from ezviz_alarm import acknowledge_alarm
        acknowledge_alarm()
    except Exception:
        pass
    return {"message": "Camera stopped"}

if __name__ == "__main__":
    import uvicorn
    # Start server locally
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
