import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

# Resolve database path relative to the backend folder. If project root contains app.db, prefer that.
HERE = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, os.pardir))
# candidate in project root
root_db = os.path.join(PROJECT_ROOT, 'app.db')
# candidate in backend folder
backend_db = os.path.join(HERE, 'app.db')

if os.path.exists(root_db):
    db_path = root_db
else:
    db_path = backend_db

# Absolute filesystem path to DB
DATABASE_FILE = os.path.abspath(db_path)
# SQLite URL must use forward slashes
db_path_posix = DATABASE_FILE.replace('\\', '/')
DATABASE_URL = f"sqlite:///{db_path_posix}"

# Create engine with moderate timeout and allow multiple threads (suitable for dev)
# Use moderate timeout (5s) and disable echo to improve performance under load
connect_args = {"check_same_thread": False, "timeout": 5}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)

# inicjalizacja bazy
def init_db():
    SQLModel.metadata.create_all(engine)
    # Enable WAL journal mode to reduce locking contention for SQLite (safe for local/dev)
    try:
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
    except Exception:
        pass

# sesja dla endpointów
def get_session():
    with Session(engine) as session:
        yield session
