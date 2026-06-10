"""
InsightFace Face Recognition Module for PPE Detection.
Provides face identification to auto-assign student_id to violation logs.

Uses SCRFD for face detection + ArcFace for embedding extraction.
Embeddings are cached in-memory for fast cosine similarity matching.
Supports multiple dataset photos per student — embeddings are averaged.
"""

import os
import threading
import numpy as np
import cv2
from pathlib import Path

# Similarity threshold — higher = stricter matching
SIMILARITY_THRESHOLD = 0.3

# Minimum face size (pixels) to attempt recognition
MIN_FACE_SIZE = 30

# Dataset directory for multi-photo enrollment
DATASET_DIR = ".uploads/dataset"
os.makedirs(DATASET_DIR, exist_ok=True)


class FaceRecognizer:
    """Singleton face recognition engine with embedding cache."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.app = None
        # {student_id: np.ndarray(512,)} — averaged embedding from all dataset photos
        self.embedding_cache = {}
        # {student_id: [np.ndarray(512,), ...]} — raw embeddings per photo
        self._raw_embeddings = {}
        self._cache_lock = threading.Lock()
        self._load_model()

    def _load_model(self):
        """Load InsightFace model (buffalo_sc — lightweight, ~100MB)."""
        try:
            import insightface
            from insightface.app import FaceAnalysis
        except ImportError:
            print("[FaceRecognizer] insightface not installed. Face recognition disabled.")
            self.app = None
            return

        print("[FaceRecognizer] Loading InsightFace model...")
        try:
            # Try GPU first
            self.app = FaceAnalysis(
                name="buffalo_sc",
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
            )
            self.app.prepare(ctx_id=0, det_size=(640, 640))
            print("[FaceRecognizer] Model loaded (GPU mode)")
        except Exception as e1:
            print(f"[FaceRecognizer] GPU mode failed: {e1}")
            try:
                # Fallback to CPU
                self.app = FaceAnalysis(
                    name="buffalo_sc",
                    providers=["CPUExecutionProvider"]
                )
                self.app.prepare(ctx_id=-1, det_size=(640, 640))
                print("[FaceRecognizer] Model loaded (CPU mode)")
            except Exception as e2:
                print(f"[FaceRecognizer] CPU mode also failed: {e2}")
                print("[FaceRecognizer] Face recognition DISABLED. Check insightface installation.")
                self.app = None

    def _extract_embedding(self, image: np.ndarray) -> np.ndarray | None:
        """Extract face embedding from an image. Returns None if no face found or model not loaded."""
        if self.app is None:
            return None

        faces = self.app.get(image)
        if not faces:
            return None

        # Use the largest face
        best_face = max(faces, key=lambda f: f.bbox[2] - f.bbox[0])

        # Check minimum face size
        fw = best_face.bbox[2] - best_face.bbox[0]
        fh = best_face.bbox[3] - best_face.bbox[1]
        if fw < MIN_FACE_SIZE or fh < MIN_FACE_SIZE:
            return None

        return best_face.normed_embedding

    @staticmethod
    def _serialize_embedding(embedding: np.ndarray) -> bytes:
        """Serialize numpy embedding to bytes for DB storage."""
        return embedding.astype(np.float32).tobytes()

    @staticmethod
    def _deserialize_embedding(data: bytes) -> np.ndarray:
        """Deserialize bytes from DB back to numpy embedding."""
        return np.frombuffer(data, dtype=np.float32).copy()

    def _update_averaged_embedding(self, student_id: int):
        """Recompute the averaged embedding for a student from all raw embeddings."""
        embeddings = self._raw_embeddings.get(student_id, [])
        if embeddings:
            avg = np.mean(embeddings, axis=0)
            # Re-normalize
            norm = np.linalg.norm(avg)
            if norm > 0:
                avg = avg / norm
            self.embedding_cache[student_id] = avg
        else:
            self.embedding_cache.pop(student_id, None)

    def _save_embedding_to_db(self, db, student_id: int, embedding: np.ndarray, photo_path: str = None):
        """Persist a single embedding to the face_embeddings table."""
        import models
        # Get next photo_index for this student
        max_idx = db.query(models.FaceEmbedding).filter(
            models.FaceEmbedding.student_id == student_id
        ).count()

        row = models.FaceEmbedding(
            student_id=student_id,
            embedding=self._serialize_embedding(embedding),
            photo_path=photo_path,
            photo_index=max_idx
        )
        db.add(row)
        db.commit()
        print(f"[FaceRecognizer] Saved embedding to DB for student {student_id}, index {max_idx}")

    def enroll_student(self, student_id: int, photo_path: str, db=None) -> bool:
        """
        Extract and cache face embedding from a student's photo.
        Supports multiple photos — embeddings are averaged.
        If db session provided, also persists embedding to database.
        Returns True if face was found and embedding stored.
        """
        if not os.path.exists(photo_path):
            print(f"[FaceRecognizer] Photo not found: {photo_path}")
            return False

        img = cv2.imread(photo_path)
        if img is None:
            print(f"[FaceRecognizer] Cannot read image: {photo_path}")
            return False

        embedding = self._extract_embedding(img)
        if embedding is None:
            print(f"[FaceRecognizer] No face detected in: {photo_path}")
            return False

        with self._cache_lock:
            if student_id not in self._raw_embeddings:
                self._raw_embeddings[student_id] = []
            self._raw_embeddings[student_id].append(embedding)
            self._update_averaged_embedding(student_id)

        # Persist to database if session provided
        if db is not None:
            try:
                self._save_embedding_to_db(db, student_id, embedding, photo_path)
            except Exception as e:
                print(f"[FaceRecognizer] Failed to save embedding to DB: {e}")

        print(f"[FaceRecognizer] Enrolled student {student_id} ({len(self._raw_embeddings[student_id])} photos), cache size: {len(self.embedding_cache)}")
        return True

    def enroll_student_from_frame(self, student_id: int, frame: np.ndarray, db=None) -> bool:
        """
        Extract face embedding directly from a BGR frame (e.g. camera capture).
        Saves the photo to dataset directory, caches the embedding, and persists to DB.
        """
        embedding = self._extract_embedding(frame)
        if embedding is None:
            return False

        # Save photo to dataset directory
        import time
        filename = f"student_{student_id}_{int(time.time())}.jpg"
        filepath = os.path.join(DATASET_DIR, filename)
        cv2.imwrite(filepath, frame)

        with self._cache_lock:
            if student_id not in self._raw_embeddings:
                self._raw_embeddings[student_id] = []
            self._raw_embeddings[student_id].append(embedding)
            self._update_averaged_embedding(student_id)

        # Persist to database if session provided
        if db is not None:
            try:
                self._save_embedding_to_db(db, student_id, embedding, filepath)
            except Exception as e:
                print(f"[FaceRecognizer] Failed to save embedding to DB: {e}")

        print(f"[FaceRecognizer] Camera enroll student {student_id} ({len(self._raw_embeddings[student_id])} photos)")
        return True

    def remove_student(self, student_id: int, db=None):
        """Remove a student's embedding from cache, DB, and delete dataset photos."""
        with self._cache_lock:
            self.embedding_cache.pop(student_id, None)
            self._raw_embeddings.pop(student_id, None)

        # Delete from database if session provided
        if db is not None:
            try:
                import models
                db.query(models.FaceEmbedding).filter(
                    models.FaceEmbedding.student_id == student_id
                ).delete()
                db.commit()
                print(f"[FaceRecognizer] Deleted embeddings from DB for student {student_id}")
            except Exception as e:
                print(f"[FaceRecognizer] Failed to delete embeddings from DB: {e}")

        # Delete dataset photos for this student
        if os.path.exists(DATASET_DIR):
            for f in os.listdir(DATASET_DIR):
                if f.startswith(f"student_{student_id}_"):
                    try:
                        os.remove(os.path.join(DATASET_DIR, f))
                    except Exception:
                        pass

    def get_photo_count(self, student_id: int) -> int:
        """Return number of dataset photos for a student."""
        with self._cache_lock:
            return len(self._raw_embeddings.get(student_id, []))

    def identify(self, frame: np.ndarray, person_bbox: list = None) -> int | None:
        """
        Identify a person in a frame or cropped person region.

        Args:
            frame: BGR image (full frame or cropped person region)
            person_bbox: Optional [x1, y1, x2, y2] to crop person first

        Returns:
            student_id if match found above threshold, None otherwise
        """
        with self._cache_lock:
            if not self.embedding_cache:
                return None
            # Copy references for thread safety
            cache_items = list(self.embedding_cache.items())

        # Crop to person bbox if provided
        if person_bbox is not None:
            x1, y1, x2, y2 = person_bbox
            h, w = frame.shape[:2]
            x1, y1 = max(0, int(x1)), max(0, int(y1))
            x2, y2 = min(w, int(x2)), min(h, int(y2))
            roi = frame[y1:y2, x1:x2]
            if roi.size == 0:
                return None
        else:
            roi = frame

        # Detect faces in ROI
        faces = self.app.get(roi)
        if not faces:
            return None

        # Use the largest face
        best_face = max(faces, key=lambda f: f.bbox[2] - f.bbox[0])

        # Check minimum face size
        fw = best_face.bbox[2] - best_face.bbox[0]
        fh = best_face.bbox[3] - best_face.bbox[1]
        if fw < MIN_FACE_SIZE or fh < MIN_FACE_SIZE:
            return None

        query_embedding = best_face.normed_embedding

        # Find best match via cosine similarity
        best_id = None
        best_sim = -1.0

        for student_id, cached_emb in cache_items:
            sim = float(np.dot(query_embedding, cached_emb))
            if sim > best_sim:
                best_sim = sim
                best_id = student_id

        if best_sim >= SIMILARITY_THRESHOLD:
            print(f"[FaceRecognizer] Match: student {best_id}, similarity {best_sim:.3f}")
            return best_id
        else:
            print(f"[FaceRecognizer] No match. Best: student {best_id}, sim {best_sim:.3f} (threshold: {SIMILARITY_THRESHOLD})")
            return None

    def get_cache_size(self) -> int:
        """Return number of enrolled students in cache."""
        with self._cache_lock:
            return len(self.embedding_cache)


