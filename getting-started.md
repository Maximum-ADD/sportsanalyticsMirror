# Getting Started

This page should get a new contributor from a clean clone to a running app in under 15 minutes. If it doesn't, that's a bug in this page — fix it, don't just work around it.

## Prerequisites

- **Node.js** (LTS, v24+) and **npm** — for both `apps/api` (NestJS) and `apps/web` (React + Vite)
- **Docker** and **Docker Compose** — runs Postgres locally
- **Git**, with access to the project's Gitea repository
- **Python 3** — only if you're working on the `nba_api` ingestion piece (`apps/ingestion`), the predictor (`apps/predictor`), or the optimizer (`apps/optimizer`)

## 1. Clone the repo

```bash
git clone https://sdp.ms.wits.ac.za/innovation/sportsanalytics.git
cd sportsanalytics
```

## 2. Set up environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in the values `.env.example` documents. The required variables are:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (default: `postgresql://postgres:postgres@localhost:55432/nba_analytics?schema=public`) |
| `PORT` | API port (default: `4000`) |
| `WEB_ORIGIN` | CORS origin for the frontend (default: `http://localhost:5173`, comma-separated for multiple) |
| `BETTER_AUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | API origin (default: `http://localhost:4000`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — create at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `VITE_API_BASE_URL` | (frontend, if needed) API base URL for production builds |

Never commit the filled-in `.env` files. See [Security](security.md) for why.

## 3. Start Postgres

```bash
docker compose up -d
```

This brings up Postgres locally so both apps can connect to it. Confirm it's running with `docker compose ps`.

## 4. Set up the database

From `apps/api`:

```bash
cd apps/api
npm install
npx prisma migrate dev
npx prisma db seed   # loads mock NBA seed data
```

## 5. Run the backend

```bash
npm run start:dev
```

The NestJS API should now be running at `http://localhost:4000`. The health check at `/health` should return `{ "status": "ok" }`.

## 6. Run the frontend

From `apps/web`, in a separate terminal:

```bash
cd apps/web
npm install
npm run dev
```

Vite's dev server will print the local URL (default `http://localhost:5173`). The Vite config proxies `/api/*` to `http://localhost:4000`, so the frontend reaches the backend transparently.

## 7. Run tests

```bash
# from apps/api (Vitest + Supertest, integration tests run against a real disposable Postgres DB)
npm run test

# from apps/web (Vitest + React Testing Library)
npm run test
```

## 8. Run the same checks CI runs

Before pushing, run locally what [CI](ci-cd.md) will run on your branch — a failure here is a failure there:

```bash
# apps/api
npm ci
npx prisma generate     # required before typecheck; needs no database
npm run lint            # ESLint 10, flat config
npx tsc --noEmit

# apps/web
npm ci
npm run lint            # oxlint
npx tsc -b --noEmit     # -b is required: tsconfig.json is solution-style
```

## Troubleshooting

| Problem | Likely cause |
|---|---|
| API can't connect to Postgres | Docker Compose isn't running, or the connection string in `apps/api/.env` doesn't match the Compose service | 
| Prisma migration fails | Database not reachable yet — wait a few seconds after `docker compose up -d` before migrating, or check `docker compose logs` |
| Frontend shows no data / requests to `/api/...` 404 or fail with a CORS error | Confirmed working via `vite.config.ts`'s `/api` → `http://localhost:4000` proxy — if you're still seeing this, check the backend is actually running on port 4000. |
| Google sign-in fails locally | Check `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set in `apps/api/.env` and the redirect URI (`http://localhost:4000/auth/callback/google`) is registered in the Google Cloud console. |
| `tsc` reports "Cannot find module" errors in `apps/api` for packages that *are* in `package.json` | Stale local install. Run `npm ci && npm run prisma:generate` in `apps/api`. |

If you hit something not covered here, add it to this table once you've solved it — that's the point of this page.

---

*AI Declaration: The preceding document was generated with the assistance of the following: Claude-Web[Claude Sonnet 5]*
