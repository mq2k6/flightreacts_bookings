import os
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, text

# Load .env from the same directory as main.py
load_dotenv()
security = HTTPBearer()
app = FastAPI()
FLIGHTS = []
DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL was not found in .env")

if not JWT_SECRET:
    raise ValueError("JWT_SECRET was not found in .env")

engine = create_engine(DATABASE_URL)

JWT_ALGORITHM = "HS256"


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["passenger_id"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

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




FLIGHT_SQL = """
SELECT f.id, f.flight_no,
       o.city AS from_city, f.origin      AS from_code,
       d.city AS to_city,   f.destination AS to_code,
       f.depart_at, f.arrive_at,
       f.premium_fare_cents, f.standard_fare_cents, f.economy_fare_cents,
       COUNT(*) FILTER (WHERE s.tier = 'premium'  AND ps.id IS NULL) AS premium_left,
       COUNT(*) FILTER (WHERE s.tier = 'standard' AND ps.id IS NULL) AS standard_left,
       COUNT(*) FILTER (WHERE s.tier = 'economy'  AND ps.id IS NULL) AS economy_left
FROM flight f
JOIN airport o ON o.code = f.origin
JOIN airport d ON d.code = f.destination
JOIN seat s    ON s.plane_id = f.plane_id
LEFT JOIN passenger_seat ps
       ON ps.flight_id = f.id AND ps.seat_id = s.id AND ps.status = 'confirmed'
WHERE f.status = 'scheduled' AND f.depart_at >= now()
  {extra}
GROUP BY f.id, o.city, d.city
ORDER BY f.depart_at
LIMIT :limit
"""

def query_flights(extra: str = "", **params):
    params.setdefault("limit", 100)
    with engine.connect() as conn:
        rows = conn.execute(text(FLIGHT_SQL.format(extra=extra)), params).mappings().all()
    return [
        {
            "id": r["id"],
            "flight_no": r["flight_no"],
            "from": r["from_city"], "from_code": r["from_code"],
            "to": r["to_city"],     "to_code": r["to_code"],
            "depart_at": r["depart_at"],
            "arrive_at": r["arrive_at"],
            "fares_cents": {
                "premium": r["premium_fare_cents"],
                "standard": r["standard_fare_cents"],
                "economy": r["economy_fare_cents"],
            },
            "seats_available": {
                "premium": r["premium_left"],
                "standard": r["standard_left"],
                "economy": r["economy_left"],
            },
        }
        for r in rows
    ]


UPCOMING_SQL = """
SELECT ps.id AS booking_id, ps.booking_ref, ps.traveler_name,
       ps.total_cents, ps.checked_bags, ps.checked_in_at,
       s.seat_no, s.tier,
       f.id AS flight_id, f.flight_no, f.status AS flight_status,
       f.depart_at, f.arrive_at,
       o.city AS from_city, f.origin      AS from_code,
       d.city AS to_city,   f.destination AS to_code
FROM passenger_seat ps
JOIN flight f   ON f.id = ps.flight_id
JOIN seat s     ON s.id = ps.seat_id
JOIN airport o  ON o.code = f.origin
JOIN airport d  ON d.code = f.destination
WHERE ps.passenger_id = :user_id
  AND ps.status = 'confirmed'
  AND f.depart_at >= now()
ORDER BY f.depart_at
LIMIT :limit
"""


@app.get("/flights/upcoming")
def upcoming_flights(user_id: int = Depends(get_current_user_id), limit: int = 10):
    with engine.connect() as conn:
        rows = conn.execute(
            text(UPCOMING_SQL), {"user_id": user_id, "limit": limit}
        ).mappings().all()
    return [
        {
            "booking_id": r["booking_id"],
            "booking_ref": r["booking_ref"],
            "traveler_name": r["traveler_name"],
            "seat_no": r["seat_no"],
            "tier": r["tier"],
            "total_cents": r["total_cents"],
            "checked_bags": r["checked_bags"],
            "checked_in": r["checked_in_at"] is not None,
            "flight_id": r["flight_id"],
            "flight_no": r["flight_no"],
            "flight_status": r["flight_status"],
            "from": r["from_city"], "from_code": r["from_code"],
            "to": r["to_city"],     "to_code": r["to_code"],
            "depart_at": r["depart_at"],
            "arrive_at": r["arrive_at"],
        }
        for r in rows
    ]


@app.get("/flights/search")
def search_flights(
    from_code: Annotated[str, Query(alias="from")],
    to: str,
    departure_date: date | None = None,
    flex_days: int = 7,
):
    return query_flights(
        extra="""AND f.origin = :origin AND f.destination = :dest
                 AND (CAST(:day AS date) IS NULL
                      OR (f.depart_at AT TIME ZONE o.timezone)::date
                         BETWEEN CAST(:day AS date) - CAST(:flex AS integer)
                             AND CAST(:day AS date) + CAST(:flex AS integer))""",
        origin=from_code.upper(),
        dest=to.upper(),
        day=departure_date,
        flex=flex_days,
    )

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

@app.get("/me")
def me(passenger_id: int = Depends(get_current_user_id)):
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, email, full_name FROM passenger WHERE id = :id"),
            {"id": passenger_id},
        ).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Passenger not found")
    return {"id": result.id, "email": result.email, "full_name": result.full_name}

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=150)


@app.post("/signup")
def signup(request: SignupRequest):
    email = request.email.lower()
    hashed_password = bcrypt.hashpw(
        request.password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    try:
        with engine.begin() as connection:      # begin() = auto-commit
            result = connection.execute(
                text("""
                    INSERT INTO passenger (email, password_hash, full_name)
                    VALUES (:email, :password_hash, :full_name)
                    RETURNING id, email, full_name
                """),
                {
                    "email": email,
                    "password_hash": hashed_password,
                    "full_name": request.full_name,
                },
            ).fetchone()
    except IntegrityError:
        raise HTTPException(status_code=400, detail="Email already registered")

    return {
        "message": "Signup successful",
        "passenger": {"id": result.id, "email": result.email, "full_name": result.full_name},
    }