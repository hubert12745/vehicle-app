from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from typing import List
from datetime import timedelta

from db import init_db, get_session
from models import User, Vehicle, FuelEntry, ServiceEvent, UserCreate, UserRead, Token
from auth import hash_password, verify_password, create_access_token, get_current_user

app = FastAPI(title="Vehicle App API")

# ✅ CORS — pozwalamy na połączenia z frontendu
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # możesz ograniczyć np. do ["http://localhost:19006"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ inicjalizacja bazy
@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def root():
    return {"msg": "Vehicle API działa 🚀"}


# -------------------------------
# 🔐 Rejestracja i logowanie
# -------------------------------
@app.post("/register/", response_model=UserRead)
def register(user_data: UserCreate, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email już istnieje")

    hashed_pw = hash_password(user_data.password)
    new_user = User(email=user_data.email, password_hash=hashed_pw)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user


@app.post("/login/", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Nieprawidłowe dane logowania")

    access_token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(hours=1))
    return {"access_token": access_token, "token_type": "bearer"}


# -------------------------------
# 🚗 Vehicles
# -------------------------------
@app.get("/vehicles/", response_model=List[Vehicle])
def list_vehicles(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicles = session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()
    return vehicles


@app.post("/vehicles/", response_model=Vehicle)
def create_vehicle(
    vehicle: Vehicle,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicle.user_id = current_user.id
    session.add(vehicle)
    session.commit()
    session.refresh(vehicle)
    return vehicle


# -------------------------------
# ⛽ Fuel Entries
# -------------------------------
@app.post("/fuel/", response_model=FuelEntry)
def create_fuel_entry(
    fuel: FuelEntry,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # sprawdzenie, czy pojazd należy do użytkownika
    vehicle = session.get(Vehicle, fuel.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego pojazdu")

    session.add(fuel)
    session.commit()
    session.refresh(fuel)
    return fuel


# -------------------------------
# 🧾 Service Events
# -------------------------------
@app.post("/service/", response_model=ServiceEvent)
def create_service_event(
    event: ServiceEvent,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicle = session.get(Vehicle, event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego pojazdu")

    session.add(event)
    session.commit()
    session.refresh(event)
    return event


# -------------------------------
# 📊 Spalanie
# -------------------------------
@app.get("/vehicles/{vehicle_id}/consumption")
def get_consumption(
    vehicle_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicle = session.get(Vehicle, vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do pojazdu")

    fuel_entries = session.exec(
        select(FuelEntry).where(FuelEntry.vehicle_id == vehicle_id).order_by(FuelEntry.odometer)
    ).all()

    if len(fuel_entries) < 2:
        raise HTTPException(status_code=400, detail="Za mało danych do obliczenia spalania")

    distance = fuel_entries[-1].odometer - fuel_entries[0].odometer
    liters_used = sum(entry.liters for entry in fuel_entries)
    avg_consumption = (liters_used / distance) * 100  # l/100km

    return {
        "vehicle_id": vehicle_id,
        "distance": distance,
        "liters": liters_used,
        "avg_consumption": round(avg_consumption, 2),
    }

@app.get("/fuel/vehicle/{vehicle_id}", response_model=List[FuelEntry])
def list_fuel_entries(
    vehicle_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Check if the vehicle belongs to the current user
    vehicle = session.get(Vehicle, vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do pojazdu")

    # Fetch all fuel entries for the vehicle
    fuel_entries = session.exec(
        select(FuelEntry).where(FuelEntry.vehicle_id == vehicle_id).order_by(FuelEntry.date.desc())
    ).all()

    return fuel_entries

@app.get("/service/vehicle/{vehicle_id}", response_model=List[ServiceEvent])
def list_service_events(
    vehicle_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Check if the vehicle belongs to the current user
    vehicle = session.get(Vehicle, vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do pojazdu")

    # Fetch all service events for the vehicle
    service_events = session.exec(
        select(ServiceEvent).where(ServiceEvent.vehicle_id == vehicle_id).order_by(ServiceEvent.date.desc())
    ).all()

    return service_events