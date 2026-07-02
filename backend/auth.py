from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
import bcrypt
import secrets

from database import get_db
import models
from email_service import send_otp_email, is_configured as smtp_configured

# JWT Configuration
SECRET_KEY = "your-super-secret-jwt-key-change-this-in-production" # Change this!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password, hashed_password):
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/login")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

@router.get("/me")
def get_my_profile(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "email": current_user.email,
        "email_masked": _mask_email(current_user.email) if current_user.email else None,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }

class UpdateProfileRequest(BaseModel):
    old_password: str = None
    new_password: str = None

@router.put("/me")
def update_my_profile(
    body: UpdateProfileRequest = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if body and body.new_password:
        if not body.old_password:
            raise HTTPException(status_code=400, detail="Password lama wajib diisi")
        if not verify_password(body.old_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Password lama salah")
        if len(body.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")
        current_user.password_hash = get_password_hash(body.new_password)
        db.commit()
    return {"message": "Profil berhasil diperbarui"}


# =========================================================
# Forgot Password - OTP via Email
# =========================================================

OTP_TTL_MINUTES = 5
OTP_MAX_ATTEMPTS = 5


def _generate_otp() -> str:
    """Generate 6-digit OTP code."""
    return f"{secrets.randbelow(1000000):06d}"


class ForgotPasswordRequest(BaseModel):
    identifier: str  # username or email


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Request OTP. Accepts username or email."""
    if not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Layanan email belum dikonfigurasi. Hubungi administrator.",
        )

    identifier = body.identifier.strip().lower()
    user = (
        db.query(models.User)
        .filter(
            (models.User.username == body.identifier.strip())
            | (models.User.email == identifier)
        )
        .first()
    )

    # Explicit warning if user not found or email not registered
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Akun tidak terdaftar. Periksa kembali username/email Anda.",
        )
    if not user.email:
        raise HTTPException(
            status_code=404,
            detail="Email belum terdaftar di database. Hubungi administrator untuk mengatur email akun Anda.",
        )

    otp_code = _generate_otp()
    user.otp_code = otp_code
    user.otp_expires = datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
    user.otp_attempts = 0
    db.commit()

    try:
        send_otp_email(user.email, otp_code)
    except Exception as e:
        # Log but don't leak to client
        print(f"[auth] Failed to send OTP email to {user.email}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Gagal mengirim email. Coba lagi nanti atau hubungi administrator.",
        )

    return {
        "message": "Kode OTP telah dikirim ke email terdaftar.",
        "email_masked": _mask_email(user.email),
    }


class VerifyOTPRequest(BaseModel):
    identifier: str
    otp_code: str
    new_password: str


@router.post("/reset-password")
def reset_password(body: VerifyOTPRequest, db: Session = Depends(get_db)):
    """Verify OTP and reset password in one step."""
    identifier = body.identifier.strip().lower()
    user = (
        db.query(models.User)
        .filter(
            (models.User.username == body.identifier.strip())
            | (models.User.email == identifier)
        )
        .first()
    )

    if user is None or not user.otp_code or not user.otp_expires:
        raise HTTPException(status_code=400, detail="Kode OTP tidak valid atau kadaluarsa.")

    if user.otp_attempts >= OTP_MAX_ATTEMPTS:
        # Invalidate OTP after too many attempts
        user.otp_code = None
        user.otp_expires = None
        db.commit()
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak percobaan salah. Silakan minta kode OTP baru.",
        )

    if datetime.utcnow() > user.otp_expires:
        user.otp_code = None
        user.otp_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Kode OTP telah kadaluarsa. Silakan minta kode baru.")

    if not secrets.compare_digest(user.otp_code, body.otp_code):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - user.otp_attempts
        raise HTTPException(
            status_code=400,
            detail=f"Kode OTP salah. Sisa percobaan: {remaining}.",
        )

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter.")

    # Success: update password, clear OTP
    user.password_hash = get_password_hash(body.new_password)
    user.otp_code = None
    user.otp_expires = None
    user.otp_attempts = 0
    db.commit()

    return {"message": "Password berhasil direset. Silakan login dengan password baru."}


def _mask_email(email: str) -> str:
    """Mask email for display: j***@example.com"""
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 1:
            masked_local = "*"
        elif len(local) <= 3:
            masked_local = local[0] + "*" * (len(local) - 1)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked_local}@{domain}"
    except Exception:
        return "***"


# =========================================================
# Change Email - OTP verification for new email
# =========================================================

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr


@router.post("/request-email-change")
def request_email_change(
    body: ChangeEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send OTP to NEW email to verify ownership before changing email."""
    if not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Layanan email belum dikonfigurasi. Hubungi administrator.",
        )

    new_email = body.new_email.strip().lower()

    # Reject if same as current
    if current_user.email and current_user.email.lower() == new_email:
        raise HTTPException(status_code=400, detail="Email baru sama dengan email saat ini.")

    # Reject if email already used by another user
    existing = (
        db.query(models.User)
        .filter(models.User.email == new_email)
        .first()
    )
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="Email sudah digunakan akun lain.")

    # Generate OTP, store in pending_email + otp fields
    otp_code = _generate_otp()
    current_user.pending_email = new_email
    current_user.otp_code = otp_code
    current_user.otp_expires = datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
    current_user.otp_attempts = 0
    db.commit()

    try:
        send_otp_email(new_email, otp_code)
    except Exception as e:
        print(f"[auth] Failed to send change-email OTP to {new_email}: {e}")
        # Rollback pending state
        current_user.pending_email = None
        current_user.otp_code = None
        current_user.otp_expires = None
        db.commit()
        raise HTTPException(
            status_code=500,
            detail="Gagal mengirim email verifikasi. Periksa alamat email dan coba lagi.",
        )

    return {
        "message": "Kode OTP telah dikirim ke email baru.",
        "email_masked": _mask_email(new_email),
    }


class ConfirmEmailChangeRequest(BaseModel):
    otp_code: str


@router.post("/confirm-email-change")
def confirm_email_change(
    body: ConfirmEmailChangeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify OTP and apply email change."""
    if not current_user.pending_email or not current_user.otp_code or not current_user.otp_expires:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada permintaan ubah email yang aktif. Silakan minta OTP baru.",
        )

    if current_user.otp_attempts >= OTP_MAX_ATTEMPTS:
        current_user.otp_code = None
        current_user.otp_expires = None
        current_user.pending_email = None
        db.commit()
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak percobaan salah. Silakan minta kode OTP baru.",
        )

    if datetime.utcnow() > current_user.otp_expires:
        current_user.otp_code = None
        current_user.otp_expires = None
        current_user.pending_email = None
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Kode OTP telah kadaluarsa. Silakan minta kode baru.",
        )

    if not secrets.compare_digest(current_user.otp_code, body.otp_code.strip()):
        current_user.otp_attempts = (current_user.otp_attempts or 0) + 1
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - current_user.otp_attempts
        raise HTTPException(
            status_code=400,
            detail=f"Kode OTP salah. Sisa percobaan: {remaining}.",
        )

    # Re-check uniqueness at confirm time (race safety)
    new_email = current_user.pending_email
    existing = (
        db.query(models.User)
        .filter(models.User.email == new_email)
        .first()
    )
    if existing and existing.id != current_user.id:
        current_user.otp_code = None
        current_user.otp_expires = None
        current_user.pending_email = None
        db.commit()
        raise HTTPException(status_code=400, detail="Email sudah digunakan akun lain.")

    # Apply change
    current_user.email = new_email
    current_user.pending_email = None
    current_user.otp_code = None
    current_user.otp_expires = None
    current_user.otp_attempts = 0
    db.commit()

    return {
        "message": "Email berhasil diperbarui.",
        "email": current_user.email,
        "email_masked": _mask_email(current_user.email),
    }


@router.post("/cancel-email-change")
def cancel_email_change(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel any pending email change for current user."""
    current_user.pending_email = None
    current_user.otp_code = None
    current_user.otp_expires = None
    current_user.otp_attempts = 0
    db.commit()
    return {"message": "Permintaan ubah email dibatalkan."}
