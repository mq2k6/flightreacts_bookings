import bcrypt
import jwt
import os

from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, text
from fastapi.middleware.cors import CORSMiddleware

# Load .env from the same directory as main.py
load_dotenv()

app = FastAPI()

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL was not found in .env")

if not JWT_SECRET:
    raise ValueError("JWT_SECRET was not found in .env")

engine = create_engine(DATABASE_URL)

JWT_ALGORITHM = "HS256"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Login request structure
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/login")
def login(request: LoginRequest):

    # Find passenger by email
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT id, email, password_hash, full_name
                FROM passenger
                WHERE email = :email
            """),
            {"email": request.email}
        ).fetchone()

    # Account doesn't exist
    if not result:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Verify password using bcrypt
    if not bcrypt.checkpw(
        request.password.encode("utf-8"),
        result.password_hash.encode("utf-8")
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Generate JWT
    token = jwt.encode(
        {
            "passenger_id": result.id,
            "exp": datetime.now(timezone.utc) + timedelta(hours=24)
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )

    return {
        "message": "Login successful",
        "token": token,
        "passenger": {
            "id": result.id,
            "email": result.email,
            "full_name": result.full_name
        }
    }