"""Shared fixtures for the sprint API acceptance tests.

Every test records (story, case, observed status + message) through the `ev` fixture.
At the end of the session the results are written to sprint_evidence/sprint<N>_test_results.md
(one file per test_sprint<N>_*.py module that ran).
Targets API_URL (default http://localhost:8000) and cleans up via DATABASE_URL.
Refuses to run against a non-local database unless ALLOW_REMOTE_DB=1.
"""
import os
import re
from urllib.parse import urlparse
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import psycopg
import pytest

API_URL = os.getenv("API_URL", "http://localhost:8000")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5433/flightreacts_test")
ROOT = Path(__file__).resolve().parents[1]
RESULTS_DIR = ROOT / "sprint_evidence"

# Safety: these tests create, cancel and delete data. Never point them at the team database.
if urlparse(DATABASE_URL.replace("+psycopg", "")).hostname not in ("localhost", "127.0.0.1", "::1") \
        and os.getenv("ALLOW_REMOTE_DB") != "1":
    raise pytest.UsageError(
        "DATABASE_URL is not a local database. These tests modify data; "
        "run them against a local test database (see tests/README.md)."
    )

PASSWORD = "TestPass123!"
STAFF_EMP = "EMP9001"          # admin (employee_type = 'admin')
REGULAR_STAFF_EMP = "EMP1001"  # regular staff (employee_type = 'staff')
TRAVELER = "alice.nguyen@example.com"
TRAVELER_2 = "ben.okafor@example.com"
TEST_CARD = {"card_number": "4242 4242 4242 4242", "exp": "12/30", "cvc": "123"}

STORY_TITLES = {
    # Sprint 3
    "UI-2": "Filter Search Results",
    "FLT-2": "Cancelled Flights Refund Travelers",
    "REP-2": "Popular Routes Report",
    "REP-3": "Frequently Flown Cities Report",
    "AUTH-3": "Admin vs Staff Roles",
    "REG": "Regression (Sprint 1-2 features)",
    # Sprint 2
    "AUTH-2": "Airline Staff Access",
    "BKG-3": "Live Seat Availability",
    "FLT-1": "Manage Flight Data",
    "REP-1": "Passenger List",
}

_results: list[dict] = []


def _db_conninfo() -> str:
    # SQLAlchemy URL -> libpq URL
    return DATABASE_URL.replace("postgresql+psycopg://", "postgresql://")


@dataclass
class Evidence:
    story: str
    case: str
    observed: list[str] = field(default_factory=list)

    def observe(self, resp: httpx.Response, label: str | None = None) -> httpx.Response:
        try:
            body = resp.json()
        except ValueError:
            body = None
        if isinstance(body, dict) and "detail" in body:
            d = body["detail"]
            msg = d if isinstance(d, str) else "; ".join(
                f"{'.'.join(map(str, e.get('loc', [])[1:]))}: {e.get('msg')}" for e in d
            )
        elif isinstance(body, dict) and "message" in body:
            msg = body["message"]
        elif isinstance(body, list):
            msg = f"{len(body)} item(s)"
        else:
            msg = ""
        text = f"{resp.status_code}" + (f" \"{msg}\"" if msg else "")
        self.observed.append(f"{label}: {text}" if label else text)
        return resp

    def note(self, text: str) -> None:
        self.observed.append(text)


@pytest.fixture
def ev(request):
    marker = request.node.get_closest_marker("story")
    if marker is None:
        raise RuntimeError(f"{request.node.name} needs @pytest.mark.story(id, case)")
    story, case = marker.args
    e = Evidence(story, case)
    request.node._evidence = e
    yield e


def pytest_configure(config):
    config.addinivalue_line("markers", "story(id, case): story ID and human-readable test case")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    e = getattr(item, "_evidence", None)
    if e is None:
        return
    if rep.when == "call" or (rep.when == "setup" and rep.failed):
        if hasattr(rep, "wasxfail"):
            result = "Fail (known defect, xfail)" if rep.skipped else "Pass (xfail fixed?)"
        else:
            result = "Pass" if rep.passed else "Fail"
        observed = " → ".join(e.observed) or "—"
        if rep.failed and not hasattr(rep, "wasxfail"):
            observed += f" — assertion: {str(rep.longrepr).splitlines()[-1][:160]}"
        m = re.search(r"test_sprint(\d+)", item.module.__name__)
        _results.append({"sprint": m.group(1) if m else "?", "test": item.name,
                         "story": e.story, "case": e.case, "observed": observed, "result": result})


