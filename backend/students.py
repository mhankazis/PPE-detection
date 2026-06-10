from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime

from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/students", tags=["students"])

# Define the upload directory
UPLOAD_DIR = ".uploads/students"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/")
def get_students(db: Session = Depends(get_db)):
    students = db.query(models.Student).all()
    return students

@router.post("/")
async def create_student(
    name: str = Form(...),
    nis: str = Form(...),
    kelas: str = Form(default=""),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    existing_student = db.query(models.Student).filter(models.Student.nim == nis).first()
    if existing_student:
        raise HTTPException(status_code=400, detail="Student with this NIS already exists")

    photo_path = None
    if file:
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"{nis}_{int(datetime.now().timestamp())}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        photo_path = file_path

    new_student = models.Student(
        nim=nis,
        name=name,
        kelas=kelas,
        photo_path=photo_path
    )
    
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    
    # Enroll face embedding if photo provided
    if photo_path:
        try:
            from face_recognition import get_recognizer
            get_recognizer().enroll_student(new_student.id, photo_path, db=db)
        except Exception as e:
            print(f"[Students] Face enrollment failed for {new_student.id}: {e}")
    
    return new_student

@router.put("/{student_id}")
async def update_student(
    student_id: int,
    name: str = Form(...),
    nis: str = Form(...),
    kelas: str = Form(default=""),
    remove_photo: bool = Form(default=False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    existing_student = db.query(models.Student).filter(models.Student.nim == nis, models.Student.id != student_id).first()
    if existing_student:
        raise HTTPException(status_code=400, detail="Student with this NIS already exists")

    student.name = name
    student.nim = nis
    student.kelas = kelas
    
    if remove_photo and student.photo_path:
        try:
            if os.path.exists(student.photo_path):
                os.remove(student.photo_path)
        except Exception:
            pass
        student.photo_path = None
    elif file:
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"{nis}_{int(datetime.now().timestamp())}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            if student.photo_path and os.path.exists(student.photo_path):
                os.remove(student.photo_path)
        except Exception:
            pass
            
        student.photo_path = file_path

    db.commit()
    db.refresh(student)
    
    # Update face embedding cache
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        if remove_photo or (file and student.photo_path):
            # Re-enroll with new photo, or remove if photo removed
            if student.photo_path:
                recognizer.enroll_student(student.id, student.photo_path, db=db)
            else:
                recognizer.remove_student(student.id, db=db)
    except Exception as e:
        print(f"[Students] Face cache update failed for {student.id}: {e}")
    
    return student

@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    try:
        if student.photo_path and os.path.exists(student.photo_path):
            os.remove(student.photo_path)
    except Exception:
        pass
        
    db.delete(student)
    db.commit()
    
    # Remove face embedding from cache and DB
    try:
        from face_recognition import get_recognizer
        get_recognizer().remove_student(student_id, db=db)
    except Exception as e:
        print(f"[Students] Face cache removal failed for {student_id}: {e}")
    
    return {"message": "Student deleted"}


@router.post("/{student_id}/capture-dataset")
async def capture_dataset_photo(
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Capture a photo from the browser webcam and add it to the student's face dataset.
    Frontend captures frame from video element and sends as image file.
    The photo is processed for face embedding and cached immediately.
    """
    import numpy as np
    import cv2

    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read and decode the uploaded image
    image_bytes = await file.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image data")

    # Enroll face from frame
    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        if recognizer.app is None:
            raise HTTPException(
                status_code=503,
                detail="Face recognition model not loaded. Pastikan insightface terinstall dan model buffalo_sc sudah didownload."
            )
        success = recognizer.enroll_student_from_frame(student_id, frame, db=db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face recognition failed: {str(e)}")

    if not success:
        raise HTTPException(
            status_code=422,
            detail="No face detected in camera frame. Pastikan wajah terlihat jelas di kamera."
        )

    photo_count = recognizer.get_photo_count(student_id)

    return {
        "message": "Dataset photo captured",
        "student_id": student_id,
        "total_photos": photo_count
    }


@router.get("/{student_id}/dataset-status")
def get_dataset_status(
    student_id: int,
    db: Session = Depends(get_db)
):
    """Return the number of dataset photos enrolled for a student."""
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        photo_count = recognizer.get_photo_count(student_id)
    except Exception:
        photo_count = 0

    return {
        "student_id": student_id,
        "total_photos": photo_count,
        "has_main_photo": student.photo_path is not None
    }


@router.post("/{student_id}/upload-dataset")
async def upload_dataset_photo(
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Upload a photo and add it to the student's face dataset.
    Alternative to camera capture — for uploading existing photos.
    """
    import cv2
    import numpy as np

    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        from face_recognition import get_recognizer
        recognizer = get_recognizer()
        success = recognizer.enroll_student_from_frame(student_id, frame, db=db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face recognition failed: {str(e)}")

    if not success:
        raise HTTPException(
            status_code=422,
            detail="No face detected in uploaded photo. Pastikan wajah terlihat jelas."
        )

    photo_count = recognizer.get_photo_count(student_id)

    return {
        "message": "Dataset photo uploaded",
        "student_id": student_id,
        "total_photos": photo_count
    }
