"""Fetches one game's real play-by-play from PlayByPlayV3, validates each
action against the platform's event schema (event_validation.py), and
writes accepted rows as GameEvent, tagged with an IngestionBatch record —
the automated pipeline's own "submission" a published stat traces back to.

PlayByPlayV3's response is the newer `{"game": {"gameId", "actions": [...]}}`
envelope, not the legacy `resultSets` shape nba_api's generic
`get_normalized_dict()` understands — confirmed by reading nba_api's own
bundled V3 parser (`_parsers/playbyplayv3.py`), the same situation
BoxScoreTraditionalV3 is in (see games.py's module docstring). Unlike that
endpoint, though, nba_api's dispatch (`NBAStatsHTTP.get_data_sets`, called
with the endpoint name) DOES route V3 play-by-play through a correct,
purpose-built parser — `PlayByPlayV3.play_by_play.get_dict()` already
returns clean `{"headers": [...], "data": [[...], ...]}` arrays in the
confirmed header order, just not yet zipped into per-action dicts, which
fetch_game_actions below does directly.

KNOWN_ACTION_TYPES in event_validation.py is best-effort, not live-verified
— this machine has no network path to stats.nba.com (confirmed: a plain
HTTPS request to it times out here while general internet access works
fine, matching this project's own documented cloud/sandbox-IP-blocking
issue — see apps/ingestion/README.md). Running this against one real game
and checking IngestionBatch.rejectionSummary for unexpected
UNKNOWN_ACTION_TYPE rejections is the actual verification step, not
something this module can self-certify.
"""

from collections import Counter
from datetime import datetime, timezone

from nba_api.stats.endpoints import playbyplayv3
from psycopg2.extras import Json

from event_validation import validate_raw_event
from throttle import call_with_rate_limit

SOURCE = "nba_api:playbyplayv3"


def fetch_game_actions(nba_game_id: str) -> list[dict]:
    """One PlayByPlayV3 call, oldest-first (NBA already orders actions by actionNumber), as plain dicts."""
    response = call_with_rate_limit(lambda: playbyplayv3.PlayByPlayV3(game_id=nba_game_id, timeout=30))
    raw = response.play_by_play.get_dict()
    headers = raw["headers"]
    return [dict(zip(headers, row)) for row in raw["data"]]


def upsert_ingestion_batch(cursor, game_internal_id: str, source: str = SOURCE) -> str:
    """Opens a new RUNNING IngestionBatch row for this game, returns its id.

    Always a new row (never upserted onto a previous run) — see
    IngestionBatch's schema doc comment: a re-ingested game's run history,
    including any past rejections, is never overwritten.
    """
    cursor.execute(
        """
        INSERT INTO "IngestionBatch" ("id", "gameId", "source", "status")
        VALUES (gen_random_uuid(), %s, %s, 'RUNNING')
        RETURNING "id"
        """,
        (game_internal_id, source),
    )
    return cursor.fetchone()["id"]


def complete_ingestion_batch(
    cursor, batch_id: str, status: str, accepted: int, rejected: int, rejection_summary: dict
) -> None:
    cursor.execute(
        """
        UPDATE "IngestionBatch"
        SET "status" = %s, "completedAt" = %s, "eventsAccepted" = %s,
            "eventsRejected" = %s, "rejectionSummary" = %s
        WHERE "id" = %s
        """,
        (status, datetime.now(timezone.utc), accepted, rejected, Json(rejection_summary), batch_id),
    )


