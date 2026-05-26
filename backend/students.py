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
    return {"message": "Student deleted"}
