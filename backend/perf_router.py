"""
Performance benchmark router.
Exposes endpoint to run real-time performance benchmark from UI.
"""
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import models
from auth import get_current_user

router = APIRouter(prefix="/api/perf", tags=["performance"])

# In-memory store for benchmark jobs (single-user scenario)
_jobs: dict = {}
_job_lock = threading.Lock()


class BenchmarkRequest(BaseModel):
    duration: int = 60  # seconds
    url: str | None = None  # override camera URL


def _run_benchmark_job(job_id: str, duration: int, url: str | None):
    """Background worker — runs benchmark and stores result."""
    try:
        from benchmark_perf import run_benchmark, DEFAULT_URL
        target_url = url or DEFAULT_URL
        results = run_benchmark(url=target_url, duration_sec=duration, with_tracking=True)
        with _job_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["result"] = results
            _jobs[job_id]["finished_at"] = time.time()
    except Exception as e:
        print(f"[perf] benchmark job {job_id} failed: {e}")
        with _job_lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(e)
            _jobs[job_id]["finished_at"] = time.time()


@router.post("/benchmark")
def start_benchmark(
    body: BenchmarkRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Start a benchmark job in background. Returns job_id immediately."""
    if body.duration < 10 or body.duration > 300:
        raise HTTPException(status_code=400, detail="Duration must be between 10 and 300 seconds.")

    job_id = str(uuid.uuid4())[:8]
    with _job_lock:
        # Reject if a job is already running
        running = [j for j in _jobs.values() if j["status"] == "running"]
        if running:
            raise HTTPException(status_code=409, detail="Benchmark sudah berjalan. Tunggu selesai.")
        _jobs[job_id] = {
            "status": "running",
            "started_at": time.time(),
            "duration_requested": body.duration,
            "result": None,
            "error": None,
        }

    thread = threading.Thread(
        target=_run_benchmark_job,
        args=(job_id, body.duration, body.url),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "running", "message": f"Benchmark dimulai ({body.duration}s)."}


@router.get("/benchmark/{job_id}")
def get_benchmark_status(
    job_id: str,
    current_user: models.User = Depends(get_current_user),
):
    """Poll benchmark job status."""
    with _job_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job tidak ditemukan.")
        elapsed = time.time() - job["started_at"]
        return {
            "job_id": job_id,
            "status": job["status"],
            "elapsed_sec": round(elapsed, 1),
            "duration_requested": job.get("duration_requested"),
            "result": job.get("result"),
            "error": job.get("error"),
        }


@router.get("/benchmark")
def list_benchmarks(
    current_user: models.User = Depends(get_current_user),
):
    """List all benchmark jobs (newest first)."""
    with _job_lock:
        jobs = [
            {
                "job_id": jid,
                "status": j["status"],
                "started_at": j["started_at"],
                "duration_requested": j.get("duration_requested"),
            }
            for jid, j in _jobs.items()
        ]
    jobs.sort(key=lambda x: x["started_at"], reverse=True)
    return {"jobs": jobs[:20]}


@router.delete("/benchmark/{job_id}")
def delete_benchmark(
    job_id: str,
    current_user: models.User = Depends(get_current_user),
):
    """Delete a benchmark job from memory."""
    with _job_lock:
        if job_id not in _jobs:
            raise HTTPException(status_code=404, detail="Job tidak ditemukan.")
        if _jobs[job_id]["status"] == "running":
            raise HTTPException(status_code=400, detail="Tidak bisa hapus job yang sedang berjalan.")
        del _jobs[job_id]
    return {"message": "Job dihapus."}


@router.get("/device")
def get_device_info(
    current_user: models.User = Depends(get_current_user),
):
    """Return device specification only (without running benchmark)."""
    from benchmark_perf import get_device_spec
    return get_device_spec()
