-- CP317A Group 23 - Airline Flight Reservation System
-- Database schema (PostgreSQL)
-- test

BEGIN;

-- Airports
CREATE TABLE airport (
    code      CHAR(3)      PRIMARY KEY,
    city      VARCHAR(100) NOT NULL,
    name      VARCHAR(150) NOT NULL,
    timezone  VARCHAR(64)  NOT NULL
);

-- Planes
CREATE TABLE plane (
    id            SERIAL      PRIMARY KEY,
    total_seats   INTEGER NOT NULL,
    model         VARCHAR(50) NOT NULL
);

-- Seats on each plane
CREATE TABLE seat (
    id        SERIAL     PRIMARY KEY,
    plane_id  INTEGER    NOT NULL REFERENCES plane(id) ON DELETE CASCADE,
    seat_no   VARCHAR(3) NOT NULL,
    tier      VARCHAR(10) NOT NULL CHECK (tier IN ('premium', 'standard', 'economy')),
    UNIQUE (plane_id, seat_no)
);

-- Flights
CREATE TABLE flight (
    id                   SERIAL      PRIMARY KEY,
    flight_no            VARCHAR(8)  NOT NULL,
    plane_id             INTEGER     NOT NULL REFERENCES plane(id),
    origin               CHAR(3)     NOT NULL REFERENCES airport(code),
    destination          CHAR(3)     NOT NULL REFERENCES airport(code),
    depart_at            TIMESTAMPTZ NOT NULL,
    arrive_at            TIMESTAMPTZ NOT NULL,
    status               VARCHAR(10) NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'cancelled')),
    premium_fare_cents   INTEGER     NOT NULL,
    standard_fare_cents  INTEGER     NOT NULL,
    economy_fare_cents   INTEGER     NOT NULL,
    UNIQUE (flight_no, depart_at),
    CHECK (origin <> destination),
    CHECK (arrive_at > depart_at)
);

CREATE INDEX flight_search_idx ON flight (origin, destination, depart_at);

-- Passengers (user accounts)
CREATE TABLE passenger (
    id             SERIAL       PRIMARY KEY,
    email          VARCHAR(254) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(150) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Staff (accounts with staff access)
CREATE TABLE staff (
    passenger_id  INTEGER     PRIMARY KEY REFERENCES passenger(id) ON DELETE CASCADE,
    employee_no   VARCHAR(10) NOT NULL UNIQUE,
    employee_type VARCHAR(10) NOT NULL DEFAULT 'staff' CHECK (employee_type IN ('staff', 'admin'))
);

-- Passenger seats (bookings)
CREATE TABLE passenger_seat (
    id               SERIAL       PRIMARY KEY,
    booking_ref      VARCHAR(8)   NOT NULL UNIQUE,
    passenger_id     INTEGER      NOT NULL REFERENCES passenger(id),
    flight_id        INTEGER      NOT NULL REFERENCES flight(id),
    seat_id          INTEGER      NOT NULL REFERENCES seat(id),
    traveler_name    VARCHAR(150) NOT NULL,
    base_fare_cents  INTEGER      NOT NULL,
    taxes_cents      INTEGER      NOT NULL,
    fees_cents       INTEGER      NOT NULL,
    checked_bags     INTEGER      NOT NULL DEFAULT 0,
    bag_fees_cents   INTEGER      NOT NULL DEFAULT 0,
    total_cents      INTEGER      NOT NULL,
    payment_ref      VARCHAR(64)  NOT NULL,  -- payment token only, never a card number
    status           VARCHAR(10)  NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('confirmed', 'cancelled')),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cancelled_at     TIMESTAMPTZ,
    refund_cents     INTEGER,
    checked_in_at    TIMESTAMPTZ
);

-- Only one confirmed booking per seat on a flight
CREATE UNIQUE INDEX one_booking_per_seat
    ON passenger_seat (flight_id, seat_id) WHERE status = 'confirmed';

COMMIT;
