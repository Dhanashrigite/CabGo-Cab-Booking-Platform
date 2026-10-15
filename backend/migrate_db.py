
import sqlite3

from database import Base, engine
import models

# Create any missing tables
Base.metadata.create_all(bind=engine)

# Preserve the existing SQLite database
connection = sqlite3.connect("cab_booking.db")

columns = [
    row[1]
    for row in connection.execute("PRAGMA table_info(rides)")
]

if "user_id" not in columns:
    connection.execute(
        "ALTER TABLE rides ADD COLUMN user_id INTEGER REFERENCES users(id)"
    )
    connection.commit()
    print("Database updated: user_id column added.")
else:
    print("Database is already updated.")

connection.close()
