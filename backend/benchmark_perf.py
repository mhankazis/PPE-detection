"""
Real-time performance benchmark for PPE detection pipeline.

Measures:
  1. Average frame rate (FPS)
  2. Inference time per frame (YOLO + tracking)
  3. Stream latency (frame capture → processed)
  4. Test resolution (actual RTSP frame WxH)
  5. Stable test duration (configurable, default 60s)
  6. Device specification (CPU/RAM/OS auto-detected)

Usage:
    cd backend
    venv\\Scripts\\python.exe benchmark_perf.py --duration 60
    venv\\Scripts\\python.exe benchmark_perf.py --duration 60 --url "rtsp://admin:OGXCCS@192.168.137.202:554/Streaming/Channels/102"
"""
import argparse
import platform
import statistics
import time
from datetime import datetime

import cv2
import numpy as np
import psutil

# Camera config (same as main.py)
DEFAULT_URL = "rtsp://admin:OGXCCS@192.168.137.202:554/Streaming/Channels/102"


def get_device_spec() -> dict:
    """Collect hardware/OS specs."""
    import os
    cpu_freq = psutil.cpu_freq()
    vm = psutil.virtual_memory()
    return {
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "cpu": platform.processor() or "Unknown",
        "cpu_physical_cores": psutil.cpu_count(logical=False) or "N/A",
        "cpu_logical_cores": psutil.cpu_count(logical=True) or "N/A",
        "cpu_freq_mhz": f"{cpu_freq.max:.0f}" if cpu_freq else "N/A",
        "ram_total_gb": round(vm.total / (1024**3), 2),
        "machine": platform.machine(),
    }


