from sqlmodel import SQLModel, create_engine, Session

# SQLite w pliku
DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(DATABASE_URL, echo=True)

# inicjalizacja bazy
def init_db():
    SQLModel.metadata.create_all(engine)

# sesja dla endpointów
def get_session():
    with Session(engine) as session:
        yield session
