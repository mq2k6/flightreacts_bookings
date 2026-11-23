"""Sprint 3 API acceptance tests (pytest + httpx against a running backend on API_URL).

Stories: UI-2 Filter Search Results, FLT-2 Cancelled Flights Refund Travelers,
         REP-2 Popular Routes Report, REP-3 Frequently Flown Cities Report,
         AUTH-3 Admin vs Staff Roles, plus regression checks of Sprint 1-2 features.

Each test checks one acceptance criterion. Every flight/booking a test creates is deleted
at the end of the session (conftest.created). See tests/README.md for how to run.
"""
import io
from datetime import date, timedelta

import openpyxl
import pytest

from conftest import (PASSWORD, REGULAR_STAFF_EMP, STAFF_EMP, TRAVELER, bearer, book, pay)

story = pytest.mark.story
ADMIN_EMP = STAFF_EMP                     # EMP9001 is the seeded admin
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def flight_nos(resp):
    return sorted(f["flight_no"] for f in resp.json())


def confirmed_count(db, flight_id):
    return db.execute("SELECT COUNT(*) FROM passenger_seat WHERE flight_id = %s AND status = 'confirmed'",
                      (flight_id,)).fetchone()[0]


# =============================================================== UI-2 Filter Search Results
# Three flights on a route the seed never uses (YHZ -> YOW), so results depend only on them:
#   morning 07:00 on the Embraer E175 (cheapest), afternoon 13:00 on the 787, evening 19:30 on the A220.
# The morning flight's economy cabin is sold out, for the seat-tier filter.

@pytest.fixture(scope="module")
def ui2(api, staff_token, created, db):
    planes = {p["model"]: p["id"] for p in api.get("/planes").json()}
    flights = {}
    for key, days, hhmm, model in [("morning", 30, "07:00", "Embraer E175"),
                                   ("afternoon", 31, "13:00", "Boeing 787-9"),
                                   ("evening", 32, "19:30", "Airbus A220-300")]:
        d = (date.today() + timedelta(days=days)).isoformat()
        r = api.post("/flights", headers=bearer(staff_token), json={
            "plane_id": planes[model], "origin": "YHZ", "destination": "YOW",
            "depart_at": f"{d}T{hhmm}", "duration_minutes": 60})
        assert r.status_code == 201, r.text
        f = r.json()["flight"]
        created.flight_ids.add(f["id"])
        flights[key] = f
    # Sell out economy on the morning flight (direct insert; removed with the flight)
    m = flights["morning"]
    db.execute("""
        INSERT INTO passenger_seat (booking_ref, passenger_id, flight_id, seat_id, traveler_name,
            base_fare_cents, taxes_cents, fees_cents, total_cents, payment_ref)
        SELECT 'U' || s.id, (SELECT id FROM passenger WHERE email = %s), %s, s.id, 'UI-2 filler',
               %s, 0, 0, %s, 'UI2-TEST'
        FROM seat s WHERE s.plane_id = %s AND s.tier = 'economy'
    """, (TRAVELER, m["id"], m["economy_fare_cents"], m["economy_fare_cents"], m["plane_id"]))
    return flights


def ui2_search(api, token, **filters):
    params = {"from": "YHZ", "to": "YOW", "departure_date": "", "max_price": "",
              "departure_time": "", "direct_only": "true", "seat_tier": "Any", **filters}
    return api.get("/flights/search", params=params, headers=bearer(token))


def nos(flights, *keys):
    return sorted(flights[k]["flight_no"] for k in keys)


@story("UI-2", "Empty filters (as the homepage sends them) return the unfiltered results")
def test_ui2_empty_filters(api, ev, traveler_token, ui2):
    r = ev.observe(ui2_search(api, traveler_token))
    assert r.status_code == 200
    assert flight_nos(r) == nos(ui2, "morning", "afternoon", "evening")


