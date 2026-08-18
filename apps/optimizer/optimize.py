"""Picks the highest-predicted-points 5-player lineup under a salary cap.

A real MILP, not a sorted list: maximizing points subject to a budget
constraint *and* a position-coverage constraint (at least one guard, at
least one forward) means the optimal lineup isn't just "the 5 cheapest
high scorers" — a naive greedy pick can satisfy the budget but miss a
required position, or satisfy positions but blow the budget. PuLP + CBC
(the solver PuLP ships with) is free and more than enough for a
problem this size; no Gurobi license needed.

Reads the most recent PlayerPrediction row per player (written by
predict.py) and writes one Lineup + its LineupSlots.
"""

import uuid

import pulp

from db import get_connection

LINEUP_SIZE = 5
SALARY_CAP_IN_DOLLARS = 50_000
MINIMUM_GUARDS = 1
MINIMUM_FORWARDS = 1


def fetch_latest_predictions(cursor) -> list[dict]:
    """Reads each player's most recent PlayerPrediction row (by asOf)."""
    cursor.execute(
        """
        SELECT DISTINCT ON (pp."playerId")
               pp."playerId" AS player_id, pp."predictedFantasyPoints" AS points,
               pp.salary, p.position
        FROM "PlayerPrediction" pp
        JOIN "Player" p ON p."id" = pp."playerId"
        ORDER BY pp."playerId", pp."asOf" DESC
        """
    )
    return cursor.fetchall()


def solve_lineup(players: list[dict]) -> list[dict]:
    """Solves for the LINEUP_SIZE-player subset maximizing predicted points.

    players must each have player_id/points/salary/position keys (the shape
    fetch_latest_predictions returns). Raises RuntimeError if no lineup
    satisfies the salary cap and position-coverage constraints together.
    """
    problem = pulp.LpProblem("lineup_optimizer", pulp.LpMaximize)
    pick = {p["player_id"]: pulp.LpVariable(f"pick_{p['player_id']}", cat="Binary") for p in players}

    problem += pulp.lpSum(pick[p["player_id"]] * p["points"] for p in players)

    problem += pulp.lpSum(pick.values()) == LINEUP_SIZE
    problem += pulp.lpSum(pick[p["player_id"]] * p["salary"] for p in players) <= SALARY_CAP_IN_DOLLARS
    problem += pulp.lpSum(pick[p["player_id"]] for p in players if "G" in p["position"]) >= MINIMUM_GUARDS
    problem += pulp.lpSum(pick[p["player_id"]] for p in players if "F" in p["position"]) >= MINIMUM_FORWARDS

    status = problem.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[status] != "Optimal":
        raise RuntimeError(
            f"No feasible lineup found (status: {pulp.LpStatus[status]}) — "
            "not enough players, or the salary cap/position constraints can't be met."
        )

    return [p for p in players if pick[p["player_id"]].value() == 1]


def save_lineup(cursor, total_points: float, total_salary: int, chosen_players: list[dict]) -> str:
    """Writes the Lineup row and one LineupSlot per chosen player. Returns the new lineup's id."""
    lineup_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO "Lineup" ("id", "totalPredictedPoints", "totalSalary", "budget")
        VALUES (%s, %s, %s, %s)
        """,
        (lineup_id, total_points, total_salary, SALARY_CAP_IN_DOLLARS),
    )
    for player in chosen_players:
        cursor.execute(
            """
            INSERT INTO "LineupSlot" ("id", "lineupId", "playerId")
            VALUES (%s, %s, %s)
            """,
            (str(uuid.uuid4()), lineup_id, player["player_id"]),
        )
    return lineup_id


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            players = fetch_latest_predictions(cursor)
            if len(players) < LINEUP_SIZE:
                raise RuntimeError(
                    f"Only {len(players)} players have predictions — need at least "
                    f"{LINEUP_SIZE}. Run predict.py first."
                )

            chosen = solve_lineup(players)
            total_points = round(sum(p["points"] for p in chosen), 2)
            total_salary = sum(p["salary"] for p in chosen)

            lineup_id = save_lineup(cursor, total_points, total_salary, chosen)

        connection.commit()
        print(f"Lineup {lineup_id}: {total_points} predicted points, ${total_salary} of ${SALARY_CAP_IN_DOLLARS}.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
