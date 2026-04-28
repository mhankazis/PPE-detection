from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Default Laragon MySQL credentials (root with no password)
# Database name is ppe_detection
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:@localhost:3306/ppe_detection"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
