from fastapi import FastAPI, Depends, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from typing import List
from datetime import timedelta, datetime as _datetime
from sqlalchemy import func
from db import init_db, get_session
import os
from models import User, Vehicle, FuelEntry, ServiceEvent, UserCreate, UserRead, Token, FuelEntryCreate, ServiceEventCreate, UserLogin
from auth import hash_password, verify_password, create_access_token, get_current_user
import time
from concurrent.futures import ThreadPoolExecutor
import threading

# Executor for background DB writes (single worker to serialize writes and avoid SQLite locking)
_executor = ThreadPoolExecutor(max_workers=1)
# Track pending futures and recent errors for debug
_pending_futures = []
_pending_lock = threading.Lock()
_recent_bg_errors: list = []
_recent_bg_errors_lock = threading.Lock()

# helper to submit and track futures
def _submit_bg(func, *args, **kwargs):
    future = _executor.submit(func, *args, **kwargs)
    with _pending_lock:
        _pending_futures.append(future)
    def _on_done(fut):
        with _pending_lock:
            try:
                _pending_futures.remove(fut)
            except ValueError:
                pass
        exc = fut.exception()
        if exc is not None:
            with _recent_bg_errors_lock:
                _recent_bg_errors.append({'error': str(exc), 'time': _datetime.utcnow().isoformat()})
                # keep last 20 errors
                if len(_recent_bg_errors) > 20:
                    _recent_bg_errors.pop(0)
    future.add_done_callback(_on_done)
    return future

# create FastAPI app instance
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
    import sys
    try:
        print("[TRACE] Received GET /")
        sys.stdout.flush()
    except Exception:
        pass
    return {"msg": "Vehicle API działa 🚀"}


# Simple health endpoint to verify server responsiveness without invoking other logic
@app.get("/health")
def health():
    import sys
    try:
        print("[TRACE] Received GET /health")
        sys.stdout.flush()
    except Exception:
        pass
    return {"status": "ok"}


# request logging middleware to help debug 404s and payloads
@app.middleware("http")
async def log_requests(request: Request, call_next):
    try:
        path = request.url.path
        method = request.method
        auth = request.headers.get('authorization')
        masked = (auth[:12] + '...') if auth else None
        print(f"[REQ] {method} {path} auth={masked}")
        # log body for service endpoints
        if path.startswith('/service'):
            try:
                body = await request.json()
            except Exception:
                body = '<unreadable>'
            print(f"[REQ] body={body}")
    except Exception:
        pass
    response = await call_next(request)
    try:
        print(f"[RES] {method} {path} -> {response.status_code}")
    except Exception:
        pass
    return response


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
    # Debug: log incoming username (do NOT log passwords in real apps)
    try:
        print(f"[DEBUG] /login/ attempt for username={form_data.username}")
    except Exception:
        print("[DEBUG] /login/ called (could not read form data)")

    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user:
        print(f"[DEBUG] /login/: user not found for {form_data.username}")
        raise HTTPException(status_code=401, detail="Nieprawidłowe dane logowania")

    if not verify_password(form_data.password, user.password_hash):
        print(f"[DEBUG] /login/: password mismatch for user id={user.id}")
        raise HTTPException(status_code=401, detail="Nieprawidłowe dane logowania")

    access_token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(hours=1))
    print(f"[DEBUG] /login/: issued token for user id={user.id}")
    return {"access_token": access_token, "token_type": "bearer"}


