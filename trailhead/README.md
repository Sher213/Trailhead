# Trailhead

"Duolingo for knowledge" — say what you want to become, get a curated roadmap of
real books (plus hands-on actions) rendered as a winding trail map, with
AI-generated reflection prompts to make sure you actually absorbed each one.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- lucide-react icons
- Anthropic Messages API (called directly from the browser for this prototype)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Then run it:

```bash
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

## Important: API key exposure

This prototype calls `api.anthropic.com` **directly from the browser**, which
means anyone who opens dev tools can read your API key out of the network
request. That's fine for local development and demos, but **do not deploy
this build publicly as-is**.

Before shipping to real users, replace `src/lib/claude.ts`'s direct `fetch`
with a call to your own backend endpoint (e.g. a small serverless function)
that holds the API key server-side and forwards the request to Anthropic.
The request/response shape can stay identical — only the URL and the
key-handling move server-side.

## Persistence

Progress is saved to the browser's `localStorage` (see `src/lib/storage.ts`),
scoped to whatever origin you're running on. There's no backend database and
no accounts — clearing site data clears your saved trails. Swapping in a real
database later just means reimplementing `storageGet` / `storageSet` /
`storageDelete` against your API instead of `localStorage`.

## Project structure

```
src/
  Trailhead.tsx     the whole app (onboarding, trail map, reflection modal)
  types.ts          shared TypeScript types
  lib/
    claude.ts       Anthropic API client
    storage.ts      localStorage-backed persistence
  App.tsx
  main.tsx
  index.css         Tailwind entry point
```

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```

## Notes / next steps

- Roadmaps and reflection prompts are generated fresh by the model each time
  — nothing is curated or cached yet. The natural next step (per the original
  product plan) is to start caching/curating the best-performing roadmaps
  into a real database rather than regenerating them live forever.
- No auth — everything is local to the browser.
- Model used: `claude-sonnet-4-6`, `max_tokens: 1000`. Bump `max_tokens` in
  `src/lib/claude.ts` if you ask for longer roadmaps and see truncated JSON.
