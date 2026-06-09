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
    
    # Send loading frame initially if no frame is ready
    if camera_stream.get_frame() is None:
        loading_frame = create_error_frame("Connecting to camera stream...")
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + loading_frame + b'\r\n')
                
    while True:
        frame_bytes = camera_stream.get_frame()
        if frame_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
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
