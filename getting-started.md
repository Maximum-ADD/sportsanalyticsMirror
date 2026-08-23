# Getting Started

This page should get a new contributor from a clean clone to a running app in under 15 minutes. If it doesn't, that's a bug in this page — fix it, don't just work around it.

!!! warning "Placeholder values"
    Repo URLs, exact env variable names, and a couple of commands below are placeholders (`<...>`) — this page was drafted from the tech stack and the initial scaffold described in the [AI Usage Ledger](ai-usage.md), not from the actual repo. Swap in the real values and delete this note once verified.

## Prerequisites

- **Node.js** (LTS) and **npm** or **pnpm** — for both `apps/api` (NestJS) and `apps/web` (React + Vite)
- **Docker** and **Docker Compose** — runs Postgres locally
- **Git**, with access to the project's Gitea repository
- **Python 3** — only if you're working on the `nba_api` ingestion piece (see the open question in [Tech Stack](tech-stack.md))

## 1. Clone the repo

```bash
git clone https://sdp.ms.wits.ac.za/innovation/sportsanalytics.git
cd sportsanalytics
```

## 2. Set up environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Fill in the values `.env.example` documents — database connection string, and a **Google OAuth client ID/secret** for BetterAuth (not a Passport/session secret; auth was migrated, see [ADR-002](decisions/adr-002-auth.md)). Never commit the filled-in `.env` files. See [Security](security.md) for why.

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
npx prisma db seed   # loads mock NBA seed data, if a seed script exists
```

## 5. Run the backend

```bash
npm run start:dev
```

The NestJS API should now be running (default `http://localhost:3000` unless configured otherwise). Check the OpenAPI/Swagger docs, once set up, at `/api` or `/docs`.

## 6. Run the frontend

From `apps/web`, in a separate terminal:

```bash
cd apps/web
npm install
npm run dev
```

Vite's dev server will print the local URL (default `http://localhost:5173`).

## 7. Run tests

```bash
# from apps/api (Vitest + Supertest, integration tests run against a real disposable Postgres DB)
npm run test

# from apps/web (Vitest + React Testing Library)
npm run test
```

!!! note "No test files exist yet"
    Both apps have the test tooling installed but no actual test files. `apps/api`'s suite passes only because CI uses `--passWithNoTests`; `apps/web` has no `test` script at all yet. See [CI/CD Pipeline](ci-cd.md).

## 8. Run the same checks CI runs

Before pushing, run locally what [CI](ci-cd.md) will run on your branch — a failure here is a failure there:

```bash
# apps/api
npm ci
npx prisma generate     # required before typecheck; needs no database
npm run lint            # ESLint 10, flat config
npx tsc --noEmit
npm test -- --passWithNoTests

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
| Frontend shows no data / requests to `/api/...` 404 or fail with a CORS error | Confirmed working via `vite.config.ts`'s `/api` → `http://localhost:4000` proxy — if you're still seeing this, check the backend is actually running on port 4000, not that the proxy is missing. |
| Google sign-in fails locally | Check `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or equivalent) are set in `apps/api/.env` and the redirect URI is registered for `localhost` in the Google Cloud console — a common first-run gap after the BetterAuth migration. |
| `tsc` reports ~19 "Cannot find module" errors in `apps/api` for packages that *are* in `package.json` (`@nestjs/passport`, `bcryptjs`, `passport`), or missing Prisma fields like `passwordHash` | Stale local install, not real errors. Your `node_modules` predates recent dependency additions and the generated Prisma client is out of date. Run `npm ci && npm run prisma:generate` in `apps/api`. Confirmed clean on a fresh install — see [CI/CD Pipeline](ci-cd.md#local-parity). |

If you hit something not covered here, add it to this table once you've solved it — that's the point of this page.

---

*AI Declaration: The preceding document was generated with the assistance of the following: Claude-Web[Claude Sonnet 5]*
 