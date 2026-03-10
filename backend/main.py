from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import time

app = FastAPI(title="PPE Detection API (YOLOv11 Backend)")

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

@app.get("/api/logs")
def get_recent_logs():
    return [
        {"id": "V-1042", "time": "10:24 AM", "type": "No Helmet"},
        {"id": "V-1041", "time": "10:15 AM", "type": "No Vest"}
    ]

from fastapi.responses import StreamingResponse
import cv2

# Credentials provided:
# username: mhankazis@gmail.com (URL encoded as mhankazis%40gmail.com)
# password: Skripsi22
# Verification code (often used for EZVIZ cameras with username 'admin'): OGXCCS

# Option 1: Tapo/General RTSP with account
#CAMERA_URL = "rtsp://mhankazis%40gmail.com:Skripsi22@192.168.18.56:554/stream1"

# Option 2: Ezviz/Other cameras using Verification Code
# Now that the camera is set to H.264, we can use the default stream path
CAMERA_URL = "rtsp://admin:OGXCCS@192.168.18.56:554/H.264"

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

def generate_frames():
    import os
    import time
    
    # Now that the stream is H.264, we only need TCP transport. 
    # Remove the aggressive drop flags that were causing stuttering on keyframes.
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    
    camera = None
    
    def connect_camera():
        nonlocal camera
        if camera is not None:
            camera.release()
        print(f"Connecting to camera at {CAMERA_URL}...")
        camera = cv2.VideoCapture(CAMERA_URL, cv2.CAP_FFMPEG)
        # Reduce buffer size to prevent lagging
        camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return camera.isOpened()

    print("Initializing camera connection...")
    if not connect_camera():
        print("Make sure LAN Live View / RTSP is enabled in your Ezviz app settings.")
        error_frame = create_error_frame("Cannot connect to RTSP stream.")
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + error_frame + b'\r\n')
        # We don't return here anymore, we'll try to reconnect in the loop
    else:
        print("Camera connected successfully. Streaming frames...")

    consecutive_failures = 0
    while True:
        if camera is None or not camera.isOpened():
            success = False
        else:
            success, frame = camera.read()
            
        if not success:
            consecutive_failures += 1
            print(f"Error reading frame from camera (failure {consecutive_failures}).")
            
            # Show reconnecting frame to user
            error_frame = create_error_frame("Connection lost. Reconnecting...")
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + error_frame + b'\r\n')
            
            # Attempt reconnection if we fail too many times or immediately
            # Wait 3 seconds to prevent camera from locking up due to rapid reconnects
            time.sleep(3) 
            connect_camera()
            continue
            
        # Reset failures if successful
        consecutive_failures = 0
        
        # Di sini nantinya kita bisa memasukkan logika deteksi YOLOv11
        # Check if frame is valid (HEVC dropouts can occasionally produce empty frames even on success=True)
        if hasattr(frame, 'size') and getattr(frame, 'size', 0) > 0:
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

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
