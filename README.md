# 🚕 CabGo – Cab Booking Platform

CabGo is a cab booking web application built using React and FastAPI.

## Features
- User Registration and Login
- Book a Cab
- View Ride History
- Cancel Eligible Rides
- Admin Dashboard
- Manage Ride Status
- Form Validation

## Technologies Used
- Frontend: React, Vite, CSS
- Backend: Python, FastAPI
- Database: SQLite
- ORM: SQLAlchemy

## Project Structure
- `backend/` – API, database models, authentication and ride management
- `frontend/frontend/` – React user interface

## How to Run

### Backend
```bash
cd backend
python -m venv venv
```

Activate the virtual environment in Windows PowerShell:
```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies and start the API:
```bash
pip install -r requirements.txt
python migrate_db.py
uvicorn main:app --reload
```

Backend API: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

### Frontend
Open a second terminal:
```bash
cd frontend/frontend
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Security
Never upload passwords, secret keys, or private environment files. Configure secure secrets before deployment.

## Author
**Dhanashri Gite**

GitHub: https://github.com/dhanashrigite