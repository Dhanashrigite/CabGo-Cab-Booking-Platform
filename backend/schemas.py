
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    email: str = Field(min_length=5, max_length=150)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str

    class Config:
        from_attributes = True


class RideCreate(BaseModel):
    pickup_location: str
    drop_location: str
    passenger_name: str
    fare: float = Field(gt=0)


class RideResponse(BaseModel):
    id: int
    pickup_location: str
    drop_location: str
    passenger_name: str
    fare: float
    status: str
    user_id: int | None = None

    class Config:
        from_attributes = True