# Global singleton
_recognizer = None


def get_recognizer() -> FaceRecognizer:
    """Get or create the global FaceRecognizer instance."""
    global _recognizer
    if _recognizer is None:
        _recognizer = FaceRecognizer()
    return _recognizer


def preload_student_embeddings(db):
    """
    Load all student embeddings into cache.
    First tries loading from face_embeddings table (fast, no re-compute).
    Falls back to extracting from photo files if no DB rows exist for a student.
    Call this on app startup.
    """
    import models

    recognizer = get_recognizer()

    # --- Phase 1: Load embeddings from database (fast path) ---
    db_rows = db.query(models.FaceEmbedding).order_by(
        models.FaceEmbedding.student_id, models.FaceEmbedding.photo_index
    ).all()

    if db_rows:
        loaded_students = set()
        for row in db_rows:
            embedding = FaceRecognizer._deserialize_embedding(row.embedding)
            sid = row.student_id
            with recognizer._cache_lock:
                if sid not in recognizer._raw_embeddings:
                    recognizer._raw_embeddings[sid] = []
                recognizer._raw_embeddings[sid].append(embedding)
            loaded_students.add(sid)

        # Recompute averaged embeddings for all loaded students
        with recognizer._cache_lock:
            for sid in loaded_students:
                recognizer._update_averaged_embedding(sid)

        print(f"[FaceRecognizer] Loaded {len(db_rows)} embeddings from DB for {len(loaded_students)} students, cache size: {recognizer.get_cache_size()}")
        return len(loaded_students)

    # --- Phase 2: Fallback — extract from photo files (first run or migration) ---
    print("[FaceRecognizer] No embeddings in DB, extracting from photo files...")

    # Load main student photos
    students = db.query(models.Student).filter(
        models.Student.photo_path.isnot(None)
    ).all()

    loaded = 0
    for student in students:
        if student.photo_path and os.path.exists(student.photo_path):
            if recognizer.enroll_student(student.id, student.photo_path, db=db):
                loaded += 1

    # Load additional dataset photos
    if os.path.exists(DATASET_DIR):
        import re
        pattern = re.compile(r"student_(\d+)_\d+\.jpg")
        for filename in sorted(os.listdir(DATASET_DIR)):
            match = pattern.match(filename)
            if match:
                sid = int(match.group(1))
                filepath = os.path.join(DATASET_DIR, filename)
                recognizer.enroll_student(sid, filepath, db=db)

    print(f"[FaceRecognizer] Preloaded {loaded} students from photos, cache size: {recognizer.get_cache_size()}")
    return loaded
