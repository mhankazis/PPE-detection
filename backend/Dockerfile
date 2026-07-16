# PPE Detection — backend (FastAPI + YOLO + InsightFace), CPU build
FROM python:3.13-slim

# Runtime libs (libgl1/libglib2.0-0 for opencv & insightface; ffmpeg for RTSP /
# video ingest) plus build tooling — some deps (e.g. `lap`) compile from source
# on Python 3.13 where no prebuilt wheel exists.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        ffmpeg \
        build-essential \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Cython/wheel needed to build source distributions such as `lap`.
RUN pip install --no-cache-dir --upgrade pip cython wheel

# torch + torchvision CPU wheels from the dedicated index (the default PyPI
# wheels are the large CUDA builds). Installed explicitly and together so the
# pair is version-matched — ultralytics needs torchvision's ops (e.g. NMS),
# which are missing otherwise and break model loading.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Remaining dependencies. The `torch` line is filtered out — it is already
# installed above, its inline `--index-url` is not reliably honoured per-line
# across pip versions, and we don't want torch re-resolved from PyPI.
RUN grep -vE '^torch([[:space:]]|$)' requirements.txt > /tmp/req.txt \
    && pip install --no-cache-dir -r /tmp/req.txt

# Application source (includes yolo_models/best.pt used at startup).
COPY . .

# Target of the uploads volume (seeded from the image on first run, then persisted).
RUN mkdir -p .uploads

EXPOSE 8000

# Production server — no --reload.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
