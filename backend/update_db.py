from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE logs ADD COLUMN severity VARCHAR(20) DEFAULT 'Low'"))
    except Exception as e:
        print(f"Error adding severity: {e}")
    try:
        conn.execute(text("ALTER TABLE logs ADD COLUMN status VARCHAR(20) DEFAULT 'Belum Dihukum'"))
    except Exception as e:
        print(f"Error adding status: {e}")
    try:
        conn.execute(text("ALTER TABLE students ADD COLUMN kelas VARCHAR(50) DEFAULT NULL"))
    except Exception as e:
        print(f"Error adding kelas: {e}")
    conn.commit()
print("DB updated")
