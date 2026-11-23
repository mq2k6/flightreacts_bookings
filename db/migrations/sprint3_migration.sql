-- CP317A Group 23 - Sprint 3 migration
-- Run after sprint2_migration.sql. Re-runnable: every step checks before it changes anything.
--
-- FLT-2: record WHY a booking was cancelled, so the account page can tell
-- "you cancelled this" apart from "the airline cancelled your flight".

BEGIN;

-- 1. New column: who cancelled the booking -----------------------------------
--    NULL               = booking is still confirmed
--    'traveler'         = the traveler cancelled it (POST /bookings/cancel, partial refund policy)
--    'flight_cancelled' = staff cancelled the whole flight (full refund)
ALTER TABLE passenger_seat ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(20);

ALTER TABLE passenger_seat DROP CONSTRAINT IF EXISTS passenger_seat_cancel_reason_check;
ALTER TABLE passenger_seat ADD CONSTRAINT passenger_seat_cancel_reason_check
    CHECK (cancel_reason IS NULL OR cancel_reason IN ('traveler', 'flight_cancelled'));

-- 2. Backfill: before Sprint 3 the only way to cancel a booking was the traveler
--    cancelling it themselves, so every existing cancelled booking is 'traveler'.
UPDATE passenger_seat
SET cancel_reason = 'traveler'
WHERE status = 'cancelled' AND cancel_reason IS NULL;

-- 3. Repair: in Sprint 2, cancelling a flight left its bookings 'confirmed'.
--    Cancel and fully refund those now, exactly as the new endpoint does.
UPDATE passenger_seat ps
SET status        = 'cancelled',
    cancelled_at  = now(),
    refund_cents  = ps.total_cents,
    cancel_reason = 'flight_cancelled'
FROM flight f
WHERE f.id = ps.flight_id
  AND f.status = 'cancelled'
  AND ps.status = 'confirmed';

COMMIT;
