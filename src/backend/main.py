import os
import re
import secrets
import string
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo
import random
import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, text, bindparam
from sqlalchemy.exc import IntegrityError


# ==============================================================
# FILE LAYOUT
# ==============================================================
# 1. App setup & config
# 2. Auth dependencies (token checks, staff check)
# 3. Auth endpoints (login, signup, employee login, /me)
# 4. Flights (search, upcoming, details)
# 5. Planes & fares
# 6. Payments (mock processor)
# 7. Bookings (create)
# 8. Account page & cancellations
# 9. Staff tools (verify password, cancel/create flight, passenger list)


# ==============================================================
# 1. APP SETUP & CONFIG
# ==============================================================

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


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================
# 2. AUTH DEPENDENCIES (token checks, staff check)
# ==============================================================

optional_security = HTTPBearer(auto_error=False)   # no token = no error


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


def get_optional_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
) -> int | None:
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["passenger_id"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None                                  # bad/expired token = treated as logged out


def require_staff(user_id: int = Depends(get_current_user_id)) -> int:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT 1
                FROM staff
                WHERE passenger_id = :user_id
            """),
            {"user_id": user_id}
        ).first()

    if not result:
        raise HTTPException(
            status_code=403,
            detail="Staff access required"
        )

    return user_id


# ==============================================================
# 3. AUTH ENDPOINTS (login, signup, employee login, /me)
# ==============================================================

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


class EmployeeLoginRequest(BaseModel):
    empId: str
    password: str


@app.post("/employee_login")
def employee_login(request: EmployeeLoginRequest):
    emp_id = request.empId.strip()

    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT p.id, p.password_hash,
                       s.employee_no, p.email, p.full_name
                FROM passenger p
                JOIN staff s ON s.passenger_id = p.id
                WHERE s.employee_no = :empId
            """),
            {"empId": emp_id},
        ).fetchone()

    # Not found, not staff, or wrong password: same generic error
    if not result or not bcrypt.checkpw(
        request.password.encode("utf-8"),
        result.password_hash.encode("utf-8"),
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = jwt.encode(
        {
            "passenger_id": result.id,
            "employee_no": result.employee_no,
            "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )

    return {
        "message": "Login successful",
        "token": token,
        "employee": {
            "id": result.id,
            "employee_no": result.employee_no,
        },
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


# ==============================================================
# 4. FLIGHTS (search, upcoming, details)
# ==============================================================

FLIGHT_SQL = """
SELECT f.id, f.flight_no,
       o.city AS from_city, f.origin      AS from_code,
       d.city AS to_city,   f.destination AS to_code,
       f.depart_at, f.arrive_at,
       f.premium_fare_cents, f.standard_fare_cents, f.economy_fare_cents,
       COUNT(*) FILTER (WHERE s.tier = 'premium'  AND ps.id IS NULL) AS premium_left,
       COUNT(*) FILTER (WHERE s.tier = 'standard' AND ps.id IS NULL) AS standard_left,
       COUNT(*) FILTER (WHERE s.tier = 'economy'  AND ps.id IS NULL) AS economy_left,
              EXISTS (SELECT 1 FROM passenger_seat b
               WHERE b.flight_id = f.id AND b.passenger_id = :user_id
                 AND b.status = 'confirmed') AS is_booked
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
    user_id: int = Depends(get_current_user_id),
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
        user_id=user_id,
       
    )


FLIGHT_DETAIL_SQL = """
SELECT f.id, f.flight_no, f.status, f.depart_at, f.arrive_at,
       f.premium_fare_cents, f.standard_fare_cents, f.economy_fare_cents,
       o.code AS from_code, o.city AS from_city, o.name AS from_airport, o.timezone AS from_tz,
       d.code AS to_code, d.city AS to_city, d.name AS to_airport, d.timezone AS to_tz,
       p.model AS plane_model, p.total_seats,
       p.seat_columns AS total_columns, p.seat_layout
FROM flight f
JOIN airport o ON o.code = f.origin
JOIN airport d ON d.code = f.destination
JOIN plane p ON p.id = f.plane_id
WHERE f.id = :flight_id
"""


FLIGHT_SEATS_SQL = """
SELECT s.id AS seat_id, s.seat_no, s.tier, (ps.id IS NULL) AS available
FROM flight f
JOIN seat s ON s.plane_id = f.plane_id
LEFT JOIN passenger_seat ps
       ON ps.flight_id = f.id AND ps.seat_id = s.id AND ps.status = 'confirmed'
WHERE f.id = :flight_id
ORDER BY length(s.seat_no), s.seat_no
"""


MY_BOOKINGS_SQL = """
SELECT ps.id AS booking_id, ps.booking_ref, ps.traveler_name, ps.seat_id,
       s.seat_no, s.tier, ps.total_cents, ps.checked_bags, ps.checked_in_at
FROM passenger_seat ps
JOIN seat s ON s.id = ps.seat_id
WHERE ps.flight_id = :flight_id AND ps.passenger_id = :user_id AND ps.status = 'confirmed'
ORDER BY ps.id
"""


@app.get("/flights/{flight_id}")
def get_flight(flight_id: int, user_id: int | None = Depends(get_optional_user_id)):
    with engine.connect() as conn:
        f = conn.execute(text(FLIGHT_DETAIL_SQL), {"flight_id": flight_id}).mappings().first()
        if not f:
            raise HTTPException(status_code=404, detail="Flight not found")
        seats = conn.execute(text(FLIGHT_SEATS_SQL), {"flight_id": flight_id}).mappings().all()
        my_bookings = []
        if user_id is not None:
            my_bookings = conn.execute(
                text(MY_BOOKINGS_SQL), {"flight_id": flight_id, "user_id": user_id}
            ).mappings().all()

    my_seat_ids = {b["seat_id"] for b in my_bookings}
    available = {"premium": 0, "standard": 0, "economy": 0}
    for s in seats:
        if s["available"]:
            available[s["tier"]] += 1

    return {
        "id": f["id"],
        "flight_no": f["flight_no"],
        "status": f["status"],
        "from": f["from_city"], "from_code": f["from_code"],
        "from_airport": f["from_airport"], "from_timezone": f["from_tz"],
        "to": f["to_city"], "to_code": f["to_code"],
        "to_airport": f["to_airport"], "to_timezone": f["to_tz"],
        "depart_at": f["depart_at"],
        "arrive_at": f["arrive_at"],
        "duration_minutes": int((f["arrive_at"] - f["depart_at"]).total_seconds() // 60),
        "plane": {"model": f["plane_model"], "total_seats": f["total_seats"]},
        "seat_layout": f["seat_layout"],
        "total_columns": f["total_columns"],
        "fares_cents": {
            "premium": f["premium_fare_cents"],
            "standard": f["standard_fare_cents"],
            "economy": f["economy_fare_cents"],
        },
        "seats_available": available,
        "is_booked": len(my_bookings) > 0,
        "my_bookings": [
            {
                "booking_id": b["booking_id"],
                "booking_ref": b["booking_ref"],
                "traveler_name": b["traveler_name"],
                "seat_no": b["seat_no"],
                "tier": b["tier"],
                "total_cents": b["total_cents"],
                "checked_bags": b["checked_bags"],
                "checked_in": b["checked_in_at"] is not None,
            }
            for b in my_bookings
        ],
        "seats": [
            {
                "id": s["seat_id"],
                "seat_no": s["seat_no"],
                "tier": s["tier"],
                "available": s["available"],
                "mine": s["seat_id"] in my_seat_ids,
            }
            for s in seats
        ],
    }


# ==============================================================
# 5. PLANES & FARES
# ==============================================================

# ---------- 1. All plane types ----------
PLANES_SQL = """
SELECT p.id, p.model, p.total_seats,
       p.premium_fare_per_minute, p.standard_fare_per_minute, p.economy_fare_per_minute,
       COUNT(s.id) FILTER (WHERE s.tier = 'premium')  AS premium_seats,
       COUNT(s.id) FILTER (WHERE s.tier = 'standard') AS standard_seats,
       COUNT(s.id) FILTER (WHERE s.tier = 'economy')  AS economy_seats
FROM plane p
LEFT JOIN seat s ON s.plane_id = p.id
GROUP BY p.id
ORDER BY p.model, p.id
"""


@app.get("/planes")
def get_planes():
    with engine.connect() as conn:
        rows = conn.execute(text(PLANES_SQL)).mappings().all()
    return [
        {
            "id": r["id"],
            "model": r["model"],
            "total_seats": r["total_seats"],
            "seats_by_tier": {
                "premium": r["premium_seats"],
                "standard": r["standard_seats"],
                "economy": r["economy_seats"],
            },
            "fare_per_minute": {
                "premium": float(r["premium_fare_per_minute"]),
                "standard": float(r["standard_fare_per_minute"]),
                "economy": float(r["economy_fare_per_minute"]),
            },
        }
        for r in rows
    ]


# ---------- 2. Fare calculator ----------
FARE_CALC_SQL = """
WITH t AS (
    SELECT EXTRACT(EPOCH FROM (CAST(:arrive AS timestamptz) - CAST(:depart AS timestamptz))) / 60 AS mins
)
SELECT p.id, p.model, t.mins,
       ROUND(t.mins * p.premium_fare_per_minute)  AS premium,
       ROUND(t.mins * p.standard_fare_per_minute) AS standard,
       ROUND(t.mins * p.economy_fare_per_minute)  AS economy
FROM plane p, t
WHERE p.id = :plane_id
"""


@app.get("/fares/calculate")
def calculate_fares(plane_id: int, depart_at: datetime, arrive_at: datetime):
    if arrive_at <= depart_at:
        raise HTTPException(status_code=400, detail="arrive_at must be after depart_at")

    with engine.connect() as conn:
        r = conn.execute(
            text(FARE_CALC_SQL),
            {"plane_id": plane_id, "depart": depart_at, "arrive": arrive_at},
        ).mappings().first()

    if not r:
        raise HTTPException(status_code=404, detail="Plane not found")

    return {
        "plane_id": r["id"],
        "model": r["model"],
        "duration_minutes": int(round(r["mins"])),
        "fares_cents": {
            "premium": int(r["premium"]),
            "standard": int(r["standard"]),
            "economy": int(r["economy"]),
        },
    }


# ==============================================================
# 6. PAYMENTS (mock processor)
# ==============================================================

# ---------- Mock payment processor ----------

PAYMENT_SECRET = JWT_SECRET + "-payments"  # separate key so payment tokens can't be used to log in


TEST_CARDS = {
    "4000000000000002": "Your card was declined.",
    "4000000000009995": "Insufficient funds.",
}


class MockChargeRequest(BaseModel):
    card_number: str
    exp: str   # "MM/YY"
    cvc: str


def luhn_ok(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def card_brand(number: str) -> str:
    if number.startswith("4"):
        return "Visa"
    if number[:2] in {"51", "52", "53", "54", "55"}:
        return "Mastercard"
    if number[:2] in {"34", "37"}:
        return "Amex"
    return "Card"


@app.post("/payments/mock-charge")
def mock_charge(req: MockChargeRequest, user_id: int = Depends(get_current_user_id)):
    number = re.sub(r"\D", "", req.card_number)
    if not (13 <= len(number) <= 19) or not luhn_ok(number):
        raise HTTPException(status_code=400, detail="Invalid card number")

    m = re.fullmatch(r"(\d{2})/(\d{2})", req.exp.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Expiry must be MM/YY")
    month, year = int(m.group(1)), 2000 + int(m.group(2))
    now = datetime.now(timezone.utc)
    if not 1 <= month <= 12 or (year, month) < (now.year, now.month):
        raise HTTPException(status_code=400, detail="Card has expired")

    if not re.fullmatch(r"\d{3,4}", req.cvc):
        raise HTTPException(status_code=400, detail="Invalid security code")

    if number in TEST_CARDS:
        raise HTTPException(status_code=402, detail=TEST_CARDS[number])

    payment_id = "pay_" + secrets.token_hex(12)   # fits payment_ref VARCHAR(64)
    token = jwt.encode(
        {
            "jti": payment_id,
            "payer_id": user_id,
            "brand": card_brand(number),
            "last4": number[-4:],
            "exp": now + timedelta(minutes=10),
        },
        PAYMENT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return {"payment_token": token, "brand": card_brand(number), "last4": number[-4:]}


def verify_payment_token(token: str, user_id: int) -> dict:
    try:
        payload = jwt.decode(token, PAYMENT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=402, detail="Payment expired or invalid. Please re-enter your card.")
    if payload.get("payer_id") != user_id:
        raise HTTPException(status_code=402, detail="Payment does not match this account")
    return payload


# ==============================================================
# 7. BOOKINGS (create)
# ==============================================================

# ---------- Bookings ----------

BOOKING_TAX_PERCENT = 13
BOOKING_BAG_CENTS = 1500


class TravelerIn(BaseModel):
    seat_no: str = Field(min_length=1, max_length=3)
    full_name: str = Field(min_length=1, max_length=150)
    passport_no: str = Field(min_length=1, max_length=40)   # validated, not stored (no column)
    checked_bags: int = Field(default=0, ge=0, le=1)


class BookingRequest(BaseModel):
    flight_id: int
    payment_token: str
    travelers: list[TravelerIn] = Field(min_length=1, max_length=9)


def new_booking_ref() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


@app.post("/bookings")
def create_booking(req: BookingRequest, user_id: int = Depends(get_current_user_id)):
    payment = verify_payment_token(req.payment_token, user_id)
    payment_ref = payment["jti"]

    seat_nos = [t.seat_no for t in req.travelers]
    if len(set(seat_nos)) != len(seat_nos):
        raise HTTPException(status_code=400, detail="Duplicate seats in request")

    created = []
    try:
        with engine.begin() as conn:  # commits on success, rolls back on any exception
            # Lock the flight row so concurrent bookings run one at a time
            flight = conn.execute(
                text("""
                    SELECT id, plane_id,
                           premium_fare_cents, standard_fare_cents, economy_fare_cents
                    FROM flight
                    WHERE id = :id AND status = 'scheduled' AND depart_at >= now()
                    FOR UPDATE
                """),
                {"id": req.flight_id},
            ).mappings().first()
            if not flight:
                raise HTTPException(status_code=404, detail="Flight is not available for booking")

            # One payment can only be used for one booking
            reused = conn.execute(
                text("SELECT 1 FROM passenger_seat WHERE payment_ref = :p"),
                {"p": payment_ref},
            ).first()
            if reused:
                raise HTTPException(status_code=402, detail="This payment was already used")

            fares = {
                "premium": flight["premium_fare_cents"],
                "standard": flight["standard_fare_cents"],
                "economy": flight["economy_fare_cents"],
            }

            for t in req.travelers:
                seat = conn.execute(
                    text("SELECT id, tier FROM seat WHERE plane_id = :plane AND seat_no = :no"),
                    {"plane": flight["plane_id"], "no": t.seat_no},
                ).mappings().first()
                if not seat:
                    raise HTTPException(status_code=400, detail=f"Seat {t.seat_no} does not exist")

                taken = conn.execute(
                    text("""
                        SELECT 1 FROM passenger_seat
                        WHERE flight_id = :f AND seat_id = :s AND status = 'confirmed'
                    """),
                    {"f": req.flight_id, "s": seat["id"]},
                ).first()
                if taken:
                    raise HTTPException(status_code=409, detail=f"Seat {t.seat_no} was just taken")

                # Prices always come from the database, never from the browser
                fare = fares[seat["tier"]]
                tax = (fare * BOOKING_TAX_PERCENT + 50) // 100
                bag_fees = t.checked_bags * BOOKING_BAG_CENTS
                total = fare + tax + bag_fees
                ref = new_booking_ref()

                conn.execute(
                    text("""
                        INSERT INTO passenger_seat
                            (booking_ref, passenger_id, flight_id, seat_id, traveler_name,
                             base_fare_cents, taxes_cents, fees_cents,
                             checked_bags, bag_fees_cents, total_cents,
                             payment_ref, status)
                        VALUES
                            (:ref, :pid, :fid, :sid, :name,
                             :base, :tax, 0,
                             :bags, :bag_fees, :total,
                             :pay, 'confirmed')
                    """),
                    {
                        "ref": ref, "pid": user_id, "fid": req.flight_id, "sid": seat["id"],
                        "name": t.full_name.strip(),
                        "base": fare, "tax": tax,
                        "bags": t.checked_bags, "bag_fees": bag_fees,
                        "total": total, "pay": payment_ref,
                    },
                )
                created.append(
                    {"booking_ref": ref, "seat_no": t.seat_no, "total_cents": total}
                )
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Those seats were just taken. Please pick again."
        )

    return {"message": "Booking confirmed", "bookings": created}


# ==============================================================
# 8. ACCOUNT PAGE & CANCELLATIONS
# ==============================================================

# ---------- Account page + cancellations ----------

def refund_policy(total_cents: int, created_at: datetime, depart_at: datetime, now: datetime):
    """Returns (refund_cents, percent)."""
    if now >= depart_at:
        pct = 0
    elif now <= created_at + timedelta(hours=24):
        pct = 100
    elif depart_at - now >= timedelta(hours=48):
        pct = 80
    else:
        pct = 0
    return total_cents * pct // 100, pct


ACCOUNT_UPCOMING_SQL = """
SELECT ps.id AS booking_id, ps.booking_ref, ps.total_cents, ps.created_at,
       s.seat_no, s.tier,
       f.id AS flight_id, f.flight_no, f.depart_at,
       f.origin AS from_code, f.destination AS to_code, o.timezone AS from_tz
FROM passenger_seat ps
JOIN flight f  ON f.id = ps.flight_id
JOIN seat s    ON s.id = ps.seat_id
JOIN airport o ON o.code = f.origin
WHERE ps.passenger_id = :uid AND ps.status = 'confirmed' AND f.depart_at >= now()
ORDER BY f.depart_at, f.id, length(s.seat_no), s.seat_no
"""


ACCOUNT_HISTORY_SQL = """
SELECT f.id AS flight_id, f.flight_no, f.depart_at,
       f.origin AS from_code, f.destination AS to_code, o.timezone AS from_tz,
       string_agg(s.seat_no, ', ' ORDER BY length(s.seat_no), s.seat_no) AS seats
FROM passenger_seat ps
JOIN flight f  ON f.id = ps.flight_id
JOIN seat s    ON s.id = ps.seat_id
JOIN airport o ON o.code = f.origin
WHERE ps.passenger_id = :uid AND ps.status = 'confirmed' AND f.depart_at < now()
GROUP BY f.id, o.timezone
ORDER BY f.depart_at DESC
LIMIT 50
"""


@app.get("/account/overview")
def account_overview(user_id: int = Depends(get_current_user_id)):
    now = datetime.now(timezone.utc)
    with engine.connect() as conn:
        upcoming = conn.execute(text(ACCOUNT_UPCOMING_SQL), {"uid": user_id}).mappings().all()
        history = conn.execute(text(ACCOUNT_HISTORY_SQL), {"uid": user_id}).mappings().all()
        taken = conn.execute(
            text("""
                SELECT COUNT(DISTINCT ps.flight_id)
                FROM passenger_seat ps JOIN flight f ON f.id = ps.flight_id
                WHERE ps.passenger_id = :uid AND ps.status = 'confirmed' AND f.depart_at < now()
            """),
            {"uid": user_id},
        ).scalar()

    upcoming_out = []
    for r in upcoming:
        refund, pct = refund_policy(r["total_cents"], r["created_at"], r["depart_at"], now)
        upcoming_out.append({
            "booking_id": r["booking_id"],
            "booking_ref": r["booking_ref"],
            "flight_id": r["flight_id"],
            "flight_no": r["flight_no"],
            "from_code": r["from_code"], "to_code": r["to_code"],
            "from_timezone": r["from_tz"],
            "depart_at": r["depart_at"],
            "seat_no": r["seat_no"],
            "tier": r["tier"],
            "total_cents": r["total_cents"],
            "refund_cents": refund,
            "refund_percent": pct,
        })

    return {
        "total_flights_taken": taken or 0,
        "upcoming": upcoming_out,
        "history": [
            {
                "flight_id": r["flight_id"],
                "flight_no": r["flight_no"],
                "from_code": r["from_code"], "to_code": r["to_code"],
                "from_timezone": r["from_tz"],
                "depart_at": r["depart_at"],
                "seats": r["seats"],
            }
            for r in history
        ],
    }


class CancelRequest(BaseModel):
    booking_ids: list[int] = Field(min_length=1, max_length=20)


@app.post("/bookings/cancel")
def cancel_bookings(req: CancelRequest, user_id: int = Depends(get_current_user_id)):
    now = datetime.now(timezone.utc)
    ids = list(set(req.booking_ids))

    select_stmt = text("""
        SELECT ps.id, ps.total_cents, ps.created_at, f.depart_at
        FROM passenger_seat ps
        JOIN flight f ON f.id = ps.flight_id
        WHERE ps.id IN :ids AND ps.passenger_id = :uid AND ps.status = 'confirmed'
        FOR UPDATE OF ps
    """).bindparams(bindparam("ids", expanding=True))

    total_refund = 0
    with engine.begin() as conn:
        rows = conn.execute(select_stmt, {"ids": ids, "uid": user_id}).mappings().all()
        if len(rows) != len(ids):
            raise HTTPException(status_code=404, detail="Booking not found or already cancelled")

        for r in rows:
            if r["depart_at"] <= now:
                raise HTTPException(status_code=400, detail="This flight has already departed")
            refund, _ = refund_policy(r["total_cents"], r["created_at"], r["depart_at"], now)
            conn.execute(
                text("""
                    UPDATE passenger_seat
                    SET status = 'cancelled', cancelled_at = now(), refund_cents = :refund
                    WHERE id = :id
                """),
                {"refund": refund, "id": r["id"]},
            )
            total_refund += refund

    return {"message": "Cancelled", "cancelled": len(ids), "refund_cents": total_refund}


# ==============================================================
# 9. STAFF TOOLS (verify password, cancel/create flight, passenger list)
# ==============================================================

class PasswordVerificationRequest(BaseModel):
    password: str


@app.post("/employees/verify-password")
def verify_employee_password(
    request: PasswordVerificationRequest,
    staff_id: int = Depends(require_staff)
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT password_hash
                FROM passenger
                WHERE id = :id
            """),
            {"id": staff_id}
        ).mappings().first()

    if not result:
        raise HTTPException(
            status_code=401,
            detail="Employee account not found."
        )

    password_matches = bcrypt.checkpw(
        request.password.encode("utf-8"),
        result["password_hash"].encode("utf-8")
    )

    if not password_matches:
        raise HTTPException(
            status_code=401,
            detail="Incorrect password."
        )

    return {"verified": True}


class FlightCancellationRequest(BaseModel):
    password: str


@app.post("/employees/flights/{flight_id}/cancel")
def cancel_flight(
    flight_id: int,
    request: FlightCancellationRequest,
    staff_id: int = Depends(require_staff)
):
    # Verify the flight exists
    with engine.begin() as conn:
        flight = conn.execute(
            text("""
                SELECT id, status
                FROM flight
                WHERE id = :flight_id
            """),
            {"flight_id": flight_id}
        ).mappings().first()

        if not flight:
            raise HTTPException(
                status_code=404,
                detail="Flight not found."
            )

        if flight["status"].lower() == "cancelled":
            raise HTTPException(
                status_code=400,
                detail="This flight is already cancelled."
            )

        # Retrieve the authenticated employee's password hash
        employee = conn.execute(
            text("""
                SELECT password_hash
                FROM passenger
                WHERE id = :id
            """),
            {"id": staff_id}
        ).mappings().first()

        if not employee:
            raise HTTPException(
                status_code=401,
                detail="Employee account not found."
            )

        password_matches = bcrypt.checkpw(
            request.password.encode("utf-8"),
            employee["password_hash"].encode("utf-8")
        )

        if not password_matches:
            raise HTTPException(
                status_code=401,
                detail="Incorrect password."
            )

        # Update the status without deleting the flight or its bookings
        conn.execute(
            text("""
                UPDATE flight
                SET status = 'cancelled'
                WHERE id = :flight_id
            """),
            {"flight_id": flight_id}
        )

    return {
        "message": "Flight successfully cancelled.",
        "flight_id": flight_id,
        "status": "cancelled"
    }


def generate_flight_number(conn):
    while True:
        flight_no = f"FH{random.randint(0, 999):03d}"

        existing = conn.execute(
            text("""
                SELECT 1
                FROM flight
                WHERE flight_no = :flight_no
            """),
            {"flight_no": flight_no},
        ).first()

        if existing is None:
            return flight_no
        
class FlightCreate(BaseModel):
    plane_id: int
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    depart_at: datetime
    duration_minutes: int = Field(gt=0, le=24 * 60)


@app.post("/flights", status_code=201)
def create_flight(body: FlightCreate, staff_id: int = Depends(require_staff)):
    origin = body.origin.upper()
    destination = body.destination.upper()

    if origin == destination:
        raise HTTPException(
            status_code=400,
            detail="Origin and destination must be different"
        )

    try:
        with engine.begin() as conn:
            zones = {
                r["code"]: r["timezone"]
                for r in conn.execute(
                    text("""
                        SELECT code, timezone
                        FROM airport
                        WHERE code IN (:o, :d)
                    """),
                    {"o": origin, "d": destination},
                ).mappings()
            }

            if origin not in zones or destination not in zones:
                raise HTTPException(
                    status_code=400,
                    detail="Unknown origin or destination airport"
                )

            # Interpret the departure time as local time at the origin.
            depart = body.depart_at

            if depart.tzinfo is None:
                depart = depart.replace(tzinfo=ZoneInfo(zones[origin]))

            # Calculate arrival using elapsed flight duration.
            arrive = depart + timedelta(minutes=body.duration_minutes)
            flight_no = generate_flight_number(conn)

            row = conn.execute(
                text("""
                    INSERT INTO flight (
                        flight_no,
                        plane_id,
                        origin,
                        destination,
                        depart_at,
                        arrive_at
                    )
                    VALUES (
                        :flight_no,
                        :plane_id,
                        :origin,
                        :destination,
                        :depart_at,
                        :arrive_at
                    )
                    RETURNING id, flight_no, plane_id, origin, destination,
                              depart_at, arrive_at, status,
                              premium_fare_cents, standard_fare_cents,
                              economy_fare_cents
                """),
                {
                    "flight_no": flight_no,
                    "plane_id": body.plane_id,
                    "origin": origin,
                    "destination": destination,
                    "depart_at": depart,
                    "arrive_at": arrive,
                },
            ).mappings().first()

    except IntegrityError as e:
        sqlstate = getattr(e.orig, "sqlstate", None)

        if sqlstate == "23503":
            raise HTTPException(status_code=400, detail="Plane does not exist")

        if sqlstate == "23505":
            raise HTTPException(
                status_code=409,
                detail="A flight with this number and departure time already exists",
            )

        raise

    return {
        "message": "Flight created",
        "flight": dict(row)
    }


FLIGHT_HEADER_SQL = """
SELECT id, flight_no, status, origin, destination, depart_at, arrive_at
FROM flight
WHERE id = :flight_id
"""


MANIFEST_SQL = """
SELECT ps.id AS booking_id, ps.booking_ref, ps.traveler_name, ps.status,
       ps.checked_bags, ps.checked_in_at,
       s.seat_no, s.tier,
       p.id AS passenger_id, p.email AS account_email, p.full_name AS account_name
FROM passenger_seat ps
JOIN seat s      ON s.id = ps.seat_id
JOIN passenger p ON p.id = ps.passenger_id
WHERE ps.flight_id = :flight_id
  AND (ps.status = 'confirmed' OR CAST(:include_cancelled AS boolean))
ORDER BY length(s.seat_no), s.seat_no
"""



@app.get("/flights/{flight_id}/passengers")
def get_flight_passengers(
    flight_id: int,
    include_cancelled: bool = False,
    staff_id: int = Depends(require_staff),
):
    with engine.connect() as conn:
        flight = conn.execute(text(FLIGHT_HEADER_SQL), {"flight_id": flight_id}).mappings().first()
        if not flight:
            raise HTTPException(status_code=404, detail="Flight not found")
        rows = conn.execute(
            text(MANIFEST_SQL),
            {"flight_id": flight_id, "include_cancelled": include_cancelled},
        ).mappings().all()

    return {
        "flight": {
            "id": flight["id"],
            "flight_no": flight["flight_no"],
            "status": flight["status"],
            "from_code": flight["origin"],
            "to_code": flight["destination"],
            "depart_at": flight["depart_at"],
            "arrive_at": flight["arrive_at"],
        },
        "passenger_count": sum(1 for r in rows if r["status"] == "confirmed"),
        "passengers": [
            {
                "booking_id": r["booking_id"],
                "booking_ref": r["booking_ref"],
                "traveler_name": r["traveler_name"],
                "seat_no": r["seat_no"],
                "tier": r["tier"],
                "booked_by": {
                    "passenger_id": r["passenger_id"],
                    "name": r["account_name"],
                    "email": r["account_email"],
                },
            }
            for r in rows
        ],
    }
