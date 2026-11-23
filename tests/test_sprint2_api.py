"""Sprint 2 API acceptance tests (pytest + httpx against a running backend on API_URL).

Stories: AUTH-2 Airline Staff Access, BKG-3 Live Seat Availability,
         FLT-1 Manage Flight Data, REP-1 Passenger List.

Run through scripts/evidence.sh (or evidence.ps1), which starts a throwaway seeded DB.
Every flight/booking created here is deleted at the end of the session (see conftest.created).
"""
import threading
from datetime import date, timedelta

import httpx
import pytest

from conftest import (API_URL, PASSWORD, STAFF_EMP, TRAVELER, bearer, book, pay, plane_id)

story = pytest.mark.story


def seat_state(api, token, flight_id):
    d = api.get(f"/flights/{flight_id}", headers=bearer(token)).json()
    return d, {s["seat_no"]: s for s in d["seats"]}


# =============================================================== AUTH-2 Airline Staff Access

@story("AUTH-2", "Employee logs in with employee number + password")
def test_auth2_employee_login_ok(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": STAFF_EMP, "password": PASSWORD}))
    assert r.status_code == 200
    body = r.json()
    assert body["token"] and body["employee"]["employee_no"] == STAFF_EMP
    ev.note(f"employee_no={body['employee']['employee_no']}, JWT issued")


@story("AUTH-2", "Employee number is trimmed (' EMP9001 ')")
def test_auth2_employee_login_trimmed(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": f"  {STAFF_EMP} ", "password": PASSWORD}))
    assert r.status_code == 200


@story("AUTH-2", "Wrong password is rejected")
def test_auth2_wrong_password(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": STAFF_EMP, "password": "WrongPass1!"}))
    assert r.status_code == 401
    assert "token" not in r.json()


@story("AUTH-2", "Unknown employee number is rejected (same generic message)")
def test_auth2_unknown_employee(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": "EMP0000", "password": PASSWORD}))
    assert r.status_code == 401
    wrong_pw = api.post("/employee_login", json={"empId": STAFF_EMP, "password": "x"})
    assert r.json()["detail"] == wrong_pw.json()["detail"]   # no account enumeration


@story("AUTH-2", "Traveler account cannot use employee login")
def test_auth2_traveler_cannot_employee_login(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": TRAVELER, "password": PASSWORD}))
    assert r.status_code == 401


@story("AUTH-2", "Missing password field is invalid input")
def test_auth2_missing_password(api, ev):
    r = ev.observe(api.post("/employee_login", json={"empId": STAFF_EMP}))
    assert r.status_code == 422


@story("AUTH-2", "Traveler token on a staff endpoint → 403")
def test_auth2_traveler_token_forbidden(api, ev, traveler_token):
    r = ev.observe(api.post("/employees/verify-password", headers=bearer(traveler_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 403


@story("AUTH-2", "No token on a staff endpoint → 401")
def test_auth2_no_token(api, ev):
    r = ev.observe(api.post("/employees/verify-password", json={"password": PASSWORD}))
    assert r.status_code == 401


@story("AUTH-2", "Tampered/invalid token → 401")
def test_auth2_invalid_token(api, ev):
    r = ev.observe(api.post("/employees/verify-password", headers=bearer("not.a.jwt"),
                            json={"password": PASSWORD}))
    assert r.status_code == 401


@story("AUTH-2", "Staff re-confirms password (correct)")
def test_auth2_verify_password_ok(api, ev, staff_token):
    r = ev.observe(api.post("/employees/verify-password", headers=bearer(staff_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 200 and r.json() == {"verified": True}


@story("AUTH-2", "Staff re-confirms password (wrong)")
def test_auth2_verify_password_wrong(api, ev, staff_token):
    r = ev.observe(api.post("/employees/verify-password", headers=bearer(staff_token),
                            json={"password": "nope"}))
    assert r.status_code == 401


# =============================================================== FLT-1 Manage Flight Data

@story("FLT-1", "List plane types with seat counts and per-minute fares")
def test_flt1_planes(api, ev):
    r = ev.observe(api.get("/planes"))
    assert r.status_code == 200
    planes = r.json()
    assert len(planes) >= 4
    for p in planes:
        assert sum(p["seats_by_tier"].values()) == p["total_seats"]
        assert all(v > 0 for v in p["fare_per_minute"].values())
    ev.note(f"{len(planes)} planes, all with fares")


@story("FLT-1", "Fare calculator returns fares for a plane + times")
def test_flt1_fare_calculate(api, ev):
    r = ev.observe(api.get("/fares/calculate", params={
        "plane_id": plane_id(api), "depart_at": "2026-12-20T09:30:00-05:00", "arrive_at": "2026-12-20T10:35:00-05:00"}))
    assert r.status_code == 200
    body = r.json()
    assert body["duration_minutes"] == 65
    f = body["fares_cents"]
    assert f["premium"] > f["standard"] > f["economy"] > 0
    ev.note(f"economy ${f['economy'] / 100:.2f} for 65 min")


@story("FLT-1", "Fare calculator: arrival before departure → 400")
def test_flt1_fare_calculate_bad_times(api, ev):
    r = ev.observe(api.get("/fares/calculate", params={
        "plane_id": plane_id(api), "depart_at": "2026-12-20T10:00:00Z", "arrive_at": "2026-12-20T09:00:00Z"}))
    assert r.status_code == 400


@story("FLT-1", "Fare calculator: unknown plane → 404")
def test_flt1_fare_calculate_unknown_plane(api, ev):
    r = ev.observe(api.get("/fares/calculate", params={
        "plane_id": 9999, "depart_at": "2026-12-20T09:00:00Z", "arrive_at": "2026-12-20T10:00:00Z"}))
    assert r.status_code == 404


@story("FLT-1", "Staff adds a flight; fares filled from plane rates; codes upper-cased")
def test_flt1_create_flight(api, ev, staff_token, created):
    d = date.today() + timedelta(days=45)
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "yyz", "destination": "yow",
        "depart_at": f"{d.isoformat()}T09:30", "duration_minutes": 65}))
    assert r.status_code == 201
    f = r.json()["flight"]
    created.flight_ids.add(f["id"])
    assert f["origin"] == "YYZ" and f["destination"] == "YOW" and f["status"] == "scheduled"
    assert f["flight_no"].startswith("FH")
    calc = api.get("/fares/calculate", params={
        "plane_id": plane_id(api), "depart_at": f["depart_at"], "arrive_at": f["arrive_at"]}).json()["fares_cents"]
    assert (f["premium_fare_cents"], f["standard_fare_cents"], f["economy_fare_cents"]) == \
           (calc["premium"], calc["standard"], calc["economy"])
    ev.note(f"{f['flight_no']} created, fares match /fares/calculate")


@story("FLT-1", "Departure time is interpreted as local time at the origin")
def test_flt1_create_flight_local_time(api, ev, new_flight, db):
    f, r = new_flight(origin="YVR", destination="YYZ", plane_id=3, minutes=270, hhmm="07:30")
    ev.observe(r)
    # The API echoes the timestamp in the DB session's zone, so check local time in Postgres
    local_dep, local_arr_utc_minutes = db.execute("""
        SELECT to_char(f.depart_at AT TIME ZONE a.timezone, 'HH24:MI'),
               EXTRACT(EPOCH FROM f.arrive_at - f.depart_at) / 60
        FROM flight f JOIN airport a ON a.code = f.origin WHERE f.id = %s
    """, (f["id"],)).fetchone()
    assert local_dep == "07:30" and local_arr_utc_minutes == 270
    ev.note("stored as 07:30 America/Vancouver, 270 min block time")


@story("FLT-1", "New flight appears in traveler search with open seats")
def test_flt1_new_flight_in_search(api, ev, new_flight, traveler_token):
    f, _ = new_flight(days_ahead=50)
    day = f["depart_at"][:10]
    r = ev.observe(api.get("/flights/search", headers=bearer(traveler_token),
                           params={"from": "YYZ", "to": "YOW", "departure_date": day, "flex_days": 0}))
    assert r.status_code == 200
    hit = [x for x in r.json() if x["id"] == f["id"]]
    assert hit and sum(hit[0]["seats_available"].values()) > 0


@story("FLT-1", "Unknown plane → 400 'Plane does not exist' (FK error reaches handler)")
def test_flt1_create_flight_unknown_plane(api, ev, staff_token):
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": 99999, "origin": "YYZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}))
    assert r.status_code == 400 and r.json()["detail"] == "Plane does not exist"


@story("FLT-1", "Same origin and destination → 400")
def test_flt1_create_flight_same_airports(api, ev, staff_token):
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YYZ",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}))
    assert r.status_code == 400


@story("FLT-1", "Unknown airport code → 400")
def test_flt1_create_flight_unknown_airport(api, ev, staff_token):
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "ZZZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}))
    assert r.status_code == 400


@story("FLT-1", "Invalid input: zero duration / 4-letter code → 422")
def test_flt1_create_flight_invalid_input(api, ev, staff_token):
    r1 = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 0}), "duration 0")
    r2 = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "YYZZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}), "origin YYZZ")
    assert r1.status_code == 422 and r2.status_code == 422


@story("FLT-1", "Departure in the past is rejected → 400")
def test_flt1_create_flight_in_past(api, ev, staff_token, created):
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YOW",
        "depart_at": "2020-01-15T09:30", "duration_minutes": 60}))
    if r.status_code == 201:
        created.flight_ids.add(r.json()["flight"]["id"])
    assert r.status_code == 400
    assert r.json()["detail"] == "Departure time must be in the future"


