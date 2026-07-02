"""
Email service for sending OTP codes via SMTP (Gmail App Password).

Configuration via environment variables (or backend/.env):
    SMTP_HOST          default: smtp.gmail.com
    SMTP_PORT          default: 587
    SMTP_USER          Gmail address (e.g. your-app@gmail.com)
    SMTP_PASSWORD      Gmail App Password (16 chars, no spaces)
    SMTP_FROM_NAME     Display name (default: "Deteksi APD")
    SMTP_FROM_EMAIL    From address (default: SMTP_USER)

Usage:
    from email_service import send_otp_email, is_configured
    send_otp_email("user@example.com", "123456")
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Load .env from backend/ dir regardless of CWD (must run BEFORE any os.getenv)
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
try:
    from dotenv import load_dotenv
    _loaded = load_dotenv(_ENV_PATH, override=True)
    print(f"[email_service] load_dotenv path={_ENV_PATH} loaded={_loaded}", flush=True)
except ImportError:
    print("[email_service] python-dotenv not installed", flush=True)


def _cfg(key: str, default: str = "") -> str:
    """Read env var dynamically."""
    return os.getenv(key, default)


def is_configured() -> bool:
    """Return True if SMTP credentials are present."""
    return bool(_cfg("SMTP_USER") and _cfg("SMTP_PASSWORD"))


def _build_message(to_email: str, otp_code: str) -> MIMEMultipart:
    from_name = _cfg("SMTP_FROM_NAME", "Deteksi APD")
    from_email = _cfg("SMTP_FROM_EMAIL") or _cfg("SMTP_USER")
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg["Subject"] = f"[Deteksi APD] Kode Reset Password: {otp_code}"

    text_body = (
        f"Anda meminta reset password akun Deteksi APD.\n\n"
        f"Kode OTP Anda: {otp_code}\n\n"
        f"Kode ini berlaku 5 menit. Jangan bagikan kode ini kepada siapapun.\n"
        f"Jika Anda tidak merasa meminta reset password, abaikan email ini."
    )

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="color: #dc2626; margin-top: 0;">Reset Password - Deteksi APD</h2>
      <p>Anda meminta reset password akun Deteksi APD.</p>
      <p style="font-size: 14px; color: #6b7280;">Kode OTP Anda:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; font-size: 36px; font-weight: bold;
                     letter-spacing: 8px; color: #dc2626; background: #fef2f2;
                     padding: 12px 24px; border-radius: 8px; border: 1px solid #fecaca;">
          {otp_code}
        </span>
      </div>
      <p style="font-size: 13px; color: #6b7280;">
        Kode berlaku <strong>5 menit</strong>. Jangan bagikan kode ini kepada siapapun.
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        Jika Anda tidak merasa meminta reset password, abaikan email ini.
      </p>
    </div>
    """

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    return msg


def send_otp_email(to_email: str, otp_code: str) -> None:
    """Send OTP code to email. Raises Exception on failure."""
    if not is_configured():
        raise RuntimeError(
            "SMTP not configured. Set SMTP_USER and SMTP_PASSWORD in backend/.env"
        )

    host = _cfg("SMTP_HOST", "smtp.gmail.com")
    port = int(_cfg("SMTP_PORT", "587"))
    user = _cfg("SMTP_USER")
    password = _cfg("SMTP_PASSWORD")
    from_email = _cfg("SMTP_FROM_EMAIL") or user

    msg = _build_message(to_email, otp_code)

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(from_email, [to_email], msg.as_string())
