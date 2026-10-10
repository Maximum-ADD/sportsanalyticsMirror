#!/usr/bin/env node
// Load test against the brief's own stated scale requirement: "hundreds of
// fixtures, each with hundreds of events... queries should meet a stated
// response time under that load, achieved through the schema, indexing,
// and storage layout rather than by chance." (COMS3011A Project 3 brief,
// Intermediate tier.)
//
// This does NOT seed synthetic data — it runs against whatever is already
// there. Point it at a database populated by the real apps/ingestion
// pipeline (README.md: ~30 teams, hundreds of games, hundreds of events
// each) for a result that actually means something; running it against
// the small hand-seeded mock dataset (prisma/seed.ts: 4 teams, 12 games)
// will be fast for reasons that have nothing to do with the schema/
// indexing this is meant to exercise.
//
// Usage:
//   BASE_URL=http://localhost:4000 API_KEY=<your key> node scripts/load-test.mjs
//
// API_KEY: a self-service key from the profile page's API Keys section
// (or an admin-issued one) — every endpoint below requires either that or
// a signed-in session (see ApiKeyGuard), and this script has no browser
// session to send.
//
// RATE LIMITS: the key's consumer is rate-limited (default 100 req/min and
// 10,000 req/day — see ApiKeyGuard), and one run sends thousands of
// requests. Raise both on the test consumer first (admin
// PATCH /v1/admin/consumers/:id, or directly on "ApiConsumer"), or every
// endpoint will FAIL on 429s — rejected responses are counted as failures
// below, never as fast passes.
//
// STATED TARGET (documented here, not just implied by a green exit code):
// p97.5 < 300ms and p99 < 800ms for every endpoint below, with no non-2xx
// responses, against a database at the brief's stated scale. (autocannon
// reports p90 and p97.5 but not p95, so p97.5 is used — a stricter bar
// than p95.) This is this project's own target, not an external
// standard — chosen as "comfortably interactive
// for a human clicking through the site," with headroom for Render's free
// tier and Supabase's pooled connection under concurrent load. Revisit if
// real usage shows it's the wrong number.
//
// First real run: 2026-10-09, local Postgres, ~2,300 real ingested events
// across 243 games (short of "hundreds per game" — a from-scratch
// ingestion pull kept hitting stats.nba.com network timeouts). All four
// endpoints passed with 35-90x margin on both targets. See
// docs/PROJECT_OVERVIEW.md's "Load test" section for the full numbers and
// re-run instructions once a complete pull succeeds.

import autocannon from "autocannon";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const API_KEY = process.env.API_KEY;
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION ?? 10);
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 10);

const TARGET_P97_5_MS = 300;
const TARGET_P99_MS = 800;

if (!API_KEY) {
  console.error("API_KEY is required — see this file's header comment for where to get one.");
  process.exit(1);
}

const headers = { "X-API-Key": API_KEY };

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status} — is BASE_URL running and API_KEY valid?`);
  }
  return response.json();
}

// Picks a real game/player id so /:id routes exercise a real row, not a
// guaranteed 404 (which would trivially "pass" any latency target).
async function pickSampleIds() {
  const [games, players] = await Promise.all([
    fetchJson("/v1/games?pageSize=1&status=completed"),
    fetchJson("/v1/players?pageSize=1"),
  ]);
  const gameId = games.data[0]?.id;
  const playerId = players.data[0]?.id;
  if (!gameId || !playerId) {
    throw new Error(
      "No games/players found to sample from — this database has no data to load-test against yet. " +
        "Run apps/ingestion's real pipeline first (see README.md)."
    );
  }
  return { gameId, playerId };
}

function runOne(name, path) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: `${BASE_URL}${path}`,
        headers,
        duration: DURATION_SECONDS,
        connections: CONNECTIONS,
      },
      (error, result) => (error ? reject(error) : resolve({ name, path, result }))
    );
  });
}

async function main() {
  const { gameId, playerId } = await pickSampleIds();

  // The hot read paths PROJECT_OVERVIEW.md's schema section reasons the
  // indexing around: a game's full play-by-play, a player's derived
  // season line, and the two paginated list endpoints every other page
  // starts from.
  const endpoints = [
    ["GET /v1/games", "/v1/games?pageSize=25"],
    ["GET /v1/games/:id/events", `/v1/games/${gameId}/events?pageSize=100`],
    ["GET /v1/players", "/v1/players?pageSize=25"],
    ["GET /v1/players/:id/stats", `/v1/players/${playerId}/stats`],
  ];

  console.log(`Load-testing ${BASE_URL} — ${CONNECTIONS} connections, ${DURATION_SECONDS}s per endpoint.`);
  console.log(`Target: p97.5 < ${TARGET_P97_5_MS}ms, p99 < ${TARGET_P99_MS}ms, no non-2xx responses.\n`);

  let anyFailed = false;
  for (const [name, path] of endpoints) {
    const { result } = await runOne(name, path);
    const p97_5 = result.latency.p97_5;
    const p99 = result.latency.p99;
    // A 429 or 401 comes back fast and still lands in the latency
    // histogram, so any rejected request makes the timing meaningless.
    const rejected = result.non2xx + result.errors + result.timeouts;
    const failed = rejected > 0 || p97_5 > TARGET_P97_5_MS || p99 > TARGET_P99_MS;
    anyFailed = anyFailed || failed;
    console.log(
      `${failed ? "FAIL" : "OK  "} ${name.padEnd(28)} p50=${result.latency.p50}ms p97.5=${p97_5}ms p99=${p99}ms ` +
        `(${result.requests.average.toFixed(1)} req/s, ${result.non2xx} non-2xx, ${result.errors} errors, ` +
        `${result.timeouts} timeouts)`
    );
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