@story("UI-2", "Max price alone (tier Any = cheapest fare) narrows results")
def test_ui2_max_price(api, ev, traveler_token, ui2):
    cheapest = lambda f: min(f["premium_fare_cents"], f["standard_fare_cents"], f["economy_fare_cents"])
    limit_cents = cheapest(ui2["morning"])           # E175 is the cheapest plane per minute
    assert all(cheapest(ui2[k]) > limit_cents for k in ("afternoon", "evening"))
    r = ev.observe(ui2_search(api, traveler_token, max_price=f"{limit_cents / 100:.2f}"))
    ev.note(f"max_price=${limit_cents / 100:.2f}")
    assert r.status_code == 200 and flight_nos(r) == nos(ui2, "morning")


@story("UI-2", "Max price with a seat tier compares that tier's fare")
def test_ui2_max_price_with_tier(api, ev, traveler_token, ui2):
    limit = ui2["evening"]["premium_fare_cents"]    # A220 premium; 787 premium is higher
    expected = [k for k in ("morning", "afternoon", "evening") if ui2[k]["premium_fare_cents"] <= limit]
    r = ev.observe(ui2_search(api, traveler_token, max_price=f"{limit / 100:.2f}", seat_tier="Premium"))
    assert r.status_code == 200 and flight_nos(r) == nos(ui2, *expected)
    assert ui2["afternoon"]["flight_no"] not in flight_nos(r)


@pytest.mark.parametrize("window,expected", [("Morning", ["morning"]), ("Afternoon", ["afternoon"]),
                                             ("Evening", ["evening"])])
@story("UI-2", "Departure time alone (Morning / Afternoon / Evening at origin local time)")
def test_ui2_departure_window(api, ev, traveler_token, ui2, window, expected):
    r = ev.observe(ui2_search(api, traveler_token, departure_time=window), label=window)
    assert r.status_code == 200 and flight_nos(r) == nos(ui2, *expected)


@story("UI-2", "Departure time as HH:MM means 'departs at or after'")
def test_ui2_departure_at_or_after(api, ev, traveler_token, ui2):
    r1 = ev.observe(ui2_search(api, traveler_token, departure_time="13:00"), label="13:00")
    r2 = ev.observe(ui2_search(api, traveler_token, departure_time="13:01"), label="13:01")
    assert flight_nos(r1) == nos(ui2, "afternoon", "evening")
    assert flight_nos(r2) == nos(ui2, "evening")


@story("UI-2", "Seat tier alone: only flights with a free seat in that tier (HAVING)")
def test_ui2_seat_tier(api, ev, traveler_token, ui2):
    r = ev.observe(ui2_search(api, traveler_token, seat_tier="Economy"), label="Economy")
    assert flight_nos(r) == nos(ui2, "afternoon", "evening")      # morning economy is sold out
    r = ev.observe(ui2_search(api, traveler_token, seat_tier="Premium"), label="Premium")
    assert flight_nos(r) == nos(ui2, "morning", "afternoon", "evening")


@story("UI-2", "All filters combined")
def test_ui2_combined(api, ev, traveler_token, ui2):
    e = ui2["evening"]
    r = ev.observe(ui2_search(api, traveler_token, max_price=f"{e['standard_fare_cents'] / 100:.2f}",
                              seat_tier="Standard", departure_time="Evening"))
    assert flight_nos(r) == nos(ui2, "evening")
    r = ev.observe(ui2_search(api, traveler_token, max_price=f"{e['standard_fare_cents'] / 100:.2f}",
                              seat_tier="Economy", departure_time="Morning"))
    assert r.json() == []                                          # morning economy sold out


@story("UI-2", "No flight matches the filters -> []")
def test_ui2_no_match(api, ev, traveler_token, ui2):
    r = ev.observe(ui2_search(api, traveler_token, max_price="1"))
    assert r.status_code == 200 and r.json() == []


@story("UI-2", "Clearing the filters restores the results")
def test_ui2_clear_restores(api, ev, traveler_token, ui2):
    assert ui2_search(api, traveler_token, max_price="1").json() == []
    r = ev.observe(ui2_search(api, traveler_token))
    assert len(r.json()) == 3


@pytest.mark.parametrize("bad", [{"seat_tier": "first"}, {"departure_time": "noonish"},
                                 {"max_price": "-5"}, {"max_price": "abc"}])
