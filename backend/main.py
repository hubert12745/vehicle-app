"""Minimal FastAPI skeleton for the Vehicle Maintenance App.
Run with:
    uvicorn main:app --reload --port 8000
Make sure you have installed:
    pip install fastapi uvicorn[standard] sqlmodel pydantic python-jose[cryptography] apscheduler aiofiles
"""
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Field, SQLModel, Session, create_engine, select
from jose import jwt

# -----------------------------------------------------------------------------
# Config (for demo purposes – move to .env in production)
# -----------------------------------------------------------------------------
SECRET_KEY = "super-secret-key"  # TODO: replace
ALGORITHM = "HS256"
DB_URL = "sqlite:///app.db"
engine = create_engine(DB_URL, echo=False)

# -----------------------------------------------------------------------------
# Database models
# -----------------------------------------------------------------------------
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Vehicle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    make: str
    model: str
    vin: str
    mileage: int  # in kilometres

class Refuel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicle.id")
    litres: float
    price: float
    odometer: int  # km at refuel time
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# -----------------------------------------------------------------------------
# FastAPI app & middleware
# -----------------------------------------------------------------------------
app = FastAPI(title="Smart Vehicle Care API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Dependency helpers
# -----------------------------------------------------------------------------

def get_session():
    with Session(engine) as session:
        yield session

# -----------------------------------------------------------------------------
# Simple auth (demo only)
# -----------------------------------------------------------------------------

def create_access_token(user_id: int) -> str:
    payload = {"sub": str(user_id)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# -----------------------------------------------------------------------------
# API routes – placeholder examples
# -----------------------------------------------------------------------------

@app.post("/users", status_code=status.HTTP_201_CREATED)
def register(email: str, password: str, session: Session = Depends(get_session)):
    # TODO: hash password properly
    user = User(email=email, password_hash=password)
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.id)
    return {"access_token": token}

@app.get("/vehicles", response_model=List[Vehicle])
def list_vehicles(session: Session = Depends(get_session)):
    return session.exec(select(Vehicle)).all()

# -----------------------------------------------------------------------------
# Initial DB creation
# -----------------------------------------------------------------------------

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
