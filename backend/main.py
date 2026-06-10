from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import time

app = FastAPI(title="PPE Detection API (YOLOv11 Backend)")

# Database and Auth setup
import models
from database import engine
from auth import router as auth_router
from students import router as students_router
from logs import router as logs_router
from detect_router import router as detect_router

# Create tables if they don't exist (optional, but good for setup)
models.Base.metadata.create_all(bind=engine)

app.include_router(auth_router)
app.include_router(students_router)
app.include_router(logs_router)
app.include_router(detect_router)


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
    """Return face recognition cache status."""
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        return {"enabled": True, "enrolled_students": recognizer.get_cache_size()}
    except Exception:
        return {"enabled": False, "enrolled_students": 0}

@app.get("/api/dashboard")
def dashboard_stats():
    """Return dashboard statistics from the database."""
    from database import SessionLocal
    from datetime import datetime, timedelta
    import sqlalchemy as sa

    db = SessionLocal()
    try:
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time())

        # Total violations today
        violations_today = db.query(models.Log).filter(models.Log.timestamp >= today_start).count()

        # Total violations all time
        violations_total = db.query(models.Log).count()

        # Total students
        total_students = db.query(models.Student).count()

        # Violations still "Belum Dihukum"
        unresolved = db.query(models.Log).filter(models.Log.status == "Belum Dihukum").count()

        # Resolved
        resolved = db.query(models.Log).filter(models.Log.status == "Sudah Dihukum").count()

        # Compliance rate: resolved / total (or 100 if no violations)
        compliance_rate = round((resolved / violations_total * 100) if violations_total > 0 else 100, 1)

        # Severity breakdown
        severity_counts = {}
        for sev in ["Low", "Medium", "High", "Critical"]:
            severity_counts[sev] = db.query(models.Log).filter(models.Log.severity == sev).count()

        # Recent 5 violations
        recent = db.query(models.Log).order_by(models.Log.timestamp.desc()).limit(5).all()
        recent_list = []
        for log in recent:
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

        # Violations per day (last 7 days)
        daily = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            d_start = datetime.combine(d, datetime.min.time())
            d_end = datetime.combine(d + timedelta(days=1), datetime.min.time())
            count = db.query(models.Log).filter(models.Log.timestamp >= d_start, models.Log.timestamp < d_end).count()
            daily.append({"date": d.strftime("%Y-%m-%d"), "day": d.strftime("%a"), "count": count})

        return {
            "violations_today": violations_today,
            "violations_total": violations_total,
            "total_students": total_students,
            "unresolved": unresolved,
            "resolved": resolved,
            "compliance_rate": compliance_rate,
            "severity_counts": severity_counts,
            "recent_violations": recent_list,
            "daily_violations": daily,
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
#CAMERA_URL = "rtsp://mhankazis%40gmail.com:Skripsi22@192.168.137.196:554/stream1"

# Option 2: Ezviz/Other cameras using Verification Code
# Now that the camera is set to H.264, we can use the default stream path
CAMERA_URL = "rtsp://admin:Skripsiku@192.168.137.196:554/H.264"

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

if __name__ == "__main__":
    import uvicorn
    # Start server locally
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