@story("FLT-1", "Departure earlier today (origin local time) is rejected → 400")
def test_flt1_create_flight_earlier_today(api, ev, staff_token, created):
    # one hour ago in UTC, sent with an explicit offset so the check is timezone-independent
    from datetime import datetime, timezone
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
    r = ev.observe(api.post("/flights", headers=bearer(staff_token), json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YOW",
        "depart_at": past, "duration_minutes": 60}))
    if r.status_code == 201:
        created.flight_ids.add(r.json()["flight"]["id"])
    assert r.status_code == 400


@story("FLT-1", "Traveler token cannot add a flight → 403")
def test_flt1_create_flight_traveler(api, ev, traveler_token):
    r = ev.observe(api.post("/flights", headers=bearer(traveler_token), json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}))
    assert r.status_code == 403


@story("FLT-1", "No token cannot add a flight → 401")
def test_flt1_create_flight_no_token(api, ev):
    r = ev.observe(api.post("/flights", json={
        "plane_id": plane_id(api), "origin": "YYZ", "destination": "YOW",
        "depart_at": "2026-12-20T09:30", "duration_minutes": 60}))
    assert r.status_code == 401


@story("FLT-1", "Staff cancels a flight with password; booking rows kept (cancelled since FLT-2), flight leaves search")
def test_flt1_cancel_flight(api, ev, staff_token, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=55)
    assert book(api, traveler_token, f["id"], "10A").status_code == 200
    r = ev.observe(api.post(f"/employees/flights/{f['id']}/cancel", headers=bearer(staff_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    detail = api.get(f"/flights/{f['id']}", headers=bearer(staff_token)).json()
    assert detail["status"] == "cancelled"
    search = api.get("/flights/search", headers=bearer(traveler_token),
                     params={"from": "YYZ", "to": "YOW", "departure_date": f["depart_at"][:10], "flex_days": 0}).json()
    assert all(x["id"] != f["id"] for x in search)
    manifest = api.get(f"/flights/{f['id']}/passengers", headers=bearer(staff_token)).json()
    # Sprint 3 (FLT-2) changed this: bookings on a cancelled flight are now cancelled + refunded,
    # but the rows are still kept (not deleted).
    assert manifest["passenger_count"] == 0
    with_cancelled = api.get(f"/flights/{f['id']}/passengers", headers=bearer(staff_token),
                             params={"include_cancelled": True}).json()
    assert len(with_cancelled["passengers"]) == 1    # booking row not deleted
    ev.note("status=cancelled, hidden from search, booking row kept")


@story("FLT-1", "Cancelling an already-cancelled flight → 400")
def test_flt1_cancel_flight_twice(api, ev, staff_token, new_flight):
    f, _ = new_flight(days_ahead=56)
    first = api.post(f"/employees/flights/{f['id']}/cancel", headers=bearer(staff_token), json={"password": PASSWORD})
    assert first.status_code == 200
    r = ev.observe(api.post(f"/employees/flights/{f['id']}/cancel", headers=bearer(staff_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 400


@story("FLT-1", "Cancel with wrong password → 401, flight stays scheduled")
def test_flt1_cancel_flight_wrong_password(api, ev, staff_token, demo_flight):
    r = ev.observe(api.post(f"/employees/flights/{demo_flight['id']}/cancel", headers=bearer(staff_token),
                            json={"password": "WrongPass1!"}))
    assert r.status_code == 401
    assert api.get(f"/flights/{demo_flight['id']}").json()["status"] == "scheduled"
    ev.note(f"{demo_flight['flight_no']} still scheduled")


@story("FLT-1", "Cancel unknown flight → 404")
def test_flt1_cancel_unknown_flight(api, ev, staff_token):
    r = ev.observe(api.post("/employees/flights/999999/cancel", headers=bearer(staff_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 404


@story("FLT-1", "Traveler token cannot cancel a flight → 403")
def test_flt1_cancel_flight_traveler(api, ev, traveler_token, demo_flight):
    r = ev.observe(api.post(f"/employees/flights/{demo_flight['id']}/cancel", headers=bearer(traveler_token),
                            json={"password": PASSWORD}))
    assert r.status_code == 403


@story("FLT-1", "No token cannot cancel a flight → 401")
def test_flt1_cancel_flight_no_token(api, ev, demo_flight):
    r = ev.observe(api.post(f"/employees/flights/{demo_flight['id']}/cancel", json={"password": PASSWORD}))
    assert r.status_code == 401


# =============================================================== BKG-3 Live Seat Availability

@story("BKG-3", "Seat map: per-seat availability matches tier counts and layout")
def test_bkg3_seat_map(api, ev, traveler_token, demo_flight):
    r = ev.observe(api.get(f"/flights/{demo_flight['id']}", headers=bearer(traveler_token)))
    assert r.status_code == 200
    d = r.json()
    for tier, n in d["seats_available"].items():
        assert n == sum(1 for s in d["seats"] if s["tier"] == tier and s["available"])
    assert len(d["seats"]) == d["plane"]["total_seats"]
    assert sum(d["seat_layout"]) == d["total_columns"]
    open_eco = [s["seat_no"] for s in d["seats"] if s["tier"] == "economy" and s["available"]]
    ev.note(f"{d['flight_no']}: open {d['seats_available']}, economy open {open_eco}")


@story("BKG-3", "Booking a seat makes it unavailable immediately; counts drop by 1")
def test_bkg3_booking_updates_availability(api, ev, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=60)
    before, seats = seat_state(api, traveler_token, f["id"])
    assert seats["12C"]["available"]
    r = ev.observe(book(api, traveler_token, f["id"], "12C"))
    assert r.status_code == 200
    after, seats = seat_state(api, traveler_token, f["id"])
    assert not seats["12C"]["available"] and seats["12C"]["mine"]
    assert after["seats_available"]["economy"] == before["seats_available"]["economy"] - 1
    ev.note(f"economy open {before['seats_available']['economy']} → {after['seats_available']['economy']}")


@story("BKG-3", "Booking an already-taken seat → 409")
def test_bkg3_taken_seat(api, ev, traveler_token, traveler2_token, new_flight):
    f, _ = new_flight(days_ahead=61)
    assert book(api, traveler_token, f["id"], "9A").status_code == 200
    r = ev.observe(book(api, traveler2_token, f["id"], "9A"))
    assert r.status_code == 409


@story("BKG-3", "Two travelers book the same free seat at the same moment → one 200, one 409")
def test_bkg3_concurrent_booking(ev, traveler_token, traveler2_token, new_flight, api, demo_flight):
    f, _ = new_flight(days_ahead=62)
    tokens = [traveler_token, traveler2_token]
    payments = [pay(api, t) for t in tokens]          # pay first so only the booking races
    barrier = threading.Barrier(len(tokens))
    results = [None, None]

    def go(i):
        with httpx.Client(base_url=API_URL, timeout=20) as c:
            body = {"flight_id": f["id"], "payment_token": payments[i],
                    "travelers": [{"seat_no": "15F", "full_name": f"Racer {i}", "passport_no": "P1", "checked_bags": 0}]}
            barrier.wait()
            results[i] = c.post("/bookings", headers=bearer(tokens[i]), json=body)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(len(tokens))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for i, r in enumerate(results):
        ev.observe(r, f"traveler {i + 1}")
    assert sorted(r.status_code for r in results) == [200, 409]
    manifest = api.get(f"/flights/{f['id']}/passengers",
                       headers=bearer(_staff(api))).json()
    assert [p["seat_no"] for p in manifest["passengers"]] == ["15F"]


def _staff(api):
    return api.post("/employee_login", json={"empId": STAFF_EMP, "password": PASSWORD}).json()["token"]


@story("BKG-3", "Booking a seat that does not exist on the plane → 400")
def test_bkg3_unknown_seat(api, ev, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=63)
    r = ev.observe(book(api, traveler_token, f["id"], "99Z"))
    assert r.status_code == 400


@story("BKG-3", "Same seat twice in one request → 400")
def test_bkg3_duplicate_seat_in_request(api, ev, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=64)
    r = ev.observe(api.post("/bookings", headers=bearer(traveler_token), json={
        "flight_id": f["id"], "payment_token": pay(api, traveler_token),
        "travelers": [{"seat_no": "5A", "full_name": "A", "passport_no": "1"},
                      {"seat_no": "5A", "full_name": "B", "passport_no": "2"}]}))
    assert r.status_code == 400


@story("BKG-3", "Unknown flight → 404 (details and booking)")
def test_bkg3_unknown_flight(api, ev, traveler_token):
    r1 = ev.observe(api.get("/flights/999999", headers=bearer(traveler_token)), "GET")
    r2 = ev.observe(book(api, traveler_token, 999999, "1A"), "book")
    assert r1.status_code == 404 and r2.status_code == 404


@story("BKG-3", "Cancelled flight cannot be booked → 404")
def test_bkg3_cancelled_flight_not_bookable(api, ev, staff_token, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=65)
    api.post(f"/employees/flights/{f['id']}/cancel", headers=bearer(staff_token), json={"password": PASSWORD})
    r = ev.observe(book(api, traveler_token, f["id"], "10B"))
    assert r.status_code == 404


@story("BKG-3", "Traveler cancels a booking → seat is free again")
def test_bkg3_cancel_booking_frees_seat(api, ev, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=66)
    assert book(api, traveler_token, f["id"], "11D").status_code == 200
    _, seats = seat_state(api, traveler_token, f["id"])
    booking_id = api.get(f"/flights/{f['id']}", headers=bearer(traveler_token)).json()["my_bookings"][0]["booking_id"]
    r = ev.observe(api.post("/bookings/cancel", headers=bearer(traveler_token), json={"booking_ids": [booking_id]}))
    assert r.status_code == 200
    _, seats = seat_state(api, traveler_token, f["id"])
    assert seats["11D"]["available"]


@story("BKG-3", "Cancelling an already-cancelled booking → 404")
def test_bkg3_cancel_booking_twice(api, ev, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=67)
    assert book(api, traveler_token, f["id"], "11E").status_code == 200
    bid = api.get(f"/flights/{f['id']}", headers=bearer(traveler_token)).json()["my_bookings"][0]["booking_id"]
    api.post("/bookings/cancel", headers=bearer(traveler_token), json={"booking_ids": [bid]})
    r = ev.observe(api.post("/bookings/cancel", headers=bearer(traveler_token), json={"booking_ids": [bid]}))
    assert r.status_code == 404


@story("BKG-3", "Booking without a token → 401")
def test_bkg3_book_no_token(api, ev, demo_flight):
    r = ev.observe(api.post("/bookings", json={"flight_id": demo_flight["id"], "payment_token": "x",
                                               "travelers": [{"seat_no": "1A", "full_name": "A", "passport_no": "1"}]}))
    assert r.status_code == 401


# =============================================================== REP-1 Passenger List

@story("REP-1", "Staff sees the confirmed passenger list for the demo flight, ordered by seat")
def test_rep1_passenger_list(api, ev, staff_token, demo_flight):
    r = ev.observe(api.get(f"/flights/{demo_flight['id']}/passengers", headers=bearer(staff_token)))
    assert r.status_code == 200
    body = r.json()
    assert body["flight"]["flight_no"] == demo_flight["flight_no"]
    assert body["passenger_count"] == demo_flight["confirmed"] == len(body["passengers"])
    seats = [p["seat_no"] for p in body["passengers"]]
    assert seats == sorted(seats, key=lambda s: (int(s[:-1]), s[-1]))
    for p in body["passengers"]:
        assert p["traveler_name"] and p["booking_ref"] and p["booked_by"]["email"]
    ev.note(f"{demo_flight['flight_no']}: {body['passenger_count']} passengers")


@story("REP-1", "New booking shows up in the passenger list")
def test_rep1_new_booking_listed(api, ev, staff_token, traveler_token, new_flight):
    f, _ = new_flight(days_ahead=70)
    assert book(api, traveler_token, f["id"], "4B", name="Evidence Tester").status_code == 200
    r = ev.observe(api.get(f"/flights/{f['id']}/passengers", headers=bearer(staff_token)))
    names = [(p["traveler_name"], p["seat_no"]) for p in r.json()["passengers"]]
    assert names == [("Evidence Tester", "4B")]


@story("REP-1", "Cancelled bookings hidden by default, shown with include_cancelled=true")
def test_rep1_include_cancelled(api, ev, staff_token, demo_flight, db):
    # seed: FR801 has one cancelled + one confirmed booking on seat 10A
    fid = db.execute("SELECT id FROM flight WHERE flight_no = 'FR801'").fetchone()[0]
    r1 = ev.observe(api.get(f"/flights/{fid}/passengers", headers=bearer(staff_token)), "default")
    r2 = ev.observe(api.get(f"/flights/{fid}/passengers", headers=bearer(staff_token),
                            params={"include_cancelled": "true"}), "include_cancelled")
    assert len(r1.json()["passengers"]) == 1
    assert len(r2.json()["passengers"]) == 2
    assert r2.json()["passenger_count"] == 1    # count is confirmed only
    ev.note("FR801: 1 confirmed / 2 incl. cancelled")


@story("REP-1", "Unknown flight → 404")
def test_rep1_unknown_flight(api, ev, staff_token):
    r = ev.observe(api.get("/flights/999999/passengers", headers=bearer(staff_token)))
    assert r.status_code == 404


@story("REP-1", "Invalid flight id → 422")
def test_rep1_invalid_flight_id(api, ev, staff_token):
    r = ev.observe(api.get("/flights/abc/passengers", headers=bearer(staff_token)))
    assert r.status_code == 422


@story("REP-1", "Traveler token → 403")
def test_rep1_traveler_forbidden(api, ev, traveler_token, demo_flight):
    r = ev.observe(api.get(f"/flights/{demo_flight['id']}/passengers", headers=bearer(traveler_token)))
    assert r.status_code == 403


@story("REP-1", "No token → 401")
def test_rep1_no_token(api, ev, demo_flight):
    r = ev.observe(api.get(f"/flights/{demo_flight['id']}/passengers"))
    assert r.status_code == 401
