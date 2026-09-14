import { execSync } from "node:child_process";

// Applies every migration to the test database once before the whole suite
// runs, the same way CI/production would via `prisma migrate deploy` (as
// opposed to `migrate dev`, which can prompt or create shadow databases).
//
// Retries a few times: on the shared CI runner, this can fire while the
// disposable Postgres container is still finishing its healthcheck, or hit
// transient connection refusal from `network: host` contention with another
// group's job on the same runner (see the runner notes in
// .gitea/workflows/ci.yml) -- both clear up on their own within a few
// seconds, and a real, non-transient migration failure still fails loudly
// after the retries are exhausted.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.test.example to apps/api/.env.test and point it at a disposable Postgres database before running tests."
    );
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      console.warn(`prisma migrate deploy failed (attempt ${attempt}/${MAX_ATTEMPTS}) -- retrying in ${RETRY_DELAY_MS}ms`);
      sleepSync(RETRY_DELAY_MS);
    }
  }
}
