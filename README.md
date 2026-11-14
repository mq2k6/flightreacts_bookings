# Infrastructure

Frontend: React + TypeScript + Tailwind, built with Vite.\
Backend: FastAPI + Python

# Install

Run `pip install -r requirements.txt`.\
You need Node.js 20 or newer.

# Run it
## Frontend:
```
cd src
cd frontend
npm install
npm run dev
```
## Backend:
```
cd src
cd backend
uvicorn main:app --reload
```
\
Then open the link it prints (usually http://localhost:5173).
# Adding screens to the Frontend from Figma (Figroot)

1. Put the exported file in `src/components/`, e.g. `SearchFlights.tsx`.
2. Rename the component if its name starts with a number (`1LogInSignUp` → `LogInSignUp`).
3. Remove the Next.js-only setup Figroot suggests (`next/font`, `tailwind.config.ts`). The `font-inter` class already works here.
4. Turn text that should be typed into real `<input>`s, and make buttons/links actually do something.
