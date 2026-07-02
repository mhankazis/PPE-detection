"""
Migration: Add `pending_email` column to `users` table.

Safe to re-run — checks information_schema before altering.
"""
import os
from sqlalchemy import text

from database import engine, SQLALCHEMY_DATABASE_URL as DB_URL


def column_exists(table: str, column: str) -> bool:
    sql = text(
        """
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :t
          AND COLUMN_NAME = :c
        """
    )
    with engine.connect() as conn:
        return conn.execute(sql, {"t": table, "c": column}).scalar() > 0


def main():
    print(f"[migrate] DB: {DB_URL}")
    if column_exists("users", "pending_email"):
        print("[migrate] Column `users.pending_email` already exists. Skip.")
        return

    print("[migrate] Adding `users.pending_email` VARCHAR(150) NULL ...")
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE `users` "
                "ADD COLUMN `pending_email` VARCHAR(150) NULL AFTER `email`"
            )
        )
    print("[migrate] Done.")


if __name__ == "__main__":
    main()
