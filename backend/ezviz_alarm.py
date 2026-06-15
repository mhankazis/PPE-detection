"""
EZVIZ Camera Siren/Alarm Module.
Triggers siren on EZVIZ camera when PPE violation is detected.
Uses pyezviz SDK with standard EZVIZ account credentials.
Config persisted to ezviz_config.json so it survives server reloads.
"""

import time
import json
import os
import threading

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ezviz_config.json")

_DEFAULT_CONFIG = {
    "enabled": False,
    "email": "",
    "password": "",
    "device_serial": "",
    "siren_duration": 5,
}


def _load_config():
    """Load config from JSON file, falling back to defaults."""
    try:
        if os.path.exists(_CONFIG_PATH):
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                # Merge with defaults so new keys are always present
                cfg = dict(_DEFAULT_CONFIG)
                cfg.update(saved)
                print(f"[EZVIZ Alarm] Config loaded from file — enabled={cfg['enabled']}, serial={cfg.get('device_serial', '')}")
                return cfg
    except Exception as e:
        print(f"[EZVIZ Alarm] Failed to load config file: {e}")
    return dict(_DEFAULT_CONFIG)


def _save_config():
    """Persist current config to JSON file."""
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(EZVIZ_CONFIG, f, indent=2, ensure_ascii=False)
        print(f"[EZVIZ Alarm] Config saved to file")
    except Exception as e:
        print(f"[EZVIZ Alarm] Failed to save config file: {e}")


# Load config from file on module import
EZVIZ_CONFIG = _load_config()

_client = None
_client_lock = threading.Lock()
_last_trigger_time = 0
_trigger_cooldown = 10  # Minimum seconds between siren triggers

# Browser alarm state — frontend polls this to play sound
_alarm_active = False
_alarm_active_until = 0  # Unix timestamp when alarm should stop
_alarm_lock = threading.Lock()


def _get_client():
    """Get or create EZVIZ client."""
    global _client
    if not EZVIZ_CONFIG["enabled"]:
        print("[EZVIZ Alarm] Not enabled, skipping")
        return None
    if not EZVIZ_CONFIG["email"] or not EZVIZ_CONFIG["password"]:
        print("[EZVIZ Alarm] Email/password not configured")
        return None

    try:
        from pyezviz import EzvizClient
        client = EzvizClient(
            EZVIZ_CONFIG["email"],
            EZVIZ_CONFIG["password"],
            url="apiisgp.ezvizlife.com",  # Singapore region for Indonesia/SEA
        )
        client.login()
        print("[EZVIZ Alarm] Logged in successfully")
        return client
    except Exception as e:
        print(f"[EZVIZ Alarm] Login failed: {e}")
        return None


def trigger_siren():
    """Trigger alarm on PPE violation.

    Primary: Set browser alarm flag so frontend plays siren sound.
    Secondary (best-effort): Also send sound_alarm to EZVIZ camera if configured.
    H6C has no hardware siren, so browser sound is the reliable path.

    Runs in background thread to avoid blocking detection loop.
    """
    global _last_trigger_time, _client, _alarm_active, _alarm_active_until

    print(f"[Alarm] trigger_siren called — enabled={EZVIZ_CONFIG['enabled']}")

    now = time.time()
    if now - _last_trigger_time < _trigger_cooldown:
        print(f"[Alarm] Skipped — cooldown ({_trigger_cooldown}s), last trigger {now - _last_trigger_time:.1f}s ago")
        return

    _last_trigger_time = now

    # --- Always activate browser alarm (primary alert method) ---
    duration = EZVIZ_CONFIG.get("siren_duration", 5)
    with _alarm_lock:
        _alarm_active = True
        _alarm_active_until = now + duration + 2  # buffer
    print(f"[Alarm] Browser alarm ACTIVATED for {duration}s")

    # --- Best-effort EZVIZ camera siren (secondary, may be silent on H6C) ---
    if not EZVIZ_CONFIG.get("enabled") or not EZVIZ_CONFIG.get("device_serial"):
        return

    def _do_camera_trigger():
        global _client
        serial = EZVIZ_CONFIG["device_serial"]

        try:
            with _client_lock:
                if _client is None:
                    _client = _get_client()
                if _client is None:
                    return

                try:
                    _client.sound_alarm(serial, enable=1)
                    print(f"[Alarm] Camera sound_alarm sent to {serial}")
                except Exception as e:
                    print(f"[Alarm] Camera sound_alarm error: {e}")

            time.sleep(duration)

            with _client_lock:
                try:
                    _client.sound_alarm(serial, enable=0)
                except Exception:
                    pass

        except Exception as e:
            print(f"[Alarm] Camera trigger failed: {e}")
            _client = None

    thread = threading.Thread(target=_do_camera_trigger, daemon=True)
    thread.start()


def get_alarm_status():
    """Return current browser alarm state for frontend polling."""
    global _alarm_active
    now = time.time()
    with _alarm_lock:
        # Auto-clear if expired
        if _alarm_active and now > _alarm_active_until:
            _alarm_active = False
        return {
            "active": _alarm_active,
            "remaining": max(0, int(_alarm_active_until - now)) if _alarm_active else 0,
        }


def acknowledge_alarm():
    """Clear alarm state (frontend stops sound)."""
    global _alarm_active
    with _alarm_lock:
        _alarm_active = False
    print("[Alarm] Alarm acknowledged by operator")


def update_config(enabled=None, email=None, password=None, device_serial=None, siren_duration=None):
    """Update EZVIZ configuration and persist to file."""
    global _client
    if enabled is not None:
        EZVIZ_CONFIG["enabled"] = enabled
    if email is not None:
        EZVIZ_CONFIG["email"] = email
    if password is not None:
        EZVIZ_CONFIG["password"] = password
    if device_serial is not None:
        EZVIZ_CONFIG["device_serial"] = device_serial
    if siren_duration is not None:
        EZVIZ_CONFIG["siren_duration"] = siren_duration

    # Persist to file
    _save_config()

    # Reset client so it re-connects with new credentials
    _client = None
    print(f"[EZVIZ Alarm] Config updated — enabled={EZVIZ_CONFIG['enabled']}, email={EZVIZ_CONFIG['email']}, serial={EZVIZ_CONFIG['device_serial']}")


def get_config():
    """Get current EZVIZ config (masking password)."""
    return {
        "enabled": EZVIZ_CONFIG["enabled"],
        "email": EZVIZ_CONFIG["email"],
        "device_serial": EZVIZ_CONFIG["device_serial"],
        "siren_duration": EZVIZ_CONFIG["siren_duration"],
        "password_set": bool(EZVIZ_CONFIG["password"]),
    }
