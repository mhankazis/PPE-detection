"""
YOLOv11 PPE Detection Engine
Loads the trained best.pt model and provides detection functions
for image, video frame, and live feed processing.

Classes: Helmet, Uniform, Hijab, Glasses, Person
PPE Completeness: Helmet + Uniform = Required; Hijab, Glasses = Informational
"""

import os
import io
import cv2
import numpy as np
from pathlib import Path

# Model directory — prefer ONNX (lighter, faster startup), fallback to PyTorch .pt
_MODELS_DIR = Path(__file__).parent / "yolo_models"
ONNX_MODEL_PATH = _MODELS_DIR / "best.onnx"
PT_MODEL_PATH = _MODELS_DIR / "best.pt"

# Active model path (resolved at load time)
MODEL_PATH = ONNX_MODEL_PATH if ONNX_MODEL_PATH.exists() else PT_MODEL_PATH
# Backend tag for logging
MODEL_BACKEND = "onnx" if ONNX_MODEL_PATH.exists() else "pt"

# Detection confidence threshold
CONFIDENCE_THRESHOLD = 0.5

# Class color mapping (BGR for OpenCV)
CLASS_COLORS = {
    "Helmet":  (0, 200, 0),      # Green
    "Uniform": (200, 150, 0),    # Teal/Cyan
    "Hijab":   (200, 0, 200),    # Magenta
    "Glasses": (0, 200, 255),    # Yellow
    "Person":  (255, 100, 0),    # Blue
}

# Required PPE items (must be present for compliance)
REQUIRED_PPE = {"Helmet", "Uniform"}

# English (model class) → Indonesian (UI/DB) translation.
# Keeps bbox labels and DB violation_type consistent with frontend Logs view.
PPE_TO_ID = {
    "Helmet":  "Helm",
    "Uniform": "Seragam",
    "Hijab":   "Hijab",
    "Glasses": "Kacamata",
}


def ppe_to_id(label: str) -> str:
    """Translate a PPE class label to Indonesian. Falls back to original."""
    return PPE_TO_ID.get(label, label)

# Informational PPE items (reported if detected, not flagged if missing)
INFORMATIONAL_PPE = {"Hijab", "Glasses"}


class PPEDetector:
    """Singleton YOLO PPE detection engine."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    # Inference input size — MUST match ONNX export size (640).
    # Changing this breaks ONNX (fixed input dims). Re-export model to change.
    INFERENCE_SIZE = 640

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.model = None
        self.confidence = CONFIDENCE_THRESHOLD
        # ByteTrack state — persists across frames for stable person IDs.
        # Lazily activated on first detect_frame_tracked() call.
        self._tracker_enabled = False
        self._last_tracker_ids: set[int] = set()
        self._load_model()

    def _load_model(self):
        """Load the YOLO model from disk and warm it up.

        Backend priority: ONNX Runtime > PyTorch (.pt)
        - ONNX: lighter dependency, faster startup, optimized CPU/GPU execution
        - .pt:  fallback if ONNX file missing or fails to load
        """
        try:
            from ultralytics import YOLO
        except ImportError:
            print(f"[PPE Detector] ERROR: ultralytics not installed. Run: pip install ultralytics")
            self.model = None
            return

        # Try ONNX backend first
        if MODEL_BACKEND == "onnx" and ONNX_MODEL_PATH.exists():
            try:
                import onnxruntime as ort
                # Pick best available execution provider
                available = ort.get_available_providers()
                if "CUDAExecutionProvider" in available:
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    self.device = "cuda"
                else:
                    providers = ["CPUExecutionProvider"]
                    self.device = "cpu"
                print(f"[PPE Detector] Loading ONNX model from {ONNX_MODEL_PATH}...")
                print(f"[PPE Detector] ONNX Runtime providers: {providers}")
                # Ultralytics YOLO auto-detects ONNX backend from file extension.
                # Pass providers via session options through the task argument.
                self.model = YOLO(str(ONNX_MODEL_PATH), task="detect")
                self.model.predict(
                    np.zeros((self.INFERENCE_SIZE, self.INFERENCE_SIZE, 3), dtype=np.uint8),
                    conf=self.confidence, iou=self.NMS_IOU_THRESHOLD,
                    imgsz=self.INFERENCE_SIZE, verbose=False, device=self.device,
                )
                print(f"[PPE Detector] ONNX model loaded & warmed up. Classes: {self.model.names}")
                return
            except Exception as e:
                print(f"[PPE Detector] WARNING: ONNX load failed ({e}). Falling back to .pt")

        # Fallback: PyTorch backend
        if not PT_MODEL_PATH.exists():
            print(f"[PPE Detector] ERROR: No model file found. Tried ONNX and .pt")
            self.model = None
            return
        try:
            import torch
        except ImportError:
            print(f"[PPE Detector] ERROR: torch not installed for .pt fallback")
            self.model = None
            return

        print(f"[PPE Detector] Loading PyTorch model from {PT_MODEL_PATH}...")
        self.model = YOLO(str(PT_MODEL_PATH))
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        if self.device == 'cuda':
            self.model.model.half()
            print(f"[PPE Detector] CUDA detected — using FP16 half-precision on GPU")
        else:
            print(f"[PPE Detector] Running on CPU — using FP32")

        # Warmup
        print(f"[PPE Detector] Warming up model...")
        dummy = np.zeros((self.INFERENCE_SIZE, self.INFERENCE_SIZE, 3), dtype=np.uint8)
        self.model(dummy, conf=self.confidence, iou=self.NMS_IOU_THRESHOLD,
                   imgsz=self.INFERENCE_SIZE, verbose=False, device=self.device)
        print(f"[PPE Detector] Model loaded & warmed up. Classes: {self.model.names}")

    def set_confidence(self, conf: float):
        """Update confidence threshold."""
        self.confidence = max(0.1, min(1.0, conf))

    # NMS IoU threshold — lower = more aggressive duplicate suppression
    NMS_IOU_THRESHOLD = 0.45

    def detect_frame(self, frame: np.ndarray, annotate: bool = True) -> tuple:
        """
        Run detection on a single frame (numpy array BGR).

        Args:
            frame: Input BGR image
            annotate: If False, skip drawing annotations (faster for counting-only use)

        Returns:
            annotated_frame (np.ndarray): Frame with bounding boxes drawn
            detections (list[dict]): List of detection results
            compliance (list[dict]): PPE compliance per person
        """
        results = self.model(
            frame, conf=self.confidence, iou=self.NMS_IOU_THRESHOLD,
            imgsz=self.INFERENCE_SIZE, verbose=False, device=self.device
        )
        result = results[0]

        raw_detections = []

        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = self.model.names[cls_id].title()

            raw_detections.append({
                "label": label,
                "confidence": round(conf, 3),
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            })

        # Custom deduplication — remove same-class overlapping boxes
        detections = self._deduplicate(raw_detections)

        persons = []
        ppe_items = []

        for det in detections:
            if det["label"] == "Person":
                persons.append(det)
            else:
                ppe_items.append(det)

        # Calculate PPE compliance per person
        compliance = self._check_compliance(persons, ppe_items)

        # Draw annotations on frame (skip if annotate=False)
        annotated_frame = self._draw_annotations(frame.copy(), detections, compliance) if annotate else frame

        return annotated_frame, detections, compliance

    def detect_frame_tracked(self, frame: np.ndarray, annotate: bool = True) -> tuple:
        """
        Run detection WITH ByteTrack tracking — assigns stable tracker_id
        per person across frames. Same return contract as detect_frame, but
        each compliance dict gains a 'tracker_id' field (int or None).

        Uses Ultralytics model.track() which runs ByteTrack internally.
        Adds ~2-5ms overhead vs detect_frame — negligible vs YOLO inference.

        Args:
            frame: Input BGR image
            annotate: If False, skip drawing annotations

        Returns:
            annotated_frame, detections, compliance (with tracker_id per person)
        """
        # model.track() persists tracker state internally across calls.
        # First call initializes ByteTrack; subsequent calls update tracks.
        results = self.model.track(
            frame, conf=self.confidence, iou=self.NMS_IOU_THRESHOLD,
            imgsz=self.INFERENCE_SIZE, verbose=False, device=self.device,
            tracker="bytetrack.yaml", persist=True,
        )
        result = results[0]

        raw_detections = []
        person_tracker_ids = {}  # idx in raw_detections -> tracker_id (Person only)

        for idx, box in enumerate(result.boxes):
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = self.model.names[cls_id].title()

            det = {
                "label": label,
                "confidence": round(conf, 3),
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            }
            raw_detections.append(det)

            # box.id only present when tracking is active and ID assigned.
            # Person boxes get tracker_id; PPE items do not (we only track persons).
            if label == "Person" and box.id is not None:
                person_tracker_ids[idx] = int(box.id.item())

        # Deduplicate (same as detect_frame)
        detections = self._deduplicate(raw_detections)

        # Build a lookup from bbox → tracker_id (since dedup may reorder).
        # bbox tuple is unique per detection.
        bbox_to_tid = {}
        for idx, tid in person_tracker_ids.items():
            if idx < len(raw_detections):
                bbox_to_tid[tuple(raw_detections[idx]["bbox"])] = tid

        persons = []
        ppe_items = []
        for det in detections:
            if det["label"] == "Person":
                persons.append(det)
            else:
                ppe_items.append(det)

        compliance = self._check_compliance(persons, ppe_items)

        # Attach tracker_id to each person's compliance entry.
        current_ids = set()
        for comp in compliance:
            tid = bbox_to_tid.get(tuple(comp["person_bbox"]))
            comp["tracker_id"] = tid
            if tid is not None:
                current_ids.add(tid)

        # Detect disappeared trackers → notify caller via attribute.
        # (caller can use this to call violation_state.forget_tracker)
        disappeared = self._last_tracker_ids - current_ids
        self._last_disappeared_trackers = disappeared
        self._last_tracker_ids = current_ids

        annotated_frame = self._draw_annotations(frame.copy(), detections, compliance) if annotate else frame
        return annotated_frame, detections, compliance

    def _deduplicate(self, detections: list, iou_threshold: float = 0.5) -> list:
        """
        Remove duplicate detections of the same class with high overlap.
        Keeps the detection with the highest confidence.
        """
        if not detections:
            return detections

        # Group by class
        by_class = {}
        for det in detections:
            label = det["label"]
            if label not in by_class:
                by_class[label] = []
            by_class[label].append(det)

        result = []
        for label, class_dets in by_class.items():
            # Sort by confidence descending
            class_dets.sort(key=lambda d: d["confidence"], reverse=True)

            keep = []
            for det in class_dets:
                is_duplicate = False
                for kept in keep:
                    iou = self._compute_iou(det["bbox"], kept["bbox"])
                    if iou > iou_threshold:
                        is_duplicate = True
                        break
                if not is_duplicate:
                    keep.append(det)

            result.extend(keep)

        return result

    def _compute_iou(self, box_a, box_b) -> float:
        """Compute standard IoU (Intersection over Union) between two boxes."""
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b

        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)

        if ix1 >= ix2 or iy1 >= iy2:
            return 0.0

        inter_area = (ix2 - ix1) * (iy2 - iy1)
        area_a = (ax2 - ax1) * (ay2 - ay1)
        area_b = (bx2 - bx1) * (by2 - by1)
        union_area = area_a + area_b - inter_area

        if union_area == 0:
            return 0.0

        return inter_area / union_area

    def detect_image_bytes(self, image_bytes: bytes) -> tuple:
        """
        Run detection on image bytes.

        Returns:
            annotated_bytes (bytes): JPEG-encoded annotated image
            detections (list[dict]): Detection results
            compliance (list[dict]): PPE compliance per person
        """
        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image")

        annotated_frame, detections, compliance = self.detect_frame(frame)

        # Encode back to JPEG
        _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return buffer.tobytes(), detections, compliance

    def _check_compliance(self, persons: list, ppe_items: list) -> list:
        """
        Check PPE compliance for each detected person.
        Uses bounding box overlap to associate PPE items with persons.

        Returns list of compliance dicts per person.
        """
        compliance = []

        for i, person in enumerate(persons):
            px1, py1, px2, py2 = person["bbox"]

            found_ppe = set()
            found_items = []

            for item in ppe_items:
                ix1, iy1, ix2, iy2 = item["bbox"]

                # Check if PPE item overlaps with person bounding box
                overlap = self._compute_overlap(
                    (px1, py1, px2, py2),
                    (ix1, iy1, ix2, iy2)
                )

                if overlap > 0.3:  # 30% overlap threshold
                    found_ppe.add(item["label"])
                    found_items.append({
                        "label": item["label"],
                        "confidence": item["confidence"]
                    })

            # Determine missing required PPE
            missing = REQUIRED_PPE - found_ppe
            is_compliant = len(missing) == 0

            # Informational items found
            info_items = found_ppe & INFORMATIONAL_PPE

            compliance.append({
                "person_index": i + 1,
                "person_bbox": person["bbox"],
                "person_confidence": person["confidence"],
                "is_compliant": is_compliant,
                "found_ppe": list(found_ppe),
                "missing_ppe": list(missing),
                "informational": list(info_items),
                "items_detail": found_items,
            })

        return compliance

    def _compute_overlap(self, box_a, box_b) -> float:
        """Compute intersection-over-min-area overlap ratio between two boxes."""
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b

        # Intersection
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)

        if ix1 >= ix2 or iy1 >= iy2:
            return 0.0

        inter_area = (ix2 - ix1) * (iy2 - iy1)
        # Use the smaller box area as denominator (PPE item is usually smaller)
        area_b = (bx2 - bx1) * (by2 - by1)
        if area_b == 0:
            return 0.0

        return inter_area / area_b

    def _draw_annotations(self, frame: np.ndarray, detections: list, compliance: list, lightweight: bool = False) -> np.ndarray:
        """Draw bounding boxes and labels on the frame.
        
        Args:
            frame: BGR image to annotate
            detections: List of detection dicts with label, confidence, bbox
            compliance: List of compliance dicts per person
            lightweight: If True, skip label backgrounds and use thinner lines for faster drawing
        """
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Scale font and line thickness based on frame resolution
        # Reference: 640px width = scale 0.6, thickness 2
        frame_w = frame.shape[1]
        scale_factor = max(frame_w / 640, 1.0)
        font_scale = 0.6 * scale_factor
        status_font_scale = 0.5 * scale_factor
        thickness = max(2, int(2 * scale_factor))
        text_thickness = max(1, int(1 * scale_factor))
        padding = int(8 * scale_factor)

        # Draw all detection boxes
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            label = det["label"]
            conf = det["confidence"]
            color = CLASS_COLORS.get(label, (255, 255, 255))

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

            # Label with background (translated to Indonesian)
            text = f"{ppe_to_id(label)} {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(text, font, font_scale, text_thickness)
            cv2.rectangle(frame, (x1, y1 - th - padding - 2), (x1 + tw + padding, y1), color, -1)
            cv2.putText(frame, text, (x1 + padding // 2, y1 - padding // 2), font, font_scale, (255, 255, 255), text_thickness, cv2.LINE_AA)

        # Draw compliance status on person boxes
        for comp in compliance:
            x1, y1, x2, y2 = comp["person_bbox"]

            if comp["is_compliant"]:
                status_text = "APD LENGKAP"
                status_color = (0, 200, 0)  # Green
            else:
                missing = ", ".join(ppe_to_id(m) for m in comp["missing_ppe"])
                status_text = f"KURANG: {missing}"
                status_color = (0, 0, 255)  # Red

            # Draw status bar at bottom of person box
            (tw, th), _ = cv2.getTextSize(status_text, font, status_font_scale, text_thickness)
            cv2.rectangle(frame, (x1, y2), (x1 + tw + padding + 4, y2 + th + padding + 4), status_color, -1)
            cv2.putText(frame, status_text, (x1 + padding // 2, y2 + th + padding // 2 + 2), font, status_font_scale, (255, 255, 255), text_thickness, cv2.LINE_AA)

        return frame


# Global singleton instance — lazy loaded
_detector = None


def get_detector() -> PPEDetector:
    """Get or create the global PPE detector instance. Retries loading if model failed."""
    global _detector
    if _detector is None:
        _detector = PPEDetector()
    elif _detector.model is None:
        # Model failed to load previously — retry
        print("[PPE Detector] Retrying model load...")
        _detector._load_model()
    return _detector


def reload_detector() -> bool:
    """Reload the YOLO model from disk. Used after model file is replaced.

    Resets the global singleton so the next get_detector() call re-reads
    MODEL_PATH and re-initializes. Returns True if reload succeeds.
    """
    global _detector
    try:
        if _detector is not None:
            try:
                _detector.model = None
            except Exception:
                pass
        _detector = None
        # Re-import-safe: re-read module-level MODEL_PATH at call time
        import sys
        mod = sys.modules.get(__name__)
        if mod is not None:
            mod.MODEL_PATH = mod.ONNX_MODEL_PATH if mod.ONNX_MODEL_PATH.exists() else mod.PT_MODEL_PATH
            mod.MODEL_BACKEND = "onnx" if mod.ONNX_MODEL_PATH.exists() else "pt"
        d = get_detector()
        return d.model is not None
    except Exception as e:
        print(f"[PPE Detector] Reload failed: {e}")
        return False
