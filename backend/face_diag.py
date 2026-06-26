"""Diagnostic: test face recognition identify() on dataset photos."""
import cv2
import sys
import os

# Ensure backend dir on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from face_recognition import get_recognizer
from database import SessionLocal
import models

print("=== Face Recognition Diagnostic ===")
recognizer = get_recognizer()
print(f"Model loaded: {recognizer.app is not None}")
print(f"Cache size: {recognizer.get_cache_size()}")

db = SessionLocal()
try:
    students = db.query(models.Student).all()
    print(f"\nStudents in DB: {len(students)}")
    for s in students[:10]:
        print(f"  id={s.id} name={s.name} nim={s.nim} photo={s.photo_path}")

    # List dataset photos
    dataset_dir = ".uploads/dataset"
    if os.path.isdir(dataset_dir):
        photos = sorted([f for f in os.listdir(dataset_dir) if f.endswith(".jpg")])[:8]
        print(f"\nDataset photos (first 8): {photos}")

        print("\n--- Testing identify() on each dataset photo ---")
        for fname in photos:
            fpath = os.path.join(dataset_dir, fname)
            img = cv2.imread(fpath)
            if img is None:
                print(f"{fname}: cannot read")
                continue
            h, w = img.shape[:2]
            # Try identify on full image (no bbox)
            sid = recognizer.identify(img, None)
            print(f"{fname}: size={w}x{h} -> identified_student_id={sid}")

            # Also try with full-image bbox
            sid2 = recognizer.identify(img, [0, 0, w, h])
            print(f"  with full bbox: {sid2}")
    else:
        print(f"Dataset dir not found: {dataset_dir}")
finally:
    db.close()

print("\n=== Done ===")
