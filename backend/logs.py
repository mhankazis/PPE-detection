from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.orm import Session
from database import get_db
import models
from datetime import datetime
import os
import shutil
from typing import Optional

router = APIRouter(prefix="/api/logs", tags=["logs"])

UPLOAD_DIR = ".uploads/logs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).all()
    
    # Format the data to match the frontend expectations
    result = []
    for log in logs:
        ts = log.timestamp
        date_str = ts.strftime("%Y-%m-%d") if ts else ""
        time_str = ts.strftime("%I:%M %p") if ts else ""
        time_input = ts.strftime("%H:%M") if ts else ""
        
        camera_name = log.camera.name if log.camera else f"Cam ID {log.camera_id}" if log.camera_id else "Main Camera"
        student_name = log.student.name if log.student else f"S-{log.student_id}" if log.student_id else "Unknown"
        
        result.append({
            "id": log.log_number,
            "date": date_str,
            "time": time_str,
            "time_input": time_input,
            "camera": camera_name,
            "type": log.violation_type,
            "student": student_name,
            "student_id": log.student_id,
            "camera_id": log.camera_id,
            "severity": log.severity,
            "status": log.status,
            "image_path": log.image_path
        })
    return result

@router.get("/{log_number}")
def get_log_detail(log_number: str, db: Session = Depends(get_db)):
    """Return full detail of a single log by log_number."""
    log = db.query(models.Log).filter(models.Log.log_number == log_number).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    ts = log.timestamp
    date_str = ts.strftime("%Y-%m-%d") if ts else ""
    time_str = ts.strftime("%I:%M %p") if ts else ""

    camera_name = log.camera.name if log.camera else f"Cam ID {log.camera_id}" if log.camera_id else "Main Camera"
    student_name = log.student.name if log.student else "Unknown"
    student_nim = log.student.nim if log.student else ""

    return {
        "id": log.log_number,
        "date": date_str,
        "time": time_str,
        "camera": camera_name,
        "type": log.violation_type,
        "severity": log.severity,
        "status": log.status,
        "student": student_name,
        "student_nim": student_nim,
        "student_id": log.student_id,
        "camera_id": log.camera_id,
        "image_path": log.image_path,
    }

@router.post("/")
def create_log(
    violation_type: str = Form(...),
    severity: str = Form(default="Low"),
    student_id: str = Form(default=""),
    camera_id: str = Form(default=""),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    import random
    new_log_number = f"V-{random.randint(1000, 9999)}"
    
    # Process optional integer fields
    parsed_student_id = int(student_id) if student_id and student_id.lower() != "null" else None
    parsed_camera_id = int(camera_id) if camera_id and camera_id.lower() != "null" else None
    
    photo_path = None
    if file:
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"{new_log_number}_{int(datetime.now().timestamp())}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        photo_path = file_path
    
    new_log = models.Log(
        log_number=new_log_number,
        violation_type=violation_type,
        camera_id=parsed_camera_id,
        student_id=parsed_student_id,
        severity=severity,
        status="Belum Dihukum",
        image_path=photo_path
    )
    
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    
    return {"message": "Log created", "id": new_log.log_number}

@router.put("/{log_number}")
def update_log(
    log_number: str,
    violation_type: str = Form(default=""),
    severity: str = Form(default=""),
    status: str = Form(default=""),
    student_id: str = Form(default=""),
    remove_image: str = Form(default="false"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    log = db.query(models.Log).filter(models.Log.log_number == log_number).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    if violation_type:
        log.violation_type = violation_type
    if severity:
        log.severity = severity
    if status:
        log.status = status
    
    if student_id and student_id.lower() != "null":
        log.student_id = int(student_id)
    elif student_id.lower() == "null":
        log.student_id = None
        
    if remove_image.lower() == "true":
        log.image_path = None
        
    if file:
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"{log_number}_{int(datetime.now().timestamp())}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        log.image_path = file_path
        
    db.commit()
    return {"message": "Log updated successfully"}

@router.delete("/{log_number}")
def delete_log(log_number: str, db: Session = Depends(get_db)):
    log = db.query(models.Log).filter(models.Log.log_number == log_number).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    db.delete(log)
    db.commit()
    return {"message": "Log deleted successfully"}

@router.post("/bulk-delete")
def bulk_delete_logs(log_numbers: list[str] = Body(..., embed=True), db: Session = Depends(get_db)):
    if not log_numbers:
        raise HTTPException(status_code=400, detail="No log numbers provided")
    
    deleted = 0
    for ln in log_numbers:
        log = db.query(models.Log).filter(models.Log.log_number == ln).first()
        if log:
            db.delete(log)
            deleted += 1
    
    db.commit()
    return {"message": f"Deleted {deleted} log(s)", "deleted": deleted}

@router.post("/bulk-update")
def bulk_update_logs(
    log_numbers: list[str] = Body(..., embed=True),
    severity: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if not log_numbers:
        raise HTTPException(status_code=400, detail="No log numbers provided")
    
    updated = 0
    for ln in log_numbers:
        log = db.query(models.Log).filter(models.Log.log_number == ln).first()
        if log:
            if severity:
                log.severity = severity
            if status:
                log.status = status
            updated += 1
    
    db.commit()
    return {"message": f"Updated {updated} log(s)", "updated": updated}
