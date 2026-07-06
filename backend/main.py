from fastapi import FastAPI, Response, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import shutil
import tempfile
from pathlib import Path

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
from perf_router import router as perf_router
app.include_router(perf_router)


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

# Camera RTSP configuration — loaded from camera_config.py (persists to camera_config.json).
# IP/port/credentials editable via /api/camera/config endpoint (Settings → Konfigurasi Kamera).
# EZVIZ RTSP auth: admin password = device verification code (OGXCCS), NOT the app account password.
#
# Stream choice (verified via probe):
#   /H.264                  -> main stream 2880x1616 (heavy for real-time detection)
#   /Streaming/Channels/102 -> sub  stream 768x432   (4x lighter, ideal for live detection)
# Using sub stream so YOLO + face recognition stay responsive when Detection ON.
from camera_config import (
    get_camera_url as _get_camera_url,
    get_camera_url_main as _get_camera_url_main,
    get_config_safe as _get_camera_config_safe,
    update_ip as _update_camera_ip,
    test_connection as _test_camera_connection,
)

def CAMERA_URL():
    """Current sub-stream RTSP URL (dynamic, reads from camera_config)."""
    return _get_camera_url()

def CAMERA_URL_MAIN():
    """Current main-stream RTSP URL (dynamic, reads from camera_config)."""
    return _get_camera_url_main()

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
        url = CAMERA_URL()  # Read dynamically from camera_config
        print(f"Connecting to camera at {url}...")
        self.camera = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
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
                    # Re-read URL in case config changed while waiting
                    url = CAMERA_URL()
                    print(f"Reconnecting with URL: {url}")
                    self.camera = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
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


# ---------- Camera RTSP Configuration ----------
from pydantic import BaseModel, field_validator
import re

class CameraConfigRequest(BaseModel):
    """Request body for updating camera IP/port."""
    ip: str
    port: int = 554

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v):
        v = v.strip()
        # Accept IPv4 or hostname
        ipv4_re = r"^(\d{1,3}\.){3}\d{1,3}$"
        hostname_re = r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$"
        if not (re.match(ipv4_re, v) or re.match(hostname_re, v)):
            raise ValueError("IP tidak valid. Gunakan format IPv4 (contoh: 192.168.1.100) atau hostname.")
        # Validate octets if IPv4
        if re.match(ipv4_re, v):
            octets = [int(x) for x in v.split(".")]
            if any(o < 0 or o > 255 for o in octets):
                raise ValueError("Octet IP harus antara 0-255.")
        return v

    @field_validator("port")
    @classmethod
    def validate_port(cls, v):
        if v < 1 or v > 65535:
            raise ValueError("Port harus antara 1-65535.")
        return v


@app.get("/api/camera/config")
def get_camera_config(current_user: models.User = Depends(get_current_user)):
    """Get current camera RTSP config (password masked)."""
    return _get_camera_config_safe()


@app.post("/api/camera/test")
def test_camera_connection(body: CameraConfigRequest, current_user: models.User = Depends(get_current_user)):
    """Test RTSP connection to a candidate IP/port WITHOUT saving.

    Runs synchronously — may take 5-10s. Frontend should show loading state.
    """
    result = _test_camera_connection(ip=body.ip, port=body.port, timeout=8.0)
    return result


@app.put("/api/camera/config")
def update_camera_config(body: CameraConfigRequest, current_user: models.User = Depends(get_current_user)):
    """Update camera IP/port, persist to file, and restart stream.

    Flow:
      1. Validate IP/port format (pydantic).
      2. Test connection to new IP — reject if fails.
      3. Save to camera_config.json.
      4. Stop existing CameraStream (releases old RTSP).
      5. Next /api/video_feed request will auto-start stream with new URL.
    """
    # Test connection first — don't save if unreachable
    test = _test_camera_connection(ip=body.ip, port=body.port, timeout=8.0)
    if not test["ok"]:
        raise HTTPException(status_code=400, detail=test["message"])

    # Persist
    new_url = _update_camera_ip(body.ip, body.port)

    # Restart stream so it picks up new URL
    try:
        camera_stream.stop()
    except Exception as e:
        print(f"[Camera Config] Warning: stop_stream failed: {e}")

    return {
        "message": f"IP kamera diperbarui ke {body.ip}:{body.port}. Stream akan terhubung ulang otomatis.",
        "config": _get_camera_config_safe(),
        "test": test,
    }

