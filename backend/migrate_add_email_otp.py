"""
Migration script: add email + OTP columns to users table.

Run once on existing database:
    python migrate_add_email_otp.py

Safe to re-run (uses IF NOT EXISTS via inspect).
"""
import sys
from sqlalchemy import text
from database import engine

COLUMNS = [
    ("email", "VARCHAR(150) NULL"),
    ("otp_code", "VARCHAR(10) NULL"),
    ("otp_expires", "TIMESTAMP NULL DEFAULT NULL"),
    ("otp_attempts", "INT NOT NULL DEFAULT 0"),
]


def column_exists(conn, table, column):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    )
    return result.scalar() > 0


def index_exists(conn, table, index_name):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.STATISTICS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = :t AND INDEX_NAME = :i"
        ),
        {"t": table, "i": index_name},
    )
    return result.scalar() > 0


def main():
    print("[migrate] Connecting to database...")
    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if column_exists(conn, "users", name):
                print(f"[migrate] Column 'users.{name}' already exists, skip.")
            else:
                print(f"[migrate] Adding users.{name} {ddl}")
                conn.execute(text(f"ALTER TABLE `users` ADD COLUMN `{name}` {ddl}"))

        if not index_exists(conn, "users", "uq_users_email"):
            print("[migrate] Adding unique index uq_users_email on users(email)")
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`)"
                )
            )
        else:
            print("[migrate] Index uq_users_email already exists, skip.")

    print("[migrate] Done. Set admin email manually if needed:")
    print("    UPDATE users SET email = 'admin@example.com' WHERE username = 'admin';")


if __name__ == "__main__":
    sys.exit(main())
