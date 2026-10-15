
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)


class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)
    pickup_location = Column(String, nullable=False)
    drop_location = Column(String, nullable=False)
    passenger_name = Column(String, nullable=False)
    fare = Column(Float, nullable=False)
    status = Column(String, default="Pending")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