# Convenience JSON login for clients that prefer sending JSON
@app.post("/login-json/", response_model=Token)
def login_json(
    payload: UserLogin,
    session: Session = Depends(get_session)
):
    print(f"[DEBUG] /login-json/ attempt for username={payload.username}")
    user = session.exec(select(User).where(User.email == payload.username)).first()
    if not user:
        print(f"[DEBUG] /login-json/: user not found for {payload.username}")
        raise HTTPException(status_code=401, detail="Nieprawidłowe dane logowania")

    if not verify_password(payload.password, user.password_hash):
        print(f"[DEBUG] /login-json/: password mismatch for user id={user.id}")
        raise HTTPException(status_code=401, detail="Nieprawidłowe dane logowania")

    access_token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(hours=1))
    print(f"[DEBUG] /login-json/: issued token for user id={user.id}")
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
# Background helper functions for non-blocking writes
def _bg_create_fuel(payload: dict, user_id: int):
    from db import engine
    from sqlmodel import Session
    import time
    try:
        print(f"[BG] create_fuel queued for vehicle_id={payload.get('vehicle_id')} by user={user_id}")
        with Session(engine) as s:
            vehicle = s.get(Vehicle, payload.get('vehicle_id'))
            if not vehicle or vehicle.user_id != user_id:
                print(f"[BG] create_fuel: vehicle not found or not owned by user {user_id}")
                return
            db_entry = FuelEntry(
                vehicle_id=payload.get('vehicle_id'),
                date=payload.get('date'),
                odometer=payload.get('odometer'),
                liters=payload.get('liters'),
                price_per_liter=payload.get('price_per_liter'),
                total_cost=payload.get('total_cost'),
                notes=payload.get('notes') if 'notes' in payload else None,
            )
            s.add(db_entry)
            for attempt in range(3):
                try:
                    s.commit()
                    print(f"[BG] create_fuel committed id={db_entry.id if hasattr(db_entry,'id') else 'unknown'}")
                    break
                except Exception as e:
                    if 'database is locked' in str(e).lower() and attempt < 2:
                        s.rollback()
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    raise
    except Exception:
        import traceback
        traceback.print_exc()


def _bg_update_fuel(fuel_id: int, payload: dict, user_id: int):
    from db import engine
    from sqlmodel import Session
    import time
    try:
        print(f"[BG] update_fuel queued id={fuel_id} by user={user_id}")
        with Session(engine) as s:
            db_entry = s.get(FuelEntry, fuel_id)
            if not db_entry:
                print(f"[BG] update_fuel: entry id={fuel_id} not found")
                return
            vehicle = s.get(Vehicle, db_entry.vehicle_id)
            if not vehicle or vehicle.user_id != user_id:
                print(f"[BG] update_fuel: vehicle not found or not owned by user {user_id}")
                return
            db_entry.odometer = payload.get('odometer')
            db_entry.liters = payload.get('liters')
            db_entry.price_per_liter = payload.get('price_per_liter')
            db_entry.total_cost = payload.get('total_cost')
            db_entry.date = payload.get('date')
            for attempt in range(3):
                try:
                    s.add(db_entry)
                    s.commit()
                    print(f"[BG] update_fuel committed id={fuel_id}")
                    break
                except Exception as e:
                    if 'database is locked' in str(e).lower() and attempt < 2:
                        s.rollback()
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    raise
    except Exception:
        import traceback
        traceback.print_exc()


@app.post("/fuel/", status_code=202)
def create_fuel_entry(
    fuel: FuelEntryCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # validate ownership quick (ensure vehicle belongs to user)
    vehicle = session.get(Vehicle, fuel.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego pojazdu")

    # Validate / coerce fields
    try:
        def _to_number(val, as_int=False):
            s = str(val)
            s = s.replace(' ', '')
            s = s.replace(',', '.')
            if s == '':
                raise ValueError('Empty numeric value')
            num = float(s)
            return int(num) if as_int else num

        odometer = _to_number(fuel.odometer, as_int=True)
        liters = _to_number(fuel.liters, as_int=False)
        price_per_liter = _to_number(fuel.price_per_liter, as_int=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidłowe wartości liczbowe w polach odometer/liters/price_per_liter")

    if fuel.date is None:
        date_val = _datetime.utcnow()
    else:
        if isinstance(fuel.date, str):
            try:
                date_val = _datetime.fromisoformat(fuel.date)
            except Exception:
                raise HTTPException(status_code=400, detail="Nieprawidłowy format daty; użyj ISO 8601")
        else:
            date_val = fuel.date

    total_cost = fuel.total_cost
    if not total_cost:
        total_cost = round(liters * price_per_liter, 2)

    payload = {
        'vehicle_id': fuel.vehicle_id,
        'date': date_val,
        'odometer': odometer,
        'liters': liters,
        'price_per_liter': price_per_liter,
        'total_cost': total_cost,
        'notes': getattr(fuel, 'notes', None),
    }

    # submit to threadpool
    _submit_bg(_bg_create_fuel, payload, current_user.id)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=202, content={"status": "queued"})


@app.put("/fuel/{fuel_id}", status_code=202)
def update_fuel_entry(
    fuel_id: int,
    payload: FuelEntryCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    db_entry = session.get(FuelEntry, fuel_id)
    if not db_entry:
        raise HTTPException(status_code=404, detail="Wpis tankowania nie znaleziony")
    vehicle = session.get(Vehicle, db_entry.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego wpisu")

    # validate numbers quickly
    try:
        def _to_number(val, as_int=False):
            s = str(val)
            s = s.replace(' ', '')
            s = s.replace(',', '.')
            if s == '':
                raise ValueError('Empty numeric value')
            num = float(s)
            return int(num) if as_int else num

        odometer = _to_number(payload.odometer, as_int=True)
        liters = _to_number(payload.liters, as_int=False)
        price_per_liter = _to_number(payload.price_per_liter, as_int=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidłowe wartości liczbowe w polach odometer/liters/price_per_liter")

    if payload.date is None:
        date_val = _datetime.utcnow()
    else:
        if isinstance(payload.date, str):
            try:
                date_val = _datetime.fromisoformat(payload.date)
            except Exception:
                raise HTTPException(status_code=400, detail="Nieprawidłowy format daty; użyj ISO 8601")
        else:
            date_val = payload.date

    total_cost = payload.total_cost
    if not total_cost:
        total_cost = round(liters * price_per_liter, 2)

    bg_payload = {
        'odometer': odometer,
        'liters': liters,
        'price_per_liter': price_per_liter,
        'total_cost': total_cost,
        'date': date_val,
    }

    _submit_bg(_bg_update_fuel, fuel_id, bg_payload, current_user.id)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=202, content={"status": "queued"})


# -------------------------------
# 🧾 Service Events
# -------------------------------
@app.post("/service/")
def create_service_event(
    event: ServiceEventCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicle = session.get(Vehicle, event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego pojazdu")

    # validate/parse cost
    try:
        cost_val = float(str(event.cost).replace(' ', '').replace(',', '.'))
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidłowa wartość kosztu")

    # parse date if provided as string
    if event.date is None:
        date_val = _datetime.utcnow()
    else:
        if isinstance(event.date, str):
            try:
                date_val = _datetime.fromisoformat(event.date)
            except Exception:
                raise HTTPException(status_code=400, detail="Nieprawidłowy format daty; użyj ISO 8601")
        else:
            date_val = event.date

    db_event = ServiceEvent(
        vehicle_id=event.vehicle_id,
        date=date_val,
        type=event.type,
        description=event.description,
        cost=cost_val,
        next_due_date=event.next_due_date,
    )

    try:
        session.add(db_event)
        session.commit()
        session.refresh(db_event)
        # return a lightweight dict that includes `title` for frontend compatibility
        return JSONResponse(status_code=201, content={
            "id": db_event.id,
            "vehicle_id": db_event.vehicle_id,
            "date": db_event.date.isoformat() if hasattr(db_event.date, 'isoformat') else db_event.date,
            "title": db_event.type,
            "type": db_event.type,
            "description": db_event.description,
            "cost": db_event.cost,
            "next_due_date": db_event.next_due_date.isoformat() if db_event.next_due_date and hasattr(db_event.next_due_date, 'isoformat') else db_event.next_due_date,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@app.put("/service/{service_id}")
def update_service_event(
    service_id: int,
    payload: ServiceEventCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    print(f"[DEBUG] update_service_event called: service_id={service_id}, user_id={getattr(current_user,'id',None)}")
    try:
        print(f"[DEBUG] payload: {payload}")
    except Exception:
        pass

    # validate/parse cost up front so we can use it for both update and fallback-create
    try:
        cost_val = float(str(payload.cost).replace(' ', '').replace(',', '.'))
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidłowa wartość kosztu")

    # parse date
    if payload.date is None:
        date_val = _datetime.utcnow()
    else:
        if isinstance(payload.date, str):
            try:
                date_val = _datetime.fromisoformat(payload.date)
            except Exception:
                raise HTTPException(status_code=400, detail="Nieprawidłowy format daty; użyj ISO 8601")
        else:
            date_val = payload.date

    # parse next_due_date
    next_due = payload.next_due_date
    if next_due and isinstance(next_due, str):
        try:
            next_due = _datetime.fromisoformat(next_due)
        except Exception:
            next_due = None

    # Find existing event
    db_event = session.get(ServiceEvent, service_id)
    if not db_event:
        # Fallback: create new ServiceEvent (upsert behavior)
        print(f"[DEBUG] service id={service_id} not found — creating new event as fallback")
        vehicle = session.get(Vehicle, payload.vehicle_id)
        if not vehicle or vehicle.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Nie masz dostępu do tego pojazdu")

        new_event = ServiceEvent(
            vehicle_id=payload.vehicle_id,
            date=date_val,
            type=payload.type,
            description=payload.description,
            cost=cost_val,
            next_due_date=next_due,
        )
        try:
            session.add(new_event)
            session.commit()
            session.refresh(new_event)
            return JSONResponse(status_code=201, content={
                "id": new_event.id,
                "vehicle_id": new_event.vehicle_id,
                "date": new_event.date.isoformat() if hasattr(new_event.date, 'isoformat') else new_event.date,
                "title": new_event.type,
                "type": new_event.type,
                "description": new_event.description,
                "cost": new_event.cost,
                "next_due_date": new_event.next_due_date.isoformat() if new_event.next_due_date and hasattr(new_event.next_due_date, 'isoformat') else new_event.next_due_date,
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

    # Ensure vehicle belongs to user
    vehicle = session.get(Vehicle, db_event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego wpisu")

    # apply updates
    db_event.type = payload.type
    db_event.description = payload.description
    db_event.cost = cost_val
    db_event.date = date_val
    db_event.next_due_date = next_due

    try:
        session.add(db_event)
        session.commit()
        session.refresh(db_event)
        # return dict with `title` for frontend compatibility
        return JSONResponse(status_code=200, content={
            "id": db_event.id,
            "vehicle_id": db_event.vehicle_id,
            "date": db_event.date.isoformat() if hasattr(db_event.date, 'isoformat') else db_event.date,
            "title": db_event.type,
            "type": db_event.type,
            "description": db_event.description,
            "cost": db_event.cost,
            "next_due_date": db_event.next_due_date.isoformat() if db_event.next_due_date and hasattr(db_event.next_due_date, 'isoformat') else db_event.next_due_date,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@app.get("/service/{service_id}")
def get_service_event(
    service_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return a single service event as dict (includes `title`). Useful for edit UI and debugging."""
    print(f"[DEBUG] get_service_event called: service_id={service_id}, user_id={getattr(current_user,'id',None)}")
    db_event = session.get(ServiceEvent, service_id)
    if not db_event:
        # For debugging, list up to 20 service ids for the vehicle(s) owned by user
        try:
            rows = session.exec(select(ServiceEvent.id).where(ServiceEvent.vehicle_id == ServiceEvent.vehicle_id)).all()
        except Exception:
            rows = []
        print(f"[DEBUG] get_service_event: not found; sample_service_ids_for_user={rows[:20]}")
        raise HTTPException(status_code=404, detail="Wpis serwisu nie znaleziony")

    vehicle = session.get(Vehicle, db_event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego wpisu")

    return {
        "id": db_event.id,
        "vehicle_id": db_event.vehicle_id,
        "date": db_event.date.isoformat() if hasattr(db_event.date, 'isoformat') else db_event.date,
        "title": db_event.type,
        "type": db_event.type,
        "description": db_event.description,
        "cost": db_event.cost,
        "next_due_date": db_event.next_due_date.isoformat() if db_event.next_due_date and hasattr(db_event.next_due_date, 'isoformat') else db_event.next_due_date,
    }

# improve delete logging: when item not found, dump service ids for that vehicle/user to help debugging
@app.delete("/service/{service_id}", status_code=204)
def delete_service_event(
    service_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    print(f"[DEBUG] delete_service_event called: service_id={service_id}, user_id={getattr(current_user,'id',None)}")

    db_event = session.get(ServiceEvent, service_id)
    if not db_event:
        try:
            # list service ids for vehicles owned by current user
            owned_vehicle_ids = [v.id for v in session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()]
            existing_ids = session.exec(select(ServiceEvent.id).where(ServiceEvent.vehicle_id.in_(owned_vehicle_ids))).all() if owned_vehicle_ids else []
        except Exception as e:
            existing_ids = []
            print(f"[DEBUG] delete_service_event: error while listing existing ids: {e}")
        print(f"[DEBUG] delete_service_event: service_id {service_id} not found. existing_service_ids_for_user={existing_ids[:50]}")
        # Return helpful JSON to the client so it can refresh the UI and show debugging info
        return JSONResponse(status_code=404, content={
            "detail": "Wpis serwisu nie znaleziony",
            "existing_service_ids_for_user": existing_ids[:200],
        })

    vehicle = session.get(Vehicle, db_event.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego wpisu")

    try:
        session.delete(db_event)
        session.commit()
        return Response(status_code=204)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


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
    if distance <= 0:
        raise HTTPException(status_code=400, detail="Nieprawidłowe wskazania licznika (dystans musi być większy niż 0)")
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

@app.get("/service/vehicle/{vehicle_id}")
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

    # Map to dicts including `title` for backward compatibility with frontend
    mapped = []
    for se in service_events:
        mapped.append({
            "id": se.id,
            "vehicle_id": se.vehicle_id,
            "date": se.date.isoformat() if hasattr(se.date, 'isoformat') else se.date,
            "title": se.type,
            "type": se.type,
            "description": se.description,
            "cost": se.cost,
            "next_due_date": se.next_due_date.isoformat() if se.next_due_date and hasattr(se.next_due_date, 'isoformat') else se.next_due_date,
        })

    return mapped

@app.get("/debug/dbpath")
def debug_dbpath():
    try:
        from db import DATABASE_URL, DATABASE_FILE
        return {"database_url": DATABASE_URL, "database_file": DATABASE_FILE}
    except Exception as e:
        return {"error": str(e)}

@app.get("/debug/counts")
def debug_counts(session: Session = Depends(get_session)):
    try:
        # Use SQL COUNT aggregation for robust counts
        users = session.exec(select(func.count()).select_from(User)).scalar_one()
        vehicles = session.exec(select(func.count()).select_from(Vehicle)).scalar_one()
        fuel = session.exec(select(func.count()).select_from(FuelEntry)).scalar_one()
        service = session.exec(select(func.count()).select_from(ServiceEvent)).scalar_one()
        return {
            "users": int(users),
            "vehicles": int(vehicles),
            "fuel_entries": int(fuel),
            "service_events": int(service),
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/debug/queue")
def debug_queue():
    # Show pending background futures
    with _pending_lock:
        pending = len(_pending_futures)
    return {"pending_background_tasks": pending}

@app.get("/debug/bg-errors")
def debug_bg_errors():
    # Show recent background errors
    with _recent_bg_errors_lock:
        errors = list(_recent_bg_errors)  # copy the list to return
    return {"recent_background_errors": errors}

@app.get("/debug/me")
def debug_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}

@app.get("/debug/service-ids")
def debug_service_ids(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Return service event ids for vehicles owned by current user."""
    try:
        vehicles = session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()
        vehicle_ids = [v.id for v in vehicles]
        service_rows = session.exec(select(ServiceEvent.id, ServiceEvent.vehicle_id).where(ServiceEvent.vehicle_id.in_(vehicle_ids))).all() if vehicle_ids else []
        # convert list of tuples to list of dicts
        out = [{"id": r[0], "vehicle_id": r[1]} for r in service_rows]
        return {"service_count": len(out), "services": out}
    except Exception as e:
        return {"error": str(e)}


@app.post("/service/upsert")
def upsert_service_event(
    payload: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create or update a service event. Accepts a JSON payload; if payload contains 'id' and entry exists, it's updated; otherwise a new entry is created."""
    try:
        sid = payload.get('id')
        # basic parsing/validation
        try:
            cost_val = float(str(payload.get('cost', 0)).replace(' ', '').replace(',', '.'))
        except Exception:
            raise HTTPException(status_code=400, detail='Nieprawidłowa wartość kosztu')

        date_val = payload.get('date')
        if date_val is None:
            date_val = _datetime.utcnow()
        else:
            if isinstance(date_val, str):
                try:
                    date_val = _datetime.fromisoformat(date_val)
                except Exception:
                    raise HTTPException(status_code=400, detail='Nieprawidłowy format daty; użyj ISO 8601')

        next_due = payload.get('next_due_date')
        if next_due and isinstance(next_due, str):
            try:
                next_due = _datetime.fromisoformat(next_due)
            except Exception:
                next_due = None

        # If id provided, try update
        if sid:
            db_event = session.get(ServiceEvent, int(sid))
            if db_event:
                vehicle = session.get(Vehicle, db_event.vehicle_id)
                if not vehicle or vehicle.user_id != current_user.id:
                    raise HTTPException(status_code=403, detail='Nie masz dostępu do tego wpisu')
                db_event.type = payload.get('type', db_event.type)
                db_event.description = payload.get('description', db_event.description)
                db_event.cost = cost_val
                db_event.date = date_val
                db_event.next_due_date = next_due
                session.add(db_event)
                session.commit()
                session.refresh(db_event)
                return JSONResponse(status_code=200, content={
                    'id': db_event.id,
                    'vehicle_id': db_event.vehicle_id,
                    'date': db_event.date.isoformat() if hasattr(db_event.date,'isoformat') else db_event.date,
                    'title': db_event.type,
                    'type': db_event.type,
                    'description': db_event.description,
                    'cost': db_event.cost,
                    'next_due_date': db_event.next_due_date.isoformat() if db_event.next_due_date and hasattr(db_event.next_due_date,'isoformat') else db_event.next_due_date,
                })
            # if id provided but not found, fallthrough to create

        # create new entry: ensure vehicle belongs to user
        vehicle_id = payload.get('vehicle_id')
        vehicle = session.get(Vehicle, vehicle_id)
        if not vehicle or vehicle.user_id != current_user.id:
            raise HTTPException(status_code=403, detail='Nie masz dostępu do tego pojazdu')

        new_event = ServiceEvent(
            vehicle_id=vehicle_id,
            date=date_val,
            type=payload.get('type', ''),
            description=payload.get('description', None),
            cost=cost_val,
            next_due_date=next_due,
        )
        session.add(new_event)
        session.commit()
        session.refresh(new_event)
        return JSONResponse(status_code=201, content={
            'id': new_event.id,
            'vehicle_id': new_event.vehicle_id,
            'date': new_event.date.isoformat() if hasattr(new_event.date,'isoformat') else new_event.date,
            'title': new_event.type,
            'type': new_event.type,
            'description': new_event.description,
            'cost': new_event.cost,
            'next_due_date': new_event.next_due_date.isoformat() if new_event.next_due_date and hasattr(new_event.next_due_date,'isoformat') else new_event.next_due_date,
        })
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'Internal server error: {e}')