def connect_camera(url: str, retries: int = 3):
    """Connect to RTSP stream with retries."""
    os_env = __import__("os").environ
    os_env["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    for attempt in range(retries):
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if cap.isOpened():
            return cap
        print(f"[connect] attempt {attempt+1}/{retries} failed, retrying...")
        time.sleep(2)
    raise RuntimeError(f"Cannot connect to camera: {url}")


def run_benchmark(url: str, duration_sec: int, with_tracking: bool = True) -> dict:
    """
    Run benchmark loop for `duration_sec` seconds.
    Returns metrics dict.
    """
    print(f"\n{'='*60}")
    print(f"PPE Detection — Real-time Performance Benchmark")
    print(f"{'='*60}")
    print(f"Stream URL : {url}")
    print(f"Duration   : {duration_sec} seconds")
    print(f"Tracking   : {'ON (ByteTrack)' if with_tracking else 'OFF'}")
    print(f"{'='*60}\n")

    # Device spec
    spec = get_device_spec()
    print("[Device Specification]")
    for k, v in spec.items():
        print(f"  {k:22s}: {v}")
    print()

    # Connect camera
    print("[1/4] Connecting to camera...")
    cap = connect_camera(url)
    time.sleep(1)  # let it warm up

    # Read actual resolution
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cam_fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"  Resolution: {width} x {height}")
    print(f"  Camera FPS: {cam_fps:.1f}")
    print()

    # Load detector
    print("[2/4] Loading YOLO detector...")
    from detection import get_detector
    detector = get_detector()
    print(f"  Model: YOLOv11 ONNX (INFERENCE_SIZE={detector.INFERENCE_SIZE})")
    print()

    # Warmup (5 frames)
    print("[3/4] Warmup (5 frames)...")
    for _ in range(5):
        ok, frame = cap.read()
        if not ok:
            continue
        if with_tracking:
            detector.detect_frame_tracked(frame, annotate=False)
        else:
            detector.detect_frame(frame, annotate=False)
    print("  Warmup done.\n")

    # Benchmark loop
    print(f"[4/4] Running benchmark for {duration_sec}s...")
    print("-" * 60)

    inference_times = []   # ms per frame (YOLO only)
    total_times = []       # ms per frame (capture + inference)
    latencies = []         # ms: time from frame grab to processed
    frames_processed = 0
    frames_failed = 0
    bytes_processed = 0

    start_time = time.time()
    end_time = start_time + duration_sec
    last_report = start_time

    while time.time() < end_time:
        t_grab = time.time()
        ok, frame = cap.read()
        if not ok:
            frames_failed += 1
            time.sleep(0.01)
            continue

        t_infer_start = time.time()
        if with_tracking:
            annotated, dets, comp = detector.detect_frame_tracked(frame, annotate=False)
        else:
            annotated, dets, comp = detector.detect_frame(frame, annotate=False)
        t_infer_end = time.time()

        # Inference time (YOLO + postprocess only)
        infer_ms = (t_infer_end - t_infer_start) * 1000
        inference_times.append(infer_ms)

        # Total processing time (capture + inference)
        total_ms = (t_infer_end - t_grab) * 1000
        total_times.append(total_ms)

        # Stream latency: time from frame captured to fully processed
        latency_ms = (t_infer_end - t_grab) * 1000
        latencies.append(latency_ms)

        frames_processed += 1
        bytes_processed += frame.nbytes

        # Progress report every 5s
        now = time.time()
        if now - last_report >= 5:
            elapsed = now - start_time
            recent_fps = frames_processed / elapsed
            recent_infer = statistics.mean(inference_times[-30:]) if len(inference_times) >= 30 else statistics.mean(inference_times)
            print(f"  [{elapsed:5.1f}s] frames={frames_processed:4d}  "
                  f"FPS={recent_fps:5.2f}  "
                  f"infer={recent_infer:6.1f}ms  "
                  f"latency={statistics.mean(latencies[-30:]):6.1f}ms")
            last_report = now

    cap.release()

    # Compute metrics
    actual_duration = time.time() - start_time
    avg_fps = frames_processed / actual_duration
    avg_inference = statistics.mean(inference_times) if inference_times else 0
    median_inference = statistics.median(inference_times) if inference_times else 0
    p95_inference = statistics.quantiles(inference_times, n=20)[18] if len(inference_times) >= 20 else max(inference_times or [0])
    avg_total = statistics.mean(total_times) if total_times else 0
    avg_latency = statistics.mean(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0
    min_latency = min(latencies) if latencies else 0

    results = {
        "test_resolution": f"{width} x {height}",
        "camera_fps_reported": round(cam_fps, 2),
        "test_duration_sec": round(actual_duration, 2),
        "frames_processed": frames_processed,
        "frames_failed": frames_failed,
        "avg_fps": round(avg_fps, 2),
        "inference_time_avg_ms": round(avg_inference, 2),
        "inference_time_median_ms": round(median_inference, 2),
        "inference_time_p95_ms": round(p95_inference, 2),
        "total_frame_time_avg_ms": round(avg_total, 2),
        "stream_latency_avg_ms": round(avg_latency, 2),
        "stream_latency_min_ms": round(min_latency, 2),
        "stream_latency_max_ms": round(max_latency, 2),
        "data_processed_mb": round(bytes_processed / (1024**2), 2),
        "device_spec": spec,
    }
    return results


def print_report(r: dict):
    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)

    print("\n[1] Average Frame Rate (FPS)")
    print(f"    {r['avg_fps']:.2f} FPS")

    print("\n[2] Inference Time per Frame")
    print(f"    Average : {r['inference_time_avg_ms']:.2f} ms")
    print(f"    Median  : {r['inference_time_median_ms']:.2f} ms")
    print(f"    P95     : {r['inference_time_p95_ms']:.2f} ms")
    print(f"    Total (capture+infer) avg: {r['total_frame_time_avg_ms']:.2f} ms")

    print("\n[3] Stream Latency")
    print(f"    Average : {r['stream_latency_avg_ms']:.2f} ms")
    print(f"    Min     : {r['stream_latency_min_ms']:.2f} ms")
    print(f"    Max     : {r['stream_latency_max_ms']:.2f} ms")

    print("\n[4] Test Resolution")
    print(f"    {r['test_resolution']}  (camera reported FPS: {r['camera_fps_reported']})")

    print("\n[5] Stable Test Duration")
    print(f"    {r['test_duration_sec']:.2f} seconds")
    print(f"    Frames processed: {r['frames_processed']}")
    print(f"    Frames failed   : {r['frames_failed']}")
    print(f"    Data processed  : {r['data_processed_mb']:.2f} MB")

    print("\n[6] Device Specification")
    for k, v in r["device_spec"].items():
        print(f"    {k:22s}: {v}")

    print("\n" + "=" * 60)
    print("Interpretation guide:")
    print("  FPS >= 15  : Real-time capable (smooth live feed)")
    print("  FPS 10-15  : Acceptable (minor lag)")
    print("  FPS < 10   : Too slow for real-time")
    print("  Inference < 100ms : Good for real-time")
    print("  Latency < 200ms   : User-perceived as instant")
    print("=" * 60)


def save_report(r: dict, path: str):
    """Save report as text file."""
    import json
    with open(path, "w", encoding="utf-8") as f:
        json.dump(r, f, indent=2, ensure_ascii=False)
    print(f"\n[Report saved to {path}]")


def main():
    parser = argparse.ArgumentParser(description="PPE Detection Performance Benchmark")
    parser.add_argument("--url", default=DEFAULT_URL, help="RTSP stream URL")
    parser.add_argument("--duration", type=int, default=60, help="Test duration in seconds (default: 60)")
    parser.add_argument("--no-track", action="store_true", help="Disable ByteTrack tracking")
    parser.add_argument("--save", default="", help="Save JSON report to path")
    args = parser.parse_args()

    results = run_benchmark(
        url=args.url,
        duration_sec=args.duration,
        with_tracking=not args.no_track,
    )
    print_report(results)
    if args.save:
        save_report(results, args.save)


if __name__ == "__main__":
    main()