def upsert_game_event(
    cursor,
    game_internal_id: str,
    batch_id: str,
    event: dict,
    team_internal_id: str | None,
    player_internal_id: str | None,
) -> None:
    """Upserts one GameEvent row, keyed on (gameId, sequence) — re-running this game's ingestion refreshes the row in place."""
    made = event.get("shotResult") == "Made" if event["actionType"] in ("2pt", "3pt", "freethrow") else None
    cursor.execute(
        """
        INSERT INTO "GameEvent"
            ("id", "gameId", "sequence", "period", "clock", "eventType", "subType",
             "playerId", "teamId", "success", "value", "description", "batchId")
        VALUES (gen_random_uuid(), %(game_id)s, %(sequence)s, %(period)s, %(clock)s, %(event_type)s, %(sub_type)s,
                %(player_id)s, %(team_id)s, %(success)s, %(value)s, %(description)s, %(batch_id)s)
        ON CONFLICT ("gameId", "sequence") DO UPDATE SET
            "period" = EXCLUDED."period",
            "clock" = EXCLUDED."clock",
            "eventType" = EXCLUDED."eventType",
            "subType" = EXCLUDED."subType",
            "playerId" = EXCLUDED."playerId",
            "teamId" = EXCLUDED."teamId",
            "success" = EXCLUDED."success",
            "value" = EXCLUDED."value",
            "description" = EXCLUDED."description",
            "batchId" = EXCLUDED."batchId"
        """,
        {
            "game_id": game_internal_id,
            "sequence": event["actionNumber"],
            "period": event["period"],
            "clock": event["clock"],
            "event_type": event["actionType"],
            "sub_type": event.get("subType"),
            "player_id": player_internal_id,
            "team_id": team_internal_id,
            "success": made,
            "value": event.get("shotValue"),
            "description": event["description"],
            "batch_id": batch_id,
        },
    )


def run_ingestion_batch(
    cursor,
    game_internal_id: str,
    nba_game_id: str,
    team_id_by_nba_id: dict[int, str],
    player_id_by_nba_id: dict[int, str],
    final_status: str = "COMPLETED",
) -> dict:
    """Fetches, validates and writes one game's real play-by-play. Returns a run summary.

    known_player_ids for validation is derived from player_id_by_nba_id's
    own keys — the same already-ingested roster every other part of this
    pipeline uses, not a fresh query.

    final_status controls the batch's terminal status on success — pass
    "PENDING_REVIEW" when the pipeline runs with --review so the admin
    must approve the events before they count as published. Defaults to
    "COMPLETED" for the existing auto-publish behaviour.

    The summary's "accepted_events" carries the raw (NBA-id-keyed) accepted
    action dicts, not the internal-id-resolved rows just written to
    GameEvent — derive_player_game_stats.aggregate_player_game_stats reads
    NBA ids directly (see its own docstring), and re-querying rows just
    written back out of Postgres would be pure overhead for data already
    sitting in memory.
    """
    known_player_ids = set(player_id_by_nba_id.keys())
    batch_id = upsert_ingestion_batch(cursor, game_internal_id)

    accepted_events: list[dict] = []
    rejected = 0
    rejection_counts: Counter[str] = Counter()
    previous_sequence: int | None = None

    try:
        actions = fetch_game_actions(nba_game_id)
    except Exception:
        complete_ingestion_batch(cursor, batch_id, "FAILED", accepted=0, rejected=0, rejection_summary={})
        raise

    for action in actions:
        result = validate_raw_event(action, previous_sequence=previous_sequence, known_player_ids=known_player_ids)
        if not result.accepted:
            rejected += 1
            for reason in result.reasons:
                rejection_counts[reason.code] += 1
            continue

        previous_sequence = action["actionNumber"]
        person_id = action.get("personId")
        player_internal_id = player_id_by_nba_id.get(person_id) if person_id else None
        team_internal_id = team_id_by_nba_id.get(action.get("teamId"))
        upsert_game_event(cursor, game_internal_id, batch_id, action, team_internal_id, player_internal_id)
        accepted_events.append(action)

    complete_ingestion_batch(cursor, batch_id, final_status, len(accepted_events), rejected, dict(rejection_counts))
    return {
        "batch_id": batch_id,
        "accepted": len(accepted_events),
        "rejected": rejected,
        "rejection_counts": dict(rejection_counts),
        "accepted_events": accepted_events,
    }
