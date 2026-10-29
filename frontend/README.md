# Frontend

React + TypeScript + Tailwind, built with Vite.

## Run it

You need Node.js 20 or newer.

```
cd frontend
npm install
npm run dev
```

Then open the link it prints (usually http://localhost:5173).

## Adding screens from Figma (Figroot)

1. Put the exported file in `src/components/`, e.g. `SearchFlights.tsx`.
2. Rename the component if its name starts with a number (`1LogInSignUp` → `LogInSignUp`).
3. Remove the Next.js-only setup Figroot suggests (`next/font`, `tailwind.config.ts`). The `font-inter` class already works here.
4. Turn text that should be typed into real `<input>`s, and make buttons/links actually do something.