@story("UI-2", "Invalid filter values are rejected with 422")
def test_ui2_invalid(api, ev, traveler_token, ui2, bad):
    r = ev.observe(ui2_search(api, traveler_token, **bad), label=str(bad))
    assert r.status_code == 422


@story("UI-2", "direct_only is accepted and ignored (all flights are direct)")
def test_ui2_direct_only_ignored(api, ev, traveler_token, ui2):
    r = ev.observe(ui2_search(api, traveler_token, direct_only="false"))
    assert len(r.json()) == 3


# =============================================================== FLT-2 Cancelled flights refund travelers

@pytest.fixture
def booked_flight(api, new_flight, traveler_token, traveler2_token, db):
    """A new flight with 3 confirmed bookings from two travelers."""
    f, _ = new_flight(days_ahead=45, origin="YYZ", destination="YHZ")
    for token, seat in [(traveler_token, "20A"), (traveler_token, "20B"), (traveler2_token, "20C")]:
        r = book(api, token, f["id"], seat)
        assert r.status_code == 200, r.text
    assert confirmed_count(db, f["id"]) == 3
    return f


def cancel_flight(api, token, flight_id, password=PASSWORD):
    return api.post(f"/employees/flights/{flight_id}/cancel", headers=bearer(token), json={"password": password})


@story("FLT-2", "Admin cancels a flight: every booking cancelled with a full refund, reason flight_cancelled")
def test_flt2_cancel_refunds_all(api, ev, staff_token, booked_flight, db):
    before = db.execute("SELECT COUNT(*), SUM(total_cents) FROM passenger_seat WHERE flight_id = %s AND status = 'confirmed'",
                        (booked_flight["id"],)).fetchone()
    r = ev.observe(cancel_flight(api, staff_token, booked_flight["id"]))
    body = r.json()
    ev.note(f"bookings_refunded={body['bookings_refunded']}, total_refunded_cents={body['total_refunded_cents']}")
    assert r.status_code == 200
    assert (body["bookings_refunded"], body["total_refunded_cents"]) == (before[0], before[1])
    rows = db.execute("SELECT status, refund_cents = total_cents, cancel_reason FROM passenger_seat WHERE flight_id = %s",
                      (booked_flight["id"],)).fetchall()
    assert rows and all(row == ("cancelled", True, "flight_cancelled") for row in rows)
    assert db.execute("SELECT status FROM flight WHERE id = %s", (booked_flight["id"],)).fetchone()[0] == "cancelled"


@story("FLT-2", "Traveler's account shows the airline-cancelled booking with its refund")
def test_flt2_account_shows_cancellation(api, ev, staff_token, traveler_token, booked_flight):
    assert cancel_flight(api, staff_token, booked_flight["id"]).status_code == 200
    r = ev.observe(api.get("/account/overview", headers=bearer(traveler_token)))
    mine = [b for b in r.json()["airline_cancelled"] if b["flight_id"] == booked_flight["id"]]
    ev.note(f"airline_cancelled: {[(b['seat_no'], b['refund_cents']) for b in mine]}")
    assert sorted(b["seat_no"] for b in mine) == ["20A", "20B"]
    assert all(b["refund_cents"] == b["total_cents"] for b in mine)
    assert all(b["flight_id"] != booked_flight["id"] for b in r.json()["upcoming"])


@story("FLT-2", "Cancelled flight no longer appears in search")
def test_flt2_not_in_search(api, ev, staff_token, traveler_token, booked_flight):
    assert cancel_flight(api, staff_token, booked_flight["id"]).status_code == 200
    r = ev.observe(api.get("/flights/search", params={"from": "YYZ", "to": "YHZ"}, headers=bearer(traveler_token)))
    assert booked_flight["flight_no"] not in flight_nos(r)


@story("FLT-2", "Cancelling the same flight again -> 400")
def test_flt2_cancel_twice(api, ev, staff_token, booked_flight):
    assert cancel_flight(api, staff_token, booked_flight["id"]).status_code == 200
    r = ev.observe(cancel_flight(api, staff_token, booked_flight["id"]))
    assert r.status_code == 400


