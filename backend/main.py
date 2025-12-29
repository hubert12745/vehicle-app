from fastapi import FastAPI, Depends, HTTPException, status, Response, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select
from typing import List
from datetime import timedelta, datetime as _datetime
from sqlalchemy import func
from db import init_db, get_session
import os
from models import User, Vehicle, FuelEntry, ServiceEvent, UserCreate, UserRead, Token, FuelEntryCreate, ServiceEventCreate, UserLogin, VehicleCreate, VehicleRead
from auth import hash_password, verify_password, create_access_token, get_current_user
import time
from concurrent.futures import ThreadPoolExecutor
import threading
import shutil
import uuid

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
    # Ensure tables exist
    init_db()

    # Ensure uploads directory exists
    try:
        uploads_dir = os.path.join(os.path.dirname(__file__), '..', 'uploads')
        uploads_dir = os.path.abspath(uploads_dir)
        if not os.path.exists(uploads_dir):
            os.makedirs(uploads_dir, exist_ok=True)
            print(f"[STARTUP] Created uploads directory at {uploads_dir}")
    except Exception as e:
        print(f"[STARTUP] Failed to ensure uploads dir: {e}")

    # Run lightweight migration: add optional columns to vehicle table if missing
    try:
        from db import engine
        from sqlmodel import text
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info('vehicle')")).all()
            existing_cols = [r[1] for r in res]
            if 'vin' not in existing_cols:
                print('[MIGRATE] Adding column vehicle.vin')
                try:
                    conn.execute(text("ALTER TABLE vehicle ADD COLUMN vin TEXT;"))
                except Exception as e:
                    print(f"[MIGRATE] Failed to add vin: {e}")
            else:
                print('[MIGRATE] Column vehicle.vin already present')

            if 'start_odometer' not in existing_cols:
                print('[MIGRATE] Adding column vehicle.start_odometer')
                try:
                    conn.execute(text("ALTER TABLE vehicle ADD COLUMN start_odometer INTEGER;"))
                except Exception as e:
                    print(f"[MIGRATE] Failed to add start_odometer: {e}")
            else:
                print('[MIGRATE] Column vehicle.start_odometer already present')

            # Ensure fuelentry.receipt_photo exists
            try:
                res2 = conn.execute(text("PRAGMA table_info('fuelentry')")).all()
                fuel_cols = [r[1] for r in res2]
                if 'receipt_photo' not in fuel_cols:
                    print('[MIGRATE] Adding column fuelentry.receipt_photo')
                    try:
                        conn.execute(text("ALTER TABLE fuelentry ADD COLUMN receipt_photo TEXT;"))
                    except Exception as e:
                        print(f"[MIGRATE] Failed to add receipt_photo: {e}")
                else:
                    print('[MIGRATE] Column fuelentry.receipt_photo already present')
            except Exception as e:
                print(f"[MIGRATE] Failed to check/add fuelentry.receipt_photo: {e}")
    except Exception as e:
        # Migration should not prevent app startup; log and continue
        print(f"[MIGRATE] Migration check failed: {e}")

# Mount uploads directory for static serving
try:
    uploads_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
    app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")
    print(f"[STARTUP] Mounted uploads at /uploads from {uploads_path}")
except Exception as e:
    print(f"[STARTUP] Failed to mount uploads: {e}")


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
        # log body for service endpoints and vehicle creation to diagnose 422 issues
        if path.startswith('/service') or path.startswith('/vehicles'):
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
@app.get("/vehicles/", response_model=List[VehicleRead])
def list_vehicles(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    vehicles = session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()
    return vehicles


@app.post("/vehicles/", response_model=VehicleRead, status_code=201)
def create_vehicle(
    payload: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Minimal server-side validation so clients aren't blocked by Pydantic 422
    make = payload.get('make')
    model = payload.get('model')
    if not make or not model:
        raise HTTPException(status_code=400, detail="Pole 'make' i 'model' są wymagane")

    year = payload.get('year')
    registration = payload.get('registration')
    vin = payload.get('vin')
    start_odometer = payload.get('start_odometer')

    try:
        db_vehicle = Vehicle(
            user_id=current_user.id,
            make=str(make),
            model=str(model),
            year=int(year) if year is not None and str(year) != '' else None,
            registration=str(registration) if registration is not None else None,
            vin=str(vin) if vin is not None else None,
            start_odometer=int(start_odometer) if start_odometer is not None and str(start_odometer) != '' else None,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nieprawidłowe wartości pól: {e}")

    session.add(db_vehicle)
    session.commit()
    session.refresh(db_vehicle)

    return db_vehicle


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


@app.put("/fuel/{fuel_id}")
def update_fuel_entry(
    fuel_id: int,
    payload: FuelEntryCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Synchronously update a fuel entry and return the updated object.

    This replaces the previous background-queued update to allow the frontend
    to receive the updated entry immediately for instant UI updates.
    """
    # Load existing entry
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

    total_cost = payload.total_cost
    if not total_cost:
        total_cost = round(liters * price_per_liter, 2)

    # Apply updates
    db_entry.odometer = odometer
    db_entry.liters = liters
    db_entry.price_per_liter = price_per_liter
    db_entry.total_cost = total_cost
    db_entry.date = date_val
    # preserve optional notes if model supports
    if hasattr(db_entry, 'notes') and getattr(payload, 'notes', None) is not None:
        db_entry.notes = getattr(payload, 'notes')

    # commit with small retry loop to mitigate transient SQLite locks
    import time as _time
    for attempt in range(3):
        try:
            session.add(db_entry)
            session.commit()
            session.refresh(db_entry)
            # return a plain dict for frontend compatibility
            return {
                'id': db_entry.id,
                'vehicle_id': db_entry.vehicle_id,
                'date': db_entry.date.isoformat() if hasattr(db_entry.date, 'isoformat') else db_entry.date,
                'odometer': db_entry.odometer,
                'liters': db_entry.liters,
                'price_per_liter': db_entry.price_per_liter,
                'total_cost': db_entry.total_cost,
                'notes': getattr(db_entry, 'notes', None),
            }
        except Exception as e:
            # If database is locked, retry after a short backoff
            msg = str(e).lower()
            if 'database is locked' in msg and attempt < 2:
                try:
                    session.rollback()
                except Exception:
                    pass
                import time as _time
                _time.sleep(0.25 * (attempt + 1))
                continue
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

# New: DELETE fuel endpoint
@app.delete("/fuel/{fuel_id}", status_code=204)
def delete_fuel_entry(
    fuel_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    print(f"[DEBUG] delete_fuel_entry called: fuel_id={fuel_id}, user_id={getattr(current_user,'id',None)}")

    db_entry = session.get(FuelEntry, fuel_id)
    if not db_entry:
        try:
            # list fuel ids for vehicles owned by current user
            owned_vehicle_ids = [v.id for v in session.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()]
            existing_ids = session.exec(select(FuelEntry.id).where(FuelEntry.vehicle_id.in_(owned_vehicle_ids))).all() if owned_vehicle_ids else []
        except Exception as e:
            existing_ids = []
            print(f"[DEBUG] delete_fuel_entry: error while listing existing ids: {e}")
        print(f"[DEBUG] delete_fuel_entry: fuel_id {fuel_id} not found. existing_fuel_ids_for_user={existing_ids[:50]}")
        return JSONResponse(status_code=404, content={
            "detail": "Wpis tankowania nie znaleziony",
            "existing_fuel_ids_for_user": existing_ids[:200],
        })

    vehicle = session.get(Vehicle, db_entry.vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tego wpisu")

    try:
        session.delete(db_entry)
        session.commit()
        return Response(status_code=204)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


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

# -------------------------------
# 📊 Reports
# -------------------------------
@app.get("/reports/monthly")
def monthly_report(
    vehicle_id: int,
    year: int,
    month: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return monthly report JSON for a vehicle: total cost, total liters, distance, avg consumption, and daily breakdown.

    Query params: vehicle_id, year, month
    """
    # validate vehicle ownership
    vehicle = session.get(Vehicle, vehicle_id)
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do tego pojazdu")

    # compute date range
    try:
        from datetime import datetime, timedelta
        start = datetime(year=year, month=month, day=1)
        # compute first day of next month
        if month == 12:
            next_month = datetime(year=year + 1, month=1, day=1)
        else:
            next_month = datetime(year=year, month=month + 1, day=1)
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidłowy rok/miesiąc")

    # fetch fuel entries in range (inclusive start, exclusive next_month)
    rows = session.exec(
        select(FuelEntry).where(
            FuelEntry.vehicle_id == vehicle_id,
            FuelEntry.date >= start,
            FuelEntry.date < next_month,
        ).order_by(FuelEntry.date)
    ).all()

    if not rows:
        return {
            "vehicle_id": vehicle_id,
            "year": year,
            "month": month,
            "total_cost": 0.0,
            "total_liters": 0.0,
            "distance": 0,
            "avg_consumption": None,
            "entries": [],
        }

    # For consumption we need distance: use odometer min and max across entries within month
    odometers = [r.odometer for r in rows if isinstance(r.odometer, (int, float))]
    if len(odometers) >= 2:
        distance = max(odometers) - min(odometers)
    else:
        distance = 0

    total_liters = sum([r.liters for r in rows if isinstance(r.liters, (int, float))])
    total_cost = sum([r.total_cost if getattr(r, 'total_cost', None) is not None else 0.0 for r in rows])

    avg_consumption = None
    if distance > 0:
        try:
            avg_consumption = round((total_liters / distance) * 100, 2)
        except Exception:
            avg_consumption = None

    # daily breakdown for chart: group by day
    daily = {}
    for r in rows:
        day = r.date.date().isoformat()
        if day not in daily:
            daily[day] = {"liters": 0.0, "cost": 0.0, "count": 0}
        daily[day]["liters"] += float(r.liters)
        daily[day]["cost"] += float(r.total_cost if getattr(r, 'total_cost', None) is not None else 0.0)
        daily[day]["count"] += 1

    # convert to sorted list
    daily_list = []
    for day in sorted(daily.keys()):
        daily_list.append({"day": day, "liters": round(daily[day]["liters"], 3), "cost": round(daily[day]["cost"], 2)})

    return {
        "vehicle_id": vehicle_id,
        "year": year,
        "month": month,
        "total_cost": round(total_cost, 2),
        "total_liters": round(total_liters, 3),
        "distance": distance,
        "avg_consumption": avg_consumption,
        "entries": [
            {
                "id": r.id,
                "date": r.date.isoformat() if hasattr(r.date, 'isoformat') else r.date,
                "odometer": r.odometer,
                "liters": r.liters,
                "price_per_liter": r.price_per_liter,
                "total_cost": r.total_cost,
                "notes": getattr(r, 'notes', None),
            }
            for r in rows
        ],
        "daily": daily_list,
    }


@app.get("/reports/monthly/csv")
def monthly_report_csv(
    vehicle_id: int,
    year: int,
    month: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return a CSV attachment with fuel entries for the requested month and summary as header rows."""
    # reuse logic: call monthly_report to get data
    data = monthly_report(vehicle_id=vehicle_id, year=year, month=month, session=session, current_user=current_user)

    # build CSV content
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)

    # summary rows
    writer.writerow([f"Vehicle ID", data.get('vehicle_id')])
    writer.writerow([f"Year", data.get('year')])
    writer.writerow([f"Month", data.get('month')])
    writer.writerow([f"Total Cost", data.get('total_cost')])
    writer.writerow([f"Total Liters", data.get('total_liters')])
    writer.writerow([f"Distance", data.get('distance')])
    writer.writerow([f"Avg Consumption (l/100km)", data.get('avg_consumption')])
    writer.writerow([])

    # header for entries
    writer.writerow(["id", "date", "odometer", "liters", "price_per_liter", "total_cost", "notes"])

    # Ensure entries are sorted by date (ascending). Parse ISO dates robustly.
    def _parse_date_iso(s):
        from datetime import datetime
        try:
            if s is None:
                return datetime.min
            if isinstance(s, str):
                # handle possible timezone 'Z' or offsets
                try:
                    return datetime.fromisoformat(s)
                except Exception:
                    # strip Z and try
                    if s.endswith('Z'):
                        try:
                            return datetime.fromisoformat(s[:-1])
                        except Exception:
                            return datetime.min
                    return datetime.min
            # if already a datetime object
            return s
        except Exception:
            return datetime.min

    entries = data.get('entries', []) or []
    try:
        entries_sorted = sorted(entries, key=lambda e: _parse_date_iso(e.get('date')))
    except Exception:
        entries_sorted = entries

    for e in entries_sorted:
        writer.writerow([e.get('id'), e.get('date'), e.get('odometer'), e.get('liters'), e.get('price_per_liter'), e.get('total_cost'), e.get('notes')])

    csv_text = output.getvalue()
    output.close()

    from fastapi.responses import Response
    filename = f"report_vehicle_{vehicle_id}_{year}_{str(month).zfill(2)}.csv"
    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"",
        "Content-Type": "text/csv; charset=utf-8",
    }
    return Response(content=csv_text, media_type="text/csv", headers=headers)

@app.post('/fuel/upload', status_code=201)
def upload_fuel_with_receipt(
    vehicle_id: int = Form(...),
    odometer: int = Form(...),
    liters: float = Form(...),
    price_per_liter: float = Form(...),
    total_cost: float = Form(None),
    date: str = Form(None),
    notes: str = Form(None),
    receipt: UploadFile = File(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a fuel entry from multipart/form-data and optionally upload a receipt image.
    Fields: vehicle_id, odometer, liters, price_per_liter, total_cost (optional), date (ISO str optional), notes (optional), receipt (file optional)
    """
    # Validate ownership
    vehicle = session.get(Vehicle, int(vehicle_id))
    if not vehicle or vehicle.user_id != current_user.id:
        raise HTTPException(status_code=403, detail='Nie masz dostępu do tego pojazdu')

    # parse numbers
    try:
        odometer_v = int(odometer)
        liters_v = float(str(liters).replace(',', '.'))
        price_v = float(str(price_per_liter).replace(',', '.'))
    except Exception:
        raise HTTPException(status_code=400, detail='Nieprawidłowe wartości liczbowe')

    # parse date if provided
    if date:
        try:
            from datetime import datetime
            date_val = datetime.fromisoformat(date)
        except Exception:
            date_val = None
    else:
        date_val = None

    total_cost_v = None
    if total_cost is not None and total_cost != '':
        try:
            total_cost_v = float(str(total_cost).replace(',', '.'))
        except Exception:
            total_cost_v = None
    if total_cost_v is None:
        total_cost_v = round(liters_v * price_v, 2)

    # handle file
    receipt_relative = None
    if receipt is not None:
        try:
            # Ensure uploads dir
            uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
            ext = os.path.splitext(receipt.filename)[1] if receipt.filename else ''
            safe_name = f"receipt_{current_user.id}_{int(time.time())}_{uuid.uuid4().hex}{ext}"
            dest_path = os.path.join(uploads_dir, safe_name)
            # write file to disk
            with open(dest_path, 'wb') as out_f:
                shutil.copyfileobj(receipt.file, out_f)
            # store relative path (relative to project root)
            receipt_relative = os.path.join('uploads', safe_name).replace('\\', '/')
        except Exception as e:
            print(f"[UPLOAD] Failed to save uploaded receipt: {e}")
            raise HTTPException(status_code=500, detail='Nie udało się zapisać pliku')

    # create FuelEntry
    from datetime import datetime
    if date_val is None:
        date_val = datetime.utcnow()

    new_entry = FuelEntry(
        vehicle_id=int(vehicle_id),
        date=date_val,
        odometer=odometer_v,
        liters=liters_v,
        price_per_liter=price_v,
        total_cost=total_cost_v,
        notes=notes,
        receipt_photo=receipt_relative,
    )
    try:
        session.add(new_entry)
        session.commit()
        session.refresh(new_entry)
    except SQLAlchemyError as e:
        session.rollback()
        print(f"[DB] Failed to create fuel entry: {e}")
        raise HTTPException(status_code=500, detail='Błąd zapisu do bazy')

    return {
        'id': new_entry.id,
        'vehicle_id': new_entry.vehicle_id,
        'date': new_entry.date.isoformat() if hasattr(new_entry.date, 'isoformat') else new_entry.date,
        'odometer': new_entry.odometer,
        'liters': new_entry.liters,
        'price_per_liter': new_entry.price_per_liter,
        'total_cost': new_entry.total_cost,
        'notes': new_entry.notes,
        'receipt_photo': new_entry.receipt_photo,
    }