def pytest_sessionfinish(session, exitstatus):
    if not _results:
        return
    order = list(STORY_TITLES)
    for sprint in sorted({r["sprint"] for r in _results}):
        rows = sorted((r for r in _results if r["sprint"] == sprint),
                      key=lambda r: order.index(r["story"]) if r["story"] in order else 99)
        passed = sum(r["result"].startswith("Pass") for r in rows)
        lines = [
            f"# Sprint {sprint} — API acceptance test results",
            "",
            f"Generated by `tests/test_sprint{sprint}*.py` against `{API_URL}` "
            "(local PostgreSQL test database: schema + migrations + `db/seed/seed_test_data.sql`).",
            "",
            f"**{passed} / {len(rows)} passed.**",
            "",
            "| Story | Test | Test case | Observed result (status + message) | Pass/Fail |",
            "|---|---|---|---|---|",
        ]
        for r in rows:
            story = f"{r['story']} {STORY_TITLES.get(r['story'], '')}".strip()
            obs = r["observed"].replace("|", "\\|")
            lines.append(f"| {story} | `{r['test']}` | {r['case']} | {obs} | {r['result']} |")
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        (RESULTS_DIR / f"sprint{sprint}_test_results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- clients / auth

@pytest.fixture(scope="session")
def api():
    with httpx.Client(base_url=API_URL, timeout=20) as c:
        yield c


def _login_traveler(api, email):
    r = api.post("/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def staff_token(api):
    r = api.post("/employee_login", json={"empId": STAFF_EMP, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def regular_staff_token(api):
    r = api.post("/employee_login", json={"empId": REGULAR_STAFF_EMP, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def traveler_token(api):
    return _login_traveler(api, TRAVELER)


@pytest.fixture(scope="session")
def traveler2_token(api):
    return _login_traveler(api, TRAVELER_2)


def plane_id(api):
    """First plane's id (ids change every time the seed is reloaded)."""
    return api.get("/planes").json()[0]["id"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- DB + cleanup

@pytest.fixture(scope="session")
def db():
    with psycopg.connect(_db_conninfo(), autocommit=True) as conn:
        yield conn


@pytest.fixture(scope="session")
def demo_flight(db):
    """The future scheduled flight with the most confirmed bookings (FR112 in the seed)."""
    row = db.execute("""
        SELECT f.id, f.flight_no, COUNT(ps.id) AS n
        FROM flight f
        JOIN passenger_seat ps ON ps.flight_id = f.id AND ps.status = 'confirmed'
        WHERE f.status = 'scheduled' AND f.depart_at > now()
        GROUP BY f.id ORDER BY n DESC, f.id LIMIT 1
    """).fetchone()
    assert row, "no demo flight in seed data"
    return {"id": row[0], "flight_no": row[1], "confirmed": row[2]}


class Created:
    def __init__(self):
        self.flight_ids: set[int] = set()


@pytest.fixture(scope="session")
def created(db):
    c = Created()
    yield c
    if c.flight_ids:
        ids = list(c.flight_ids)
        db.execute("DELETE FROM passenger_seat WHERE flight_id = ANY(%s)", (ids,))
        db.execute("DELETE FROM flight WHERE id = ANY(%s)", (ids,))
        left = db.execute("SELECT COUNT(*) FROM flight WHERE id = ANY(%s)", (ids,)).fetchone()[0]
        assert left == 0, "test flights were not cleaned up"


@pytest.fixture
def new_flight(api, staff_token, created):
    """Factory: create a future flight through POST /flights; it is deleted after the session."""
    def make(days_ahead=40, plane_id=None, origin="YYZ", destination="YOW", minutes=65, hhmm="09:30"):
        from datetime import date, timedelta
        if plane_id is None:   # plane ids change when the seed is reloaded; use the first plane
            plane_id = api.get("/planes").json()[0]["id"]
        d = date.today() + timedelta(days=days_ahead)
        r = api.post("/flights", headers=bearer(staff_token), json={
            "plane_id": plane_id, "origin": origin, "destination": destination,
            "depart_at": f"{d.isoformat()}T{hhmm}", "duration_minutes": minutes,
        })
        assert r.status_code == 201, r.text
        f = r.json()["flight"]
        created.flight_ids.add(f["id"])
        return f, r
    return make


def pay(api, token):
    r = api.post("/payments/mock-charge", headers=bearer(token), json=TEST_CARD)
    assert r.status_code == 200, r.text
    return r.json()["payment_token"]


def book(api, token, flight_id, seat_no, name="Test Traveler"):
    return api.post("/bookings", headers=bearer(token), json={
        "flight_id": flight_id,
        "payment_token": pay(api, token),
        "travelers": [{"seat_no": seat_no, "full_name": name, "passport_no": "X1234567", "checked_bags": 0}],
    })
