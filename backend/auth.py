from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from db import get_session
from models import User

import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")  # 🔒 prefer setting in .env.docker
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login/")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nieprawidłowy token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError as je:
            # Log the JWT error for diagnostics without leaking sensitive token content
            try:
                masked = token[:8] + '...' if token else '<empty>'
            except Exception:
                masked = '<unreadable>'
            print(f"[AUTH] JWT decode error: {je}; token(start)={masked}")
            raise credentials_exception

        user_id: str = payload.get("sub")
        if user_id is None:
            print(f"[AUTH] JWT payload missing 'sub': {payload}")
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = session.exec(select(User).where(User.id == int(user_id))).first()
    if user is None:
        print(f"[AUTH] user not found for id={user_id}")
        raise credentials_exception
    return user
