"""
Camera RTSP Configuration Module.
Persists camera IP/URL to camera_config.json so it survives server reloads.
Used by CameraStream in main.py and benchmark_perf.py.
"""

import json
import os
import threading

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "camera_config.json")

# Credentials stay in code (not exposed to frontend) — only IP is user-editable.
# EZVIZ RTSP auth: admin password = device verification code (OGXCCS).
_DEFAULT_CONFIG = {
    "ip": "192.168.137.202",
    "port": 554,
    "username": "admin",
    "password": "OGXCCS",
    "path": "/Streaming/Channels/102",  # sub-stream (768x432, lighter for live detection)
}

_config_lock = threading.Lock()


def _load_config():
    """Load config from JSON file, falling back to defaults."""
    try:
        if os.path.exists(_CONFIG_PATH):
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                cfg = dict(_DEFAULT_CONFIG)
                cfg.update(saved)
                print(f"[Camera Config] Loaded from file — ip={cfg['ip']}:{cfg['port']}")
                return cfg
    except Exception as e:
        print(f"[Camera Config] Failed to load config file: {e}")
    return dict(_DEFAULT_CONFIG)


def _save_config(cfg):
    """Persist config to JSON file."""
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        print(f"[Camera Config] Saved to file — ip={cfg['ip']}:{cfg['port']}")
    except Exception as e:
        print(f"[Camera Config] Failed to save config file: {e}")


CAMERA_CONFIG = _load_config()


def build_rtsp_url(channel: str = "sub") -> str:
    """Build full RTSP URL from config.

    Args:
        channel: 'sub' for sub-stream (live detection), 'main' for main stream (high quality).
    """
    with _config_lock:
        cfg = dict(CAMERA_CONFIG)
    if channel == "main":
        path = "/H.264"
    else:
        path = cfg.get("path", "/Streaming/Channels/102")
    return f"rtsp://{cfg['username']}:{cfg['password']}@{cfg['ip']}:{cfg['port']}{path}"


def get_camera_url() -> str:
    """Get current sub-stream RTSP URL (for live feed + detection)."""
    return build_rtsp_url("sub")


def get_camera_url_main() -> str:
    """Get current main-stream RTSP URL (high quality fallback)."""
    return build_rtsp_url("main")


def get_config_safe():
    """Get config for API response (password masked, never exposed)."""
    with _config_lock:
        cfg = dict(CAMERA_CONFIG)
    return {
        "ip": cfg["ip"],
        "port": cfg["port"],
        "username": cfg["username"],
        "path": cfg.get("path", "/Streaming/Channels/102"),
        "password_set": bool(cfg.get("password")),
    }


def update_ip(new_ip: str, port: int = None):
    """Update camera IP (and optionally port), persist to file.

    Args:
        new_ip: New IP address (e.g. '192.168.1.100').
        port: Optional new port. If None, keep current.

    Returns:
        New full RTSP URL.
    """
    global CAMERA_CONFIG
    with _config_lock:
        CAMERA_CONFIG["ip"] = new_ip.strip()
        if port is not None:
            CAMERA_CONFIG["port"] = int(port)
        _save_config(CAMERA_CONFIG)
        return build_rtsp_url("sub")


def test_connection(ip: str = None, port: int = None, timeout: float = 8.0) -> dict:
    """Test RTSP connection to camera.

    Args:
        ip: IP to test. If None, use current config.
        port: Port to test. If None, use current config.
        timeout: Connection timeout in seconds.

    Returns:
        Dict with keys: ok (bool), message (str), resolution (tuple|None), fps (float|None)
    """
    import cv2

    with _config_lock:
        cfg = dict(CAMERA_CONFIG)
    if ip:
        cfg["ip"] = ip.strip()
    if port:
        cfg["port"] = int(port)

    url = f"rtsp://{cfg['username']}:{cfg['password']}@{cfg['ip']}:{cfg['port']}{cfg.get('path', '/Streaming/Channels/102')}"

    # FFmpeg options: TCP transport + socket timeout (microseconds).
    # stimeout handles RTSP TCP read timeout — prevents VideoCapture from
    # blocking forever when the camera is online at TCP level but the RTSP
    # server is unresponsive/hung. Timeout is in microseconds.
    timeout_us = int(timeout * 1_000_000)
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"rtsp_transport;tcp|stimeout;{timeout_us}"
    cap = None
    try:
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            return {"ok": False, "message": f"Tidak bisa membuka stream RTSP. Periksa IP {cfg['ip']}:{cfg['port']} dan kredensial.", "resolution": None, "fps": None}

        # Try to grab a frame to confirm stream is alive
        ok, frame = cap.read()
        if not ok or frame is None:
            return {"ok": False, "message": "Stream terbuka tapi tidak ada frame. Kamera mungkin offline atau sibuk.", "resolution": None, "fps": None}

        h, w = frame.shape[:2]
        fps = cap.get(cv2.CAP_PROP_FPS)
        return {
            "ok": True,
            "message": f"Koneksi berhasil. Resolusi {w}x{h} @ {fps:.1f} FPS.",
            "resolution": [w, h],
            "fps": float(fps) if fps else None,
        }
    except Exception as e:
        return {"ok": False, "message": f"Error koneksi: {e}", "resolution": None, "fps": None}
    finally:
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass
