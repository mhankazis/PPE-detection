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

# Path to the trained YOLO model
MODEL_PATH = Path(__file__).parent / "yolo_models" / "best.pt"

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

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.model = None
        self.confidence = CONFIDENCE_THRESHOLD
        self._load_model()

    def _load_model(self):
        """Load the YOLO model from disk."""
        from ultralytics import YOLO
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
        print(f"[PPE Detector] Loading model from {MODEL_PATH}...")
        self.model = YOLO(str(MODEL_PATH))
        print(f"[PPE Detector] Model loaded. Classes: {self.model.names}")

    def set_confidence(self, conf: float):
        """Update confidence threshold."""
        self.confidence = max(0.1, min(1.0, conf))

    # NMS IoU threshold — lower = more aggressive duplicate suppression
    NMS_IOU_THRESHOLD = 0.45

    def detect_frame(self, frame: np.ndarray) -> tuple:
        """
        Run detection on a single frame (numpy array BGR).

        Returns:
            annotated_frame (np.ndarray): Frame with bounding boxes drawn
            detections (list[dict]): List of detection results
            compliance (list[dict]): PPE compliance per person
        """
        results = self.model(frame, conf=self.confidence, iou=self.NMS_IOU_THRESHOLD, verbose=False)
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

        # Draw annotations on frame
        annotated_frame = self._draw_annotations(frame.copy(), detections, compliance)

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

    def _draw_annotations(self, frame: np.ndarray, detections: list, compliance: list) -> np.ndarray:
        """Draw bounding boxes and labels on the frame."""
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 2

        # Draw all detection boxes
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            label = det["label"]
            conf = det["confidence"]
            color = CLASS_COLORS.get(label, (255, 255, 255))

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

            # Draw label background
            text = f"{label} {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(text, font, font_scale, 1)
            cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 8, y1), color, -1)
            cv2.putText(frame, text, (x1 + 4, y1 - 5), font, font_scale, (255, 255, 255), 1, cv2.LINE_AA)

        # Draw compliance status on person boxes
        for comp in compliance:
            x1, y1, x2, y2 = comp["person_bbox"]

            if comp["is_compliant"]:
                status_text = "APD LENGKAP"
                status_color = (0, 200, 0)  # Green
            else:
                missing = ", ".join(comp["missing_ppe"])
                status_text = f"KURANG: {missing}"
                status_color = (0, 0, 255)  # Red

            # Draw status bar at bottom of person box
            (tw, th), _ = cv2.getTextSize(status_text, font, 0.5, 1)
            cv2.rectangle(frame, (x1, y2), (x1 + tw + 12, y2 + th + 12), status_color, -1)
            cv2.putText(frame, status_text, (x1 + 6, y2 + th + 6), font, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

        return frame


# Global singleton instance — lazy loaded
_detector = None


def get_detector() -> PPEDetector:
    """Get or create the global PPE detector instance."""
    global _detector
    if _detector is None:
        _detector = PPEDetector()
    return _detector
