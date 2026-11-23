-- CP317A Group 23 - Sprint 2 migration
-- Brings sprint1_initial_schema.sql in line with the SQL used by src/backend/main.py.
--
-- Re-runnable: every statement is idempotent, and the backfill only touches NULLs.
-- Order: sprint1_initial_schema.sql -> this file -> db/seed/seed_test_data.sql.
-- On an empty database the backfill simply updates nothing; the seed then sets the plane
-- columns itself. On a database that already has planes/flights (e.g. the team database),
-- the backfill derives the values from the existing seats and fares.
--
-- What main.py needs that Sprint 1 did not have:
--   plane.seat_columns, plane.seat_layout                  -> GET /flights/{id} (seat map)
--   plane.{premium,standard,economy}_fare_per_minute       -> GET /planes, GET /fares/calculate
--   flight.*_fare_cents are NOT NULL, but POST /flights does not supply them
--                                                          -> BEFORE INSERT trigger below

BEGIN;

-- 1. New plane columns ------------------------------------------------------
ALTER TABLE plane ADD COLUMN IF NOT EXISTS seat_columns             INTEGER;
ALTER TABLE plane ADD COLUMN IF NOT EXISTS seat_layout              INTEGER[];   -- seats per aisle group, e.g. {3,3}
ALTER TABLE plane ADD COLUMN IF NOT EXISTS premium_fare_per_minute  NUMERIC(10,4);  -- cents per minute
ALTER TABLE plane ADD COLUMN IF NOT EXISTS standard_fare_per_minute NUMERIC(10,4);
ALTER TABLE plane ADD COLUMN IF NOT EXISTS economy_fare_per_minute  NUMERIC(10,4);

-- 2. Backfill seat layout from the plane's actual seats ---------------------
--    seat_columns = number of distinct seat letters on the plane
--    seat_layout  = aisle groups: <=6 columns -> two halves, >=8 -> window/centre/window
UPDATE plane p
SET seat_columns = c.n,
    seat_layout  = CASE
                     WHEN c.n >= 8 THEN ARRAY[(c.n - 4) / 2, 4, (c.n - 4) - (c.n - 4) / 2]
                     ELSE ARRAY[c.n / 2, c.n - c.n / 2]
                   END
FROM (
    SELECT plane_id, COUNT(DISTINCT regexp_replace(seat_no, '^[0-9]+', ''))::int AS n
    FROM seat
    GROUP BY plane_id
) c
WHERE c.plane_id = p.id
  AND (p.seat_columns IS NULL OR p.seat_layout IS NULL);

-- 3. Backfill per-minute fares from the flights already flown on each plane --
--    rate = average of (fare_cents / scheduled minutes) over that plane's flights.
--    Planes with no flights get the fleet-wide average so /planes never returns NULL.
WITH per_plane AS (
    SELECT f.plane_id,
           AVG(f.premium_fare_cents  / (EXTRACT(EPOCH FROM (f.arrive_at - f.depart_at)) / 60)) AS prem,
           AVG(f.standard_fare_cents / (EXTRACT(EPOCH FROM (f.arrive_at - f.depart_at)) / 60)) AS std,
           AVG(f.economy_fare_cents  / (EXTRACT(EPOCH FROM (f.arrive_at - f.depart_at)) / 60)) AS eco
    FROM flight f
    WHERE f.arrive_at > f.depart_at
    GROUP BY f.plane_id
),
fleet AS (
    SELECT AVG(prem) AS prem, AVG(std) AS std, AVG(eco) AS eco FROM per_plane
)
UPDATE plane p
SET premium_fare_per_minute  = ROUND(COALESCE((SELECT prem FROM per_plane WHERE plane_id = p.id), fleet.prem), 4),
    standard_fare_per_minute = ROUND(COALESCE((SELECT std  FROM per_plane WHERE plane_id = p.id), fleet.std),  4),
    economy_fare_per_minute  = ROUND(COALESCE((SELECT eco  FROM per_plane WHERE plane_id = p.id), fleet.eco),  4)
FROM fleet
WHERE fleet.eco IS NOT NULL
  AND (p.premium_fare_per_minute IS NULL
       OR p.standard_fare_per_minute IS NULL
       OR p.economy_fare_per_minute IS NULL);

-- 4. Fill flight fares on INSERT when the caller leaves them out -------------
--    POST /flights inserts only flight_no/plane_id/origin/destination/depart_at/arrive_at.
--    Fare = ROUND(minutes * plane rate), same formula as GET /fares/calculate.
--
--    NOT NULL is checked before the plane_id foreign key, so an unknown plane_id would
--    otherwise surface as a NOT NULL error (23502) on the fare columns. Raise the FK
--    error (23503) ourselves so main.py's IntegrityError handler returns
--    400 "Plane does not exist".
CREATE OR REPLACE FUNCTION flight_fill_fares() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    r    plane%ROWTYPE;
    mins NUMERIC;
    prem NUMERIC;
    std  NUMERIC;
    eco  NUMERIC;
BEGIN
    IF NEW.premium_fare_cents IS NOT NULL
       AND NEW.standard_fare_cents IS NOT NULL
       AND NEW.economy_fare_cents IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Let the column constraints report missing core values themselves
    IF NEW.plane_id IS NULL OR NEW.depart_at IS NULL OR NEW.arrive_at IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO r FROM plane WHERE id = NEW.plane_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'insert or update on table "flight" violates foreign key constraint "flight_plane_id_fkey"'
            USING ERRCODE = 'foreign_key_violation',
                  DETAIL  = format('Key (plane_id)=(%s) is not present in table "plane".', NEW.plane_id);
    END IF;

    prem := r.premium_fare_per_minute;
    std  := r.standard_fare_per_minute;
    eco  := r.economy_fare_per_minute;

    -- Plane added without rates: fall back to the fleet average
    IF prem IS NULL OR std IS NULL OR eco IS NULL THEN
        SELECT COALESCE(prem, AVG(premium_fare_per_minute)),
               COALESCE(std,  AVG(standard_fare_per_minute)),
               COALESCE(eco,  AVG(economy_fare_per_minute))
        INTO prem, std, eco
        FROM plane;
    END IF;

    mins := EXTRACT(EPOCH FROM (NEW.arrive_at - NEW.depart_at)) / 60;

    NEW.premium_fare_cents  := COALESCE(NEW.premium_fare_cents,  ROUND(mins * prem)::int);
    NEW.standard_fare_cents := COALESCE(NEW.standard_fare_cents, ROUND(mins * std)::int);
    NEW.economy_fare_cents  := COALESCE(NEW.economy_fare_cents,  ROUND(mins * eco)::int);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flight_fill_fares_trg ON flight;
CREATE TRIGGER flight_fill_fares_trg
    BEFORE INSERT ON flight
    FOR EACH ROW EXECUTE FUNCTION flight_fill_fares();

COMMIT;
