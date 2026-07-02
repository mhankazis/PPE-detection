from sqlalchemy import Column, Integer, String, ForeignKey, Enum, TIMESTAMP, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="operator", nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=True)
    otp_code = Column(String(10), nullable=True)
    otp_expires = Column(TIMESTAMP, nullable=True)
    otp_attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    nim = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    kelas = Column(String(50), nullable=True)
    photo_path = Column(String(255), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    logs = relationship("Log", back_populates="student")

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    location = Column(String(100), nullable=True)
    rtsp_url = Column(String(255), nullable=False)
    status = Column(Enum('active', 'inactive'), default='active')
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    logs = relationship("Log", back_populates="camera")

class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    log_number = Column(String(50), unique=True, index=True, nullable=False)
    violation_type = Column(String(50), nullable=False)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    image_path = Column(String(255), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    severity = Column(String(20), default="Low")
    status = Column(String(20), default="Belum Dihukum")
    timestamp = Column(TIMESTAMP, server_default=func.now())

    camera = relationship("Camera", back_populates="logs")
    student = relationship("Student", back_populates="logs")

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(LargeBinary, nullable=False)  # Serialized numpy array (512 floats)
    photo_path = Column(String(255), nullable=True)
    photo_index = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student")
