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
// STATED TARGET (documented here, not just implied by a green exit code):
// p95 < 300ms and p99 < 800ms for every endpoint below, against a
// database at the brief's stated scale. This is this project's own
// target, not an external standard — chosen as "comfortably interactive
// for a human clicking through the site," with headroom for Render's free
// tier and Supabase's pooled connection under concurrent load. Revisit if
// real usage shows it's the wrong number.
//
// This script was written but could not be run against a real, at-scale
// database in the environment that authored it (no local Postgres). Treat
// its first real run, not this file's existence, as the actual evidence —
// see PROJECT_OVERVIEW.md's Performance section.

import autocannon from "autocannon";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const API_KEY = process.env.API_KEY;
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION ?? 10);
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 10);

const TARGET_P95_MS = 300;
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
  console.log(`Target: p95 < ${TARGET_P95_MS}ms, p99 < ${TARGET_P99_MS}ms.\n`);

  let anyFailed = false;
  for (const [name, path] of endpoints) {
    const { result } = await runOne(name, path);
    const p95 = result.latency.p97_5; // autocannon's nearest percentile bucket to p95
    const p99 = result.latency.p99;
    const failed = p95 > TARGET_P95_MS || p99 > TARGET_P99_MS;
    anyFailed = anyFailed || failed;
    console.log(
      `${failed ? "FAIL" : "OK  "} ${name.padEnd(28)} p50=${result.latency.p50}ms p95=${p95}ms p99=${p99}ms ` +
        `(${result.requests.average.toFixed(1)} req/s, ${result.errors} errors)`
    );
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
