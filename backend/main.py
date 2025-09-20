from fastapi import FastAPI, Depends, HTTPException, Form, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List
from datetime import timedelta
from jose import JWTError, jwt

from db import init_db, get_session
from models import (
    User, UserCreate, UserRead, UserLogin,
    Vehicle, VehicleCreate, VehicleRead,
    FuelEntry, FuelEntryCreate, FuelEntryRead,
    ServiceEvent, ServiceEventCreate, ServiceEventRead,
)
from auth import hash_password, verify_password, create_access_token

# --- konfiguracja JWT ---
SECRET_KEY = "secret123"  # w praktyce .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI()

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # na razie pozwalamy wszystkim
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def root():
    return {"msg": "Vehicle API is running"}


# -------------------------------
# Auth helpers
# -------------------------------
def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# -------------------------------
# Auth endpoints
# -------------------------------
@app.post("/register/", response_model=UserRead)
def register(user: UserCreate, session: Session = Depends(get_session)):
    db_user = session.exec(select(User).where(User.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(email=user.email, password_hash=hash_password(user.password))
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user


@app.post("/login/")
def login(
    email: str = Form(...),
    password: str = Form(...),
    session: Session = Depends(get_session)
):
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user


# -------------------------------
# Vehicles
# -------------------------------
@app.post("/vehicles/", response_model=VehicleRead)
def create_vehicle(vehicle: VehicleCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot add vehicle for another user")

    db_vehicle = Vehicle.from_orm(vehicle)
    session.add(db_vehicle)
    session.commit()
    session.refresh(db_vehicle)
    return db_vehicle


@app.get("/vehicles/", response_model=List[VehicleRead])
def list_vehicles(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()


# -------------------------------
# Fuel Entries
# -------------------------------
@app.post("/fuel/", response_model=FuelEntryRead)
def create_fuel_entry(fuel: FuelEntryCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    # sprawdzamy, czy pojazd należy do usera
    vehicle = session.get(Vehicle, fuel.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Vehicle not found or not owned by you")

    db_fuel = FuelEntry.from_orm(fuel)
    session.add(db_fuel)
    session.commit()
    session.refresh(db_fuel)
    return db_fuel


@app.get("/fuel/", response_model=List[FuelEntryRead])
def list_fuel_entries(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    vehicles = session.exec(select(Vehicle.id).where(Vehicle.user_id == current_user.id)).all()
    return session.exec(select(FuelEntry).where(FuelEntry.vehicle_id.in_(vehicles))).all()


# -------------------------------
# Service Events
# -------------------------------
@app.post("/service/", response_model=ServiceEventRead)
def create_service_event(event: ServiceEventCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    vehicle = session.get(Vehicle, event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Vehicle not found or not owned by you")

    db_event = ServiceEvent.from_orm(event)
    session.add(db_event)
    session.commit()
    session.refresh(db_event)
    return db_event


@app.get("/service/", response_model=List[ServiceEventRead])
def list_service_events(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    vehicles = session.exec(select(Vehicle.id).where(Vehicle.user_id == current_user.id)).all()
    return session.exec(select(ServiceEvent).where(ServiceEvent.vehicle_id.in_(vehicles))).all()