@story("FLT-2", "Wrong password -> 401 and nothing changes")
def test_flt2_wrong_password(api, ev, staff_token, booked_flight, db):
    r = ev.observe(cancel_flight(api, staff_token, booked_flight["id"], password="WrongPass1!"))
    assert r.status_code == 401
    assert db.execute("SELECT status FROM flight WHERE id = %s", (booked_flight["id"],)).fetchone()[0] == "scheduled"
    assert confirmed_count(db, booked_flight["id"]) == 3


@story("FLT-2", "A flight that already departed cannot be cancelled -> 400")
def test_flt2_departed(api, ev, staff_token, db):
    fid = db.execute("SELECT id FROM flight WHERE status = 'scheduled' AND depart_at < now() ORDER BY depart_at DESC LIMIT 1").fetchone()[0]
    r = ev.observe(cancel_flight(api, staff_token, fid))
    assert r.status_code == 400
    assert db.execute("SELECT status FROM flight WHERE id = %s", (fid,)).fetchone()[0] == "scheduled"


@story("FLT-2", "Traveler's own cancellation is recorded with cancel_reason = traveler")
def test_flt2_traveler_reason(api, ev, traveler_token, new_flight, db):
    f, _ = new_flight(days_ahead=46)
    ref = book(api, traveler_token, f["id"], "18A").json()["bookings"][0]["booking_ref"]
    bid = db.execute("SELECT id FROM passenger_seat WHERE booking_ref = %s", (ref,)).fetchone()[0]
    r = ev.observe(api.post("/bookings/cancel", headers=bearer(traveler_token), json={"booking_ids": [bid]}))
    assert r.status_code == 200
    assert db.execute("SELECT cancel_reason FROM passenger_seat WHERE id = %s", (bid,)).fetchone()[0] == "traveler"


# =============================================================== REP-2 / REP-3 Reports

def period(days=90):
    return (date.today() - timedelta(days)).isoformat(), (date.today() + timedelta(days)).isoformat()


POPULAR_SQL = """
SELECT f.origin, f.destination, COUNT(*), SUM(ps.total_cents)
FROM passenger_seat ps JOIN flight f ON f.id = ps.flight_id
WHERE ps.status = 'confirmed' AND ps.created_at::date BETWEEN %s AND %s
GROUP BY 1, 2 ORDER BY 3 DESC, 4 DESC, 1, 2 LIMIT %s"""

CITIES_SQL = """
SELECT m.code, SUM(m.dep), SUM(m.arr), COUNT(*)
FROM (SELECT f.origin AS code, 1 AS dep, 0 AS arr FROM flight f JOIN airport o ON o.code = f.origin
      WHERE f.status = 'scheduled' AND (f.depart_at AT TIME ZONE o.timezone)::date BETWEEN %s AND %s
      UNION ALL
      SELECT f.destination, 0, 1 FROM flight f JOIN airport o ON o.code = f.origin
      WHERE f.status = 'scheduled' AND (f.depart_at AT TIME ZONE o.timezone)::date BETWEEN %s AND %s) m
JOIN airport a ON a.code = m.code
GROUP BY a.city, m.code ORDER BY 4 DESC, 2 DESC, a.city LIMIT %s"""


@story("REP-2", "Popular routes ranking matches a direct SQL count")
def test_rep2_matches_sql(api, ev, staff_token, db):
    s, e = period()
    r = ev.observe(api.get("/reports/popular-routes", params={"start": s, "end": e}, headers=bearer(staff_token)))
    got = [(x["origin"], x["destination"], x["bookings"], x["revenue_cents"]) for x in r.json()["rows"]]
    want = [tuple(x) for x in db.execute(POPULAR_SQL, (s, e, 10)).fetchall()]
    ev.note("top 3: " + ", ".join(f"{o}-{d} {n}" for o, d, n, _ in got[:3]))
    assert r.status_code == 200 and got == want and len(got) > 1
    assert [x["rank"] for x in r.json()["rows"]] == list(range(1, len(got) + 1))


@story("REP-2", "Booking-date range filters correctly (one month)")
def test_rep2_date_range(api, ev, staff_token, db):
    first = date.today().replace(day=1) - timedelta(days=1)
    s, e = first.replace(day=1).isoformat(), first.isoformat()      # whole previous month
    r = ev.observe(api.get("/reports/popular-routes", params={"start": s, "end": e, "limit": 100},
                           headers=bearer(staff_token)))
    total = sum(x["bookings"] for x in r.json()["rows"])
    sql = db.execute("SELECT COUNT(*) FROM passenger_seat WHERE status = 'confirmed' AND created_at::date BETWEEN %s AND %s",
                     (s, e)).fetchone()[0]
    ev.note(f"{s}..{e}: {total} bookings (SQL {sql})")
    assert total == sql


@story("REP-2", "Period with no bookings -> empty rows")
def test_rep2_empty_period(api, ev, staff_token):
    r = ev.observe(api.get("/reports/popular-routes", params={"start": "2020-01-01", "end": "2020-01-31"},
                           headers=bearer(staff_token)))
    assert r.status_code == 200 and r.json()["rows"] == []


@pytest.mark.parametrize("endpoint", ["popular-routes", "frequent-cities"])
@story("REP-2", "start after end is rejected (400); bad date / limit / format -> 422")
def test_rep_validation(api, ev, staff_token, endpoint):
    h = bearer(staff_token)
    r = ev.observe(api.get(f"/reports/{endpoint}", params={"start": "2026-12-01", "end": "2026-11-01"}, headers=h), label="start>end")
    assert r.status_code == 400
    for label, params in [("bad date", {"start": "2026-13-45"}), ("limit 0", {"limit": 0}),
                          ("limit 101", {"limit": 101}), ("format pdf", {"format": "pdf"})]:
        assert ev.observe(api.get(f"/reports/{endpoint}", params=params, headers=h), label=label).status_code == 422


@story("REP-2", "Excel export: content type, filename, opens with expected header row")
def test_rep2_xlsx(api, ev, staff_token):
    s, e = period()
    r = ev.observe(api.get("/reports/popular-routes", params={"start": s, "end": e, "format": "xlsx"},
                           headers=bearer(staff_token)))
    assert r.headers["content-type"] == XLSX
    assert r.headers["content-disposition"] == f'attachment; filename="popular-routes_{s}_{e}.xlsx"'
    ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
    assert [c.value for c in ws[4]] == ["Rank", "From", "From city", "To", "To city", "Confirmed bookings", "Revenue"]
    rows = api.get("/reports/popular-routes", params={"start": s, "end": e}, headers=bearer(staff_token)).json()["rows"]
    assert ws.max_row - 4 == len(rows)
    assert ws.cell(5, 7).value == rows[0]["revenue_cents"] / 100          # revenue written as dollars
    ev.note(f"{ws['A1'].value}; {ws.max_row - 4} rows; row 1 revenue ${ws.cell(5, 7).value:,.2f}")


@story("REP-3", "Frequent cities ranking matches a direct SQL count")
def test_rep3_matches_sql(api, ev, staff_token, db):
    s, e = period()
    r = ev.observe(api.get("/reports/frequent-cities", params={"start": s, "end": e}, headers=bearer(staff_token)))
    got = [(x["code"], x["departures"], x["arrivals"], x["total_flights"]) for x in r.json()["rows"]]
    want = [tuple(x) for x in db.execute(CITIES_SQL, (s, e, s, e, 10)).fetchall()]
    ev.note("top 3: " + ", ".join(f"{c} {t}" for c, _, _, t in got[:3]))
    assert r.status_code == 200 and got == want and len(got) > 1


@story("REP-3", "Cancelled flights are not counted")
def test_rep3_excludes_cancelled(api, ev, staff_token, new_flight):
    f, _ = new_flight(days_ahead=50, origin="LHR", destination="LAX")       # route with few flights
    params = {"start": f["depart_at"][:10], "end": f["depart_at"][:10]}
    def lhr():
        rows = api.get("/reports/frequent-cities", params=params, headers=bearer(staff_token)).json()["rows"]
        return next((x["departures"] for x in rows if x["code"] == "LHR"), 0)
    before = lhr()
    assert cancel_flight(api, staff_token, f["id"]).status_code == 200
    after = lhr()
    ev.note(f"LHR departures that day: {before} -> {after} after cancelling")
    assert after == before - 1


@story("REP-3", "Excel export: content type, filename, opens with expected header row")
def test_rep3_xlsx(api, ev, staff_token):
    s, e = period()
    r = ev.observe(api.get("/reports/frequent-cities", params={"start": s, "end": e, "format": "xlsx"},
                           headers=bearer(staff_token)))
    assert r.headers["content-type"] == XLSX
    assert r.headers["content-disposition"] == f'attachment; filename="frequent-cities_{s}_{e}.xlsx"'
    ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
    assert [c.value for c in ws[4]] == ["Rank", "City", "Airport", "Departures", "Arrivals", "Total flights"]
    ev.note(f"{ws['A1'].value}; {ws.max_row - 4} rows")


# =============================================================== AUTH-3 Admin vs staff roles

ADMIN_ONLY = [("POST", "/employees/flights/{fid}/cancel", {"password": PASSWORD}),
              ("GET", "/reports/popular-routes", None),
              ("GET", "/reports/frequent-cities", None)]


@pytest.fixture
def any_future_flight(db):
    return db.execute("SELECT id FROM flight WHERE status = 'scheduled' AND depart_at > now() ORDER BY id LIMIT 1").fetchone()[0]


@pytest.mark.parametrize("method,path,body", ADMIN_ONLY)
@story("AUTH-3", "Regular staff gets 403 'Admin access required' on admin-only endpoints")
def test_auth3_staff_forbidden(api, ev, regular_staff_token, any_future_flight, db, method, path, body):
    r = ev.observe(api.request(method, path.format(fid=any_future_flight), json=body,
                               headers=bearer(regular_staff_token)), label=path.split("/")[-1])
    assert r.status_code == 403 and r.json()["detail"] == "Admin access required"
    assert db.execute("SELECT status FROM flight WHERE id = %s", (any_future_flight,)).fetchone()[0] == "scheduled"


@pytest.mark.parametrize("method,path,body", ADMIN_ONLY)
@story("AUTH-3", "Traveler gets 403 and no token gets 401 on admin-only endpoints")
def test_auth3_traveler_and_anonymous(api, ev, traveler_token, any_future_flight, method, path, body):
    url = path.format(fid=any_future_flight)
    assert ev.observe(api.request(method, url, json=body, headers=bearer(traveler_token)), label="traveler").status_code == 403
    assert ev.observe(api.request(method, url, json=body), label="no token").status_code == 401


@story("AUTH-3", "Admin can use admin-only endpoints (reports 200; cancel tested under FLT-2)")
def test_auth3_admin_allowed(api, ev, staff_token):
    for ep in ("popular-routes", "frequent-cities"):
        assert ev.observe(api.get(f"/reports/{ep}", headers=bearer(staff_token)), label=ep).status_code == 200


@story("AUTH-3", "Regular staff keeps staff features (verify password, passenger list, add flight)")
def test_auth3_staff_keeps_staff_features(api, ev, regular_staff_token, any_future_flight, created):
    h = bearer(regular_staff_token)
    assert ev.observe(api.post("/employees/verify-password", headers=h, json={"password": PASSWORD}), label="verify").status_code == 200
    assert ev.observe(api.get(f"/flights/{any_future_flight}/passengers", headers=h), label="passengers").status_code == 200
    d = (date.today() + timedelta(days=60)).isoformat()
    r = ev.observe(api.post("/flights", headers=h, json={"plane_id": api.get("/planes").json()[0]["id"], "origin": "YYZ",
                                                         "destination": "YUL", "depart_at": f"{d}T10:00", "duration_minutes": 75}),
                   label="add flight")
    assert r.status_code == 201
    created.flight_ids.add(r.json()["flight"]["id"])


@story("AUTH-3", "Traveler still gets 403 on every staff endpoint")
def test_auth3_traveler_on_staff_endpoints(api, ev, traveler_token, any_future_flight):
    h = bearer(traveler_token)
    assert ev.observe(api.post("/employees/verify-password", headers=h, json={"password": PASSWORD}), label="verify").status_code == 403
    assert ev.observe(api.get(f"/flights/{any_future_flight}/passengers", headers=h), label="passengers").status_code == 403
    assert ev.observe(api.post("/flights", headers=h, json={}), label="add flight").status_code in (403, 422)


@story("AUTH-3", "Employee login returns employee_type; /me returns it too")
def test_auth3_login_returns_role(api, ev, traveler_token):
    a = ev.observe(api.post("/employee_login", json={"empId": ADMIN_EMP, "password": PASSWORD}), label=ADMIN_EMP)
    s = ev.observe(api.post("/employee_login", json={"empId": REGULAR_STAFF_EMP, "password": PASSWORD}), label=REGULAR_STAFF_EMP)
    assert a.json()["employee"]["employee_type"] == "admin"
    assert s.json()["employee"]["employee_type"] == "staff"
    assert api.get("/me", headers=bearer(a.json()["token"])).json()["employee_type"] == "admin"
    assert api.get("/me", headers=bearer(traveler_token)).json()["employee_type"] is None
    ev.note("EMP9001=admin, EMP1001=staff, traveler /me employee_type=null")


@story("AUTH-3", "Employee login error: 'Invalid employee number or password' (wrong password and unknown number)")
def test_auth3_login_error_message(api, ev):
    for label, body in [("wrong password", {"empId": ADMIN_EMP, "password": "WrongPass1!"}),
                        ("unknown number", {"empId": "EMP0000", "password": PASSWORD})]:
        r = ev.observe(api.post("/employee_login", json=body), label=label)
        assert r.status_code == 401 and r.json()["detail"] == "Invalid employee number or password"


# =============================================================== Regression (Sprint 1-2 features)

@story("REG", "Traveler login works; wrong password -> 401")
def test_reg_login(api, ev):
    assert ev.observe(api.post("/login", json={"email": TRAVELER, "password": PASSWORD})).status_code == 200
    assert ev.observe(api.post("/login", json={"email": TRAVELER, "password": "nope"})).status_code == 401


@story("REG", "Search without filters still works (YYZ -> YVR has upcoming flights)")
def test_reg_search(api, ev, traveler_token):
    r = ev.observe(api.get("/flights/search", params={"from": "YYZ", "to": "YVR"}, headers=bearer(traveler_token)))
    assert r.status_code == 200 and len(r.json()) >= 1
    ev.note(f"{flight_nos(r)}")


@story("REG", "Book a seat with the mock payment, then cancel it (traveler refund policy)")
def test_reg_book_and_cancel(api, ev, traveler_token, new_flight, db):
    f, _ = new_flight(days_ahead=47)
    r = ev.observe(book(api, traveler_token, f["id"], "17C"), label="book")
    assert r.status_code == 200
    ref = r.json()["bookings"][0]["booking_ref"]
    bid, total = db.execute("SELECT id, total_cents FROM passenger_seat WHERE booking_ref = %s", (ref,)).fetchone()
    r = ev.observe(api.post("/bookings/cancel", headers=bearer(traveler_token), json={"booking_ids": [bid]}), label="cancel")
    assert r.status_code == 200 and r.json()["refund_cents"] == total     # within 24h of booking: 100%


@story("REG", "Seat map still has layout and live availability")
def test_reg_seat_map(api, ev, traveler_token, db):
    fid = db.execute("SELECT id FROM flight WHERE flight_no = 'FR203'").fetchone()[0]
    r = ev.observe(api.get(f"/flights/{fid}", headers=bearer(traveler_token)))
    d = r.json()
    assert d["seat_layout"] and d["total_columns"] and d["seats"]
    taken = sum(not s["available"] for s in d["seats"])
    assert taken == confirmed_count(db, fid)
