
from getpass import getpass

from database import Base, engine, SessionLocal
from pwdlib import PasswordHash
import models

Base.metadata.create_all(bind=engine)

password_hash = PasswordHash.recommended()
db = SessionLocal()

try:
    username = input("Admin username: ").strip()
    email = input("Admin email: ").strip().lower()
    password = getpass("Admin password (minimum 8 characters): ")

    if not username or "@" not in email or len(password) < 8:
        raise ValueError("Enter a username, valid email and password of at least 8 characters.")

    admin = db.query(models.User).filter(
        models.User.email == email
    ).first()

    if admin:
        admin.username = username
        admin.password_hash = password_hash.hash(password)
        admin.role = "admin"
        print("Existing account updated to admin.")
    else:
        admin = models.User(
            username=username,
            email=email,
            password_hash=password_hash.hash(password),
            role="admin",
        )
        db.add(admin)
        print("Admin account created.")

    db.commit()

except Exception as error:
    db.rollback()
    print("Could not create admin:", error)

finally:
    db.close()
