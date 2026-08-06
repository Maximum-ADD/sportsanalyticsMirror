# AI Usage Ledger

Every use of AI tooling on this project is logged here, per the COMS3011A
brief's AI attribution requirement (§1.4).

| Date       | Tool        | Model              | Purpose                                                                 | Files affected                                   | Author |
|------------|-------------|--------------------|--------------------------------------------------------------------------|---------------------------------------------------|--------|
| 2026-08-06 | Claude Code | Claude Sonnet 5    | Initial project scaffold: monorepo structure, Express+Prisma API (auth, players/teams/stats endpoints), mock NBA seed data, React+Vite+Tailwind frontend (player list + profile pages), Docker Compose for local Postgres, root README | `apps/api/**`, `apps/web/**`, `docker-compose.yml`, `README.md`, `.gitignore` | Josh |
| 2026-08-06 | Claude Code | Claude Sonnet 5    | Migrated the API backend from Express to NestJS (modules/controllers/guards/global exception filter), preserving existing auth, players, and teams behaviour exactly; step 1 of moving the stack to the agreed tech choices | `apps/api/**`, `README.md` | Owen |
| 2026-08-06 | Claude Code | Claude Sonnet 5    | Replaced Passport local-strategy auth with BetterAuth (Google OAuth): new Prisma User/Session/Account/Verification schema, BetterAuth handler mounted ahead of Nest's router in main.ts, SessionAuthGuard rewritten against BetterAuth sessions; step 2 of the stack migration | `apps/api/**`, `README.md` | Owen |
