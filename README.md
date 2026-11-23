# Infrastructure

Frontend: React + TypeScript + Tailwind, built with Vite (`src/frontend/`).\
Backend: FastAPI + Python (`src/backend/main.py`).\
Database: PostgreSQL.

# Requirements

- Python 3.13+ and `pip install -r requirements.txt` (one file, at the repo root)
- Node.js 20 or newer
- PostgreSQL 16 (local install, Docker, or a hosted database)

# Setup (in this order)

## 1. Create the database
```
createdb flightreacts
```

## 2. Load the schema, then the migrations
Migrations are re-runnable, so running one twice is harmless.
```
psql -d flightreacts -f sprint1_initial_schema.sql
psql -d flightreacts -f db/migrations/sprint2_migration.sql
```

## 3. (Optional) Load the test data
All test accounts end in `@example.com` and use the password `TestPass123!`.
```
psql -d flightreacts -f db/seed/seed_test_data.sql
```
To reseed, run `db/seed/cleanup_test_data.sql` first.

## 4. Configure and run the backend
Copy `src/backend/.env.example` to `src/backend/.env` and fill in `JWT_SECRET` and `DATABASE_URL`
(keep the `postgresql+psycopg://` prefix). `.env` is git-ignored — never commit it.
```
cd src/backend
uvicorn main:app --reload
```
The API runs on http://localhost:8000.

## 5. Run the frontend
`package.json` lives in `src/`, so run npm from there:
```
cd src
npm install
npm run dev
```
Then open the link it prints (usually http://localhost:5173).

# Adding screens to the Frontend from Figma (Figroot)

1. Put the exported file in `src/frontend/components/`, e.g. `SearchFlights.tsx`.
2. Rename the component if its name starts with a number (`1LogInSignUp` → `LogInSignUp`).
3. Remove the Next.js-only setup Figroot suggests (`next/font`, `tailwind.config.ts`). The `font-inter` class already works here.
4. Turn text that should be typed into real `<input>`s, and make buttons/links actually do something.
