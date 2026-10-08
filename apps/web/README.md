# apps/web

The web app: a React + Vite + TypeScript single-page app styled with
Tailwind, using TanStack Query for data and Recharts for charts. It talks to
`apps/api` only over HTTP (live: <https://sportsanalytics.pages.dev/>).

Setup from a clean clone is in the [root README](../../README.md#getting-started).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Serves on <http://localhost:5173>, proxying `/api` and `/auth` to the API on port 4000 |
| `npm test` | Component and page specs (Vitest, React Testing Library, jsdom), including `axe` accessibility checks |
| `npm run test:cov` | The same, with coverage; CI fails under 80% |
| `npm run lint` | oxlint |
| `npm run build` | Typechecks and builds `dist/`, one chunk per page |

## Environment

Copy `.env.example` to `.env`. For local development the only value to set
is `SITE_PROXY_API_KEY`, which `npm run prisma:seed` in `apps/api` prints:
the dev proxy sends it on signed-out requests, because the API's public
reads need a key or a session. It is never exposed to the browser. In
production the Cloudflare Pages functions in `functions/` do the same job.

## Layout

| Folder | Holds |
|---|---|
| `src/pages` | One component per route (see `App.tsx`); each loads as its own chunk |
| `src/components` | Shared and per-area components; `ui/` holds the shadcn primitives |
| `src/lib` | API clients (`nbaApi.ts`, `meApi.ts`, `adminApi.ts`, ...), auth and pure helpers |
| `src/test` | Test setup, fixtures and the `axe` helper |
