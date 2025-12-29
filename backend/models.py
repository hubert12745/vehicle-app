from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime


# =======================
# ORM MODELE (tabele)
# =======================

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    vehicles: List["Vehicle"] = Relationship(back_populates="owner")


class Vehicle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    make: str
    model: str
    year: Optional[int] = None
    registration: Optional[str] = None
    vin: Optional[str] = None
    start_odometer: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    owner: User = Relationship(back_populates="vehicles")
    fuel_entries: List["FuelEntry"] = Relationship(back_populates="vehicle")
    service_events: List["ServiceEvent"] = Relationship(back_populates="vehicle")


class FuelEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicle.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    odometer: int
    liters: float
    price_per_liter: float
    total_cost: float
    notes: Optional[str] = None
    receipt_photo: Optional[str] = None

    vehicle: Vehicle = Relationship(back_populates="fuel_entries")


class ServiceEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicle.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    type: str
    description: Optional[str] = None
    cost: float
    next_due_date: Optional[datetime] = None

    vehicle: Vehicle = Relationship(back_populates="service_events")


# =======================
# CREATE / READ MODELE (API)
# =======================

# --- User ---
class UserCreate(SQLModel):
    email: str
    password: str

class UserRead(SQLModel):
    id: int
    email: str
    created_at: datetime


# --- Vehicle ---
class VehicleCreate(SQLModel):
    # user_id removed: server assigns owner from authenticated user
    make: str
    model: str
    year: Optional[int] = None
    registration: Optional[str] = None
    vin: Optional[str] = None
    start_odometer: Optional[int] = None


class VehicleRead(SQLModel):
    id: int
    make: str
    model: str
    registration: Optional[str] = None
    vin: Optional[str] = None
    start_odometer: Optional[int] = None
    created_at: datetime


# --- FuelEntry ---
class FuelEntryCreate(SQLModel):
    vehicle_id: int
    date: Optional[datetime] = None
    odometer: int
    liters: float
    price_per_liter: float
    total_cost: Optional[float] = None
    notes: Optional[str] = None


class FuelEntryRead(SQLModel):
    id: int
    date: datetime
    odometer: int
    liters: float
    price_per_liter: float
    total_cost: float
    notes: Optional[str] = None
    receipt_photo: Optional[str] = None


# --- ServiceEvent ---
class ServiceEventCreate(SQLModel):
    vehicle_id: int
    date: Optional[datetime] = None
    type: str
    description: Optional[str] = None
    cost: float
    next_due_date: Optional[datetime] = None


class ServiceEventRead(SQLModel):
    id: int
    date: datetime
    type: str
    description: Optional[str] = None
    cost: float
    next_due_date: Optional[datetime] = None

# --- Auth ---
class UserLogin(SQLModel):
    username: str
    password: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"
