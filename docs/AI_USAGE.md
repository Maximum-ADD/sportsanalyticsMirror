# AI Usage Ledger

Every use of AI tooling on this project is logged here, per the COMS3011A
brief's AI attribution requirement (§1.4).

| Date       | Tool        | Model              | Purpose                                                                 | Files affected                                   | Author |
|------------|-------------|--------------------|--------------------------------------------------------------------------|---------------------------------------------------|--------|
| 2026-08-06 | Claude Code | Claude Sonnet 5    | Initial project scaffold: monorepo structure, Express+Prisma API (auth, players/teams/stats endpoints), mock NBA seed data, React+Vite+Tailwind frontend (player list + profile pages), Docker Compose for local Postgres, root README | `apps/api/**`, `apps/web/**`, `docker-compose.yml`, `README.md`, `.gitignore` | Josh |
| 2026-08-06 | Claude Code | Claude Sonnet 5    | Migrated the API backend from Express to NestJS (modules/controllers/guards/global exception filter), preserving existing auth, players, and teams behaviour exactly; step 1 of moving the stack to the agreed tech choices | `apps/api/**`, `README.md` | Owen |
