import { execSync } from "node:child_process";

// Applies every migration to the test database once before the whole suite
// runs, the same way CI/production would via `prisma migrate deploy` (as
// opposed to `migrate dev`, which can prompt or create shadow databases).
export function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.test.example to apps/api/.env.test and point it at a disposable Postgres database before running tests."
    );
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
