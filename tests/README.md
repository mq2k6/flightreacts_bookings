# API acceptance tests

`pytest` + `httpx` tests that call the running backend, one test per acceptance criterion.

| File | Stories |
|---|---|
| `test_sprint3.py` | UI-2 search filters, FLT-2 cancelled-flight refunds, REP-2 / REP-3 reports, AUTH-3 admin vs staff, regression |
| `test_sprint2_api.py` | AUTH-2, BKG-3, FLT-1, REP-1 (Sprint 2) |

The tests create, book, cancel and delete data, so **always run them against a local test
database, never the team (Supabase) database.** `conftest.py` refuses to start if
`DATABASE_URL` is not on `localhost`.

## 1. Build a local test database

```
createdb flightreacts_test
psql -d flightreacts_test -f sprint1_initial_schema.sql
psql -d flightreacts_test -f db/migrations/sprint2_migration.sql
psql -d flightreacts_test -f db/migrations/sprint3_migration.sql
psql -d flightreacts_test -f db/seed/seed_test_data.sql
```

To start over: `dropdb flightreacts_test` and repeat.

## 2. Start the backend against it

The environment variables override `src/backend/.env`, so this never touches the team database.

```
cd src/backend
DATABASE_URL=postgresql+psycopg://localhost/flightreacts_test JWT_SECRET=test-secret uvicorn main:app --port 8000
```

(Windows PowerShell: `$env:DATABASE_URL="postgresql+psycopg://localhost/flightreacts_test"; $env:JWT_SECRET="test-secret"; uvicorn main:app --port 8000`)

## 3. Run the tests (second terminal, from the repo root)

```
pip install -r requirements.txt
DATABASE_URL=postgresql://localhost/flightreacts_test pytest tests/ -v
```

- `DATABASE_URL` here is used to check results directly in the database and to clean up.
  Add your user/password/port if your local Postgres needs them,
  e.g. `postgresql://postgres@localhost:5433/flightreacts_test`.
- `API_URL` (default `http://localhost:8000`) points at the backend.
- Run one story: `pytest tests/test_sprint3.py -k flt2 -v`

## Output

Besides the normal pytest output, each run writes a markdown results table per sprint to
`sprint_evidence/sprint<N>_test_results.md` (story, test, case, observed status + message,
pass/fail), ready to paste into the sprint report.

Everything the tests create (flights, bookings) is deleted at the end of the run.
