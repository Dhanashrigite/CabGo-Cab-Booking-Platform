
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from fastapi import (
    FastAPI, Depends, HTTPException, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import models
import schemas
from database import Base, engine, SessionLocal


# Local development secret. Change this before deployment.
import os

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

password_hash = PasswordHash.recommended()
security = HTTPBearer(auto_error=False)

app = FastAPI(title="CabGo Cab Booking Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_access_token(user):
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "exp": expires,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in first",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (InvalidTokenError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login. Please log in again.",
        )

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
        )

    return user


def require_admin(
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return current_user


@app.get("/")
def home():
    return {
        "message": "Welcome to CabGo!",
        "status": "Backend is running",
    }


# User registration
@app.post("/api/auth/register")
def register_user(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    email = user_data.email.strip().lower()
    username = user_data.username.strip()

    if not username or not email or "@" not in email:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid username and email",
        )

    user = models.User(
        username=username,
        email=email,
        password_hash=password_hash.hash(user_data.password),
        role="user",
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This email is already registered",
        )

    return {
        "message": "Registration successful. Please log in.",
    }


# User login
@app.post("/api/auth/login")
def login_user(
    login_data: schemas.LoginRequest,
    db: Session = Depends(get_db),
):
    email = login_data.email.strip().lower()

    user = db.query(models.User).filter(
        models.User.email == email
    ).first()

    if (
        user is None
        or not password_hash.verify(
            login_data.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    token = create_access_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


# Get current logged-in user
@app.get("/api/auth/me", response_model=schemas.UserResponse)
def get_me(
    current_user: models.User = Depends(get_current_user),
):
    return current_user


# User's own booking history
@app.get("/api/rides", response_model=list[schemas.RideResponse])
def get_my_rides(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Ride)
        .filter(models.Ride.user_id == current_user.id)
        .order_by(models.Ride.id.desc())
        .all()
    )


# Admin can see all bookings
@app.get(
    "/api/admin/rides",
    response_model=list[schemas.RideResponse],
)
def get_all_rides(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    return (
        db.query(models.Ride)
        .order_by(models.Ride.id.desc())
        .all()
    )


# Book a ride
@app.post("/api/rides", response_model=schemas.RideResponse)
def create_ride(
    ride_data: schemas.RideCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    new_ride = models.Ride(
        pickup_location=ride_data.pickup_location.strip(),
        drop_location=ride_data.drop_location.strip(),
        passenger_name=ride_data.passenger_name.strip(),
        fare=ride_data.fare,
        status="Pending",
        user_id=current_user.id,
    )

    db.add(new_ride)
    db.commit()
    db.refresh(new_ride)

    return new_ride


# Update status: admin can manage rides;
# users can only cancel their own active rides.
@app.patch("/api/rides/{ride_id}/status")
def update_ride_status(
    ride_id: int,
    status_value: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    allowed_statuses = [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
    ]

    if status_value not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid ride status",
        )

    ride = db.query(models.Ride).filter(
        models.Ride.id == ride_id
    ).first()

    if ride is None:
        raise HTTPException(
            status_code=404,
            detail="Ride not found",
        )

    if current_user.role != "admin":
        if ride.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot modify another user's booking",
            )

        if status_value != "Cancelled":
            raise HTTPException(
                status_code=403,
                detail="Only admins can confirm or complete rides",
            )

        if ride.status not in ["Pending", "Confirmed"]:
            raise HTTPException(
                status_code=400,
                detail="This ride cannot be cancelled",
            )

    ride.status = status_value
    db.commit()
    db.refresh(ride)

    return {
        "message": "Ride status updated successfully",
        "ride_id": ride.id,
        "status": ride.status,
    }


# Delete: users can delete their own pending rides;
# admin can delete any ride.
@app.delete("/api/rides/{ride_id}")
def delete_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ride = db.query(models.Ride).filter(
        models.Ride.id == ride_id
    ).first()

    if ride is None:
        raise HTTPException(
            status_code=404,
            detail="Ride not found",
        )

    if current_user.role != "admin":
        if ride.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot delete another user's booking",
            )

        if ride.status != "Pending":
            raise HTTPException(
                status_code=403,
                detail="Only pending bookings can be deleted",
            )

    db.delete(ride)
    db.commit()

    return {
        "message": "Booking deleted successfully",
        "ride_id": ride_id,
    }