# ---------- YOLO Model Upload ----------
@app.get("/api/model/info")
def model_info(current_user: models.User = Depends(get_current_user)):
    """Return current YOLO model info (path, backend, file size, mtime)."""
    from detection import MODEL_PATH, MODEL_BACKEND, ONNX_MODEL_PATH, PT_MODEL_PATH
    info = {
        "backend": MODEL_BACKEND,
        "active_path": str(MODEL_PATH),
        "onnx_exists": ONNX_MODEL_PATH.exists(),
        "pt_exists": PT_MODEL_PATH.exists(),
    }
    try:
        p = Path(MODEL_PATH)
        if p.exists():
            st = p.stat()
            info["size_mb"] = round(st.st_size / (1024 * 1024), 2)
            info["modified_at"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
    except Exception:
        pass
    return info


def _export_pt_to_onnx(pt_path: Path, onnx_path: Path) -> tuple[bool, str]:
    """Export a YOLO .pt model to ONNX. Returns (success, message)."""
    try:
        from ultralytics import YOLO
        print(f"[Model Export] Exporting {pt_path} -> ONNX...")
        model = YOLO(str(pt_path))
        # opset=12 for broad compatibility, dynamic=False for fixed shape (faster)
        export_path = model.export(format="onnx", opset=12, dynamic=False, simplify=True)
        exported = Path(export_path)
        if exported.exists() and exported.resolve() != onnx_path.resolve():
            # ultralytics may export to same dir with same stem; move if needed
            shutil.move(str(exported), str(onnx_path))
        if not onnx_path.exists():
            return False, "Export selesai tapi file ONNX tidak ditemukan"
        size_mb = round(onnx_path.stat().st_size / (1024 * 1024), 2)
        return True, f"ONNX export berhasil ({size_mb} MB)"
    except Exception as e:
        return False, f"Export ONNX gagal: {e}"


@app.post("/api/model/upload")
async def upload_model(
    file: UploadFile = File(...),
    convert_onnx: bool = False,
    current_user: models.User = Depends(get_current_user),
):
    """Upload a new YOLO .pt model file, backup the old one, and reload the detector.

    Admin only. Accepts .pt files up to ~500MB. The previous best.pt is
    backed up to best.pt.bak (last backup only). If convert_onnx=true,
    also exports to best.onnx (preferred backend for inference speed).
    """
    if current_user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat mengganti model")

    if not file.filename or not file.filename.lower().endswith(".pt"):
        raise HTTPException(status_code=400, detail="File harus berekstensi .pt")

    from detection import PT_MODEL_PATH, ONNX_MODEL_PATH, reload_detector

    # Ensure yolo_models dir exists
    PT_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Remove ONNX override so the new .pt is used (will re-export if requested)
    onnx_removed = False
    if ONNX_MODEL_PATH.exists():
        try:
            ONNX_MODEL_PATH.unlink()
            onnx_removed = True
        except Exception as e:
            print(f"[Model Upload] Warning: could not remove ONNX override: {e}")

    # Backup existing .pt
    bak_path = PT_MODEL_PATH.with_suffix(".pt.bak")
    if PT_MODEL_PATH.exists():
        try:
            shutil.copy2(str(PT_MODEL_PATH), str(bak_path))
        except Exception as e:
            print(f"[Model Upload] Warning: backup failed: {e}")

    # Write uploaded file to temp first, then move (atomic-ish)
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pt", dir=str(PT_MODEL_PATH.parent)) as tmp:
            tmp_path = Path(tmp.name)
            total = 0
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                tmp.write(chunk)
                total += len(chunk)
                if total > 500 * 1024 * 1024:  # 500MB hard limit
                    tmp.close()
                    tmp_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File terlalu besar (maks 500MB)")
        tmp_path.replace(PT_MODEL_PATH)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan file model: {e}")

    # Optional ONNX export
    onnx_export = {"attempted": convert_onnx, "success": False, "message": ""}
    if convert_onnx:
        ok, msg = _export_pt_to_onnx(PT_MODEL_PATH, ONNX_MODEL_PATH)
        onnx_export["success"] = ok
        onnx_export["message"] = msg

    # Reload detector (will pick ONNX if export succeeded, else .pt)
    ok = reload_detector()

    # Determine active backend after reload
    from detection import MODEL_PATH as _active_path, MODEL_BACKEND as _active_backend
    return {
        "message": "Model berhasil diperbarui" if ok else "Model tersimpan tapi reload gagal — restart server",
        "reloaded": ok,
        "active_backend": _active_backend,
        "size_mb": round(PT_MODEL_PATH.stat().st_size / (1024 * 1024), 2),
        "onnx_override_removed": onnx_removed,
        "backup_path": str(bak_path) if bak_path.exists() else None,
        "onnx_export": onnx_export,
    }


@app.post("/api/model/convert-onnx")
def model_convert_onnx(current_user: models.User = Depends(get_current_user)):
    """Export current best.pt to best.onnx. Admin only."""
    if current_user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Hanya admin")
    from detection import PT_MODEL_PATH, ONNX_MODEL_PATH, reload_detector
    if not PT_MODEL_PATH.exists():
        raise HTTPException(status_code=404, detail="best.pt tidak ditemukan")
    ok, msg = _export_pt_to_onnx(PT_MODEL_PATH, ONNX_MODEL_PATH)
    if not ok:
        raise HTTPException(status_code=500, detail=msg)
    reload_ok = reload_detector()
    return {"success": ok, "message": msg, "reloaded": reload_ok}


@app.post("/api/model/reload")
def model_reload(current_user: models.User = Depends(get_current_user)):
    """Re-run detector reload from disk (no file change). Admin only."""
    if current_user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Hanya admin")
    from detection import reload_detector
    ok = reload_detector()
    return {"reloaded": ok}


if __name__ == "__main__":
    import uvicorn
    # Start server locally
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
