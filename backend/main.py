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

@app.get("/api/video_feed")
def video_feed():
    """
    Placeholder for MJPEG stream from YOLOv11.
    In a real app, this would return a StreamingResponse of JPEG frames.
    """
    return Response(content="Video stream offline", media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    # Start server locally
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
