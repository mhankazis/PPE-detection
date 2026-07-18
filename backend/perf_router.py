"""
Performance metrics router — live-feed FPS/inference metrics only.
(Benchmark tool removed 2026-07-18.)
"""
import time

from fastapi import APIRouter, Depends

import models
from auth import get_current_user

router = APIRouter(prefix="/api/perf", tags=["performance"])


@router.get("/live-metrics")
def live_metrics(
    current_user: models.User = Depends(get_current_user),
):
    """
    Return real-time live-feed performance metrics (EMA-based).
    Updated by _generate_detection_frames each detection cycle.
    """
    try:
        from detect_router import _live_metrics
        m = _live_metrics
        is_active = (
            m["frame_count"] > 0
            and (time.time() - m["last_frame_ts"]) < 3.0
        )
        return {
            "fps": round(m["fps"], 1),
            "inference_ms": round(m["inference_ms"], 1),
            "total_ms": round(m["total_ms"], 1),
            "frame_count": m["frame_count"],
            "resolution": f"{m['width']}x{m['height']}" if m["width"] else "N/A",
            "detections_per_frame": round(m["detections_per_frame"], 1),
            "is_active": is_active,
            "last_frame_age_sec": round(time.time() - m["last_frame_ts"], 1) if m["last_frame_ts"] else None,
        }
    except ImportError:
        return {
            "fps": 0.0,
            "inference_ms": 0.0,
            "total_ms": 0.0,
            "frame_count": 0,
            "resolution": "N/A",
            "detections_per_frame": 0.0,
            "is_active": False,
            "last_frame_age_sec": None,
        }
