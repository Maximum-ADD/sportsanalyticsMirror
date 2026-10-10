import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { FixtureInjuryFeedSource, type InjuryFeedSource } from "./injury-feed-sources.js";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";
import { InjuriesService } from "./injuries.service.js";

// Three teams from ESPN's real report: Hawks (Gilbert, Dort, both day-to-day),
// Clippers (Sanders, Beal, both day-to-day) and Trail Blazers (Sharpe, out).
const FIXTURE_PATH = fileURLToPath(new URL("./fixtures/espn-injuries.json", import.meta.url));

const TEAMS = [
  { id: "team-blazers", city: "Portland", name: "Trail Blazers", abbreviation: "POR" },
  { id: "team-hawks", city: "Atlanta", name: "Hawks", abbreviation: "ATL" },
  { id: "team-clippers", city: "Los Angeles", name: "Clippers", abbreviation: "LAC" },
];

// Gilbert and Sanders are deliberately missing: players this app doesn't hold.
const PLAYERS = [
  { id: "player-dort", firstName: "Luguentz", lastName: "Dort", teamId: "team-hawks" },
  { id: "player-beal", firstName: "Bradley", lastName: "Beal", teamId: "team-clippers" },
  { id: "player-sharpe", firstName: "Shaedon", lastName: "Sharpe", teamId: "team-blazers" },
];

describe("InjuriesService", () => {
  let findTeams: ReturnType<typeof vi.fn>;
  let findTeam: ReturnType<typeof vi.fn>;
  let findPlayers: ReturnType<typeof vi.fn>;

  function createService(feed: InjuryFeedSource = new FixtureInjuryFeedSource(FIXTURE_PATH), cacheEnabled = false) {
    const prisma = {
      team: { findMany: findTeams, findUnique: findTeam },
      player: { findMany: findPlayers },
    } as never;
    return new InjuriesService(prisma, feed, new ResponseCacheService({ enabled: cacheEnabled }));
  }

  beforeEach(() => {
    findTeams = vi.fn().mockResolvedValue(TEAMS);
    findTeam = vi.fn().mockResolvedValue(null);
    findPlayers = vi.fn().mockResolvedValue(PLAYERS);
  });

  it("groups injuries by this app's teams, ordered by city", async () => {
    const report = await createService().getLeagueReport();

    expect(report.teams.map((entry) => entry.team.abbreviation)).toEqual(["ATL", "LAC", "POR"]);
    expect(report.fetchedAt).toEqual(expect.any(String));
  });

  it("links the players this app holds and leaves the rest unlinked", async () => {
    const report = await createService().getLeagueReport();
    const hawks = report.teams.find((entry) => entry.team.id === "team-hawks");

    expect(hawks?.injuries.map((injury) => [injury.playerName, injury.playerId])).toEqual([
      ["Keshon Gilbert", null],
      ["Luguentz Dort", "player-dort"],
    ]);
    expect(hawks?.injuries[0]).not.toHaveProperty("espnTeamName");
  });

  it("lists a team's out players before its day-to-day ones", async () => {
    const feed = {
      readReport: vi.fn().mockResolvedValue({
        injuries: [
          {
            displayName: "Atlanta Hawks",
            injuries: [
              { status: "Day-To-Day", type: { name: "INJURY_STATUS_DAYTODAY" }, athlete: { displayName: "Aaron Able" } },
              { status: "Out", type: { name: "INJURY_STATUS_OUT" }, athlete: { displayName: "Zed Zane" } },
            ],
          },
        ],
      }),
    };

    const report = await createService(feed).getLeagueReport();

    expect(report.teams[0].injuries.map((injury) => injury.playerName)).toEqual(["Zed Zane", "Aaron Able"]);
  });

  it("skips a team ESPN lists that this app doesn't hold, rather than failing", async () => {
    findTeams.mockResolvedValue(TEAMS.filter((team) => team.id !== "team-clippers"));

    const report = await createService().getLeagueReport();

    expect(report.teams.map((entry) => entry.team.abbreviation)).toEqual(["ATL", "POR"]);
  });

  it("reads one team's injuries, an empty list for a healthy team, and null for an unknown one", async () => {
    const service = createService();

    expect((await service.getTeamInjuries("team-blazers"))?.injuries.map((injury) => injury.playerName)).toEqual([
      "Shaedon Sharpe",
    ]);

    findTeam.mockResolvedValue({ id: "team-celtics" });
    expect((await service.getTeamInjuries("team-celtics"))?.injuries).toEqual([]);

    findTeam.mockResolvedValue(null);
    expect(await service.getTeamInjuries("no-such-team")).toBeNull();
  });

  it("reads one player's injury, or null when they aren't on the report", async () => {
    const service = createService();

    expect((await service.getPlayerInjury("player-sharpe")).injury).toMatchObject({
      severity: "OUT",
      expectedReturn: "2027-03-02",
    });
    expect((await service.getPlayerInjury("player-healthy")).injury).toBeNull();
  });

  it("reads ESPN once however many requests arrive within the cache's lifetime", async () => {
    const feed = new FixtureInjuryFeedSource(FIXTURE_PATH);
    const readReport = vi.spyOn(feed, "readReport");
    const service = createService(feed, true);

    await Promise.all([service.getLeagueReport(), service.getTeamInjuries("team-hawks"), service.getPlayerInjury("player-beal")]);

    expect(readReport).toHaveBeenCalledTimes(1);
  });

  it("passes an ESPN outage through, for the controller to report", async () => {
    const feed = { readReport: vi.fn().mockRejectedValue(new InjuryFeedUnavailableError("down")) };

    await expect(createService(feed).getLeagueReport()).rejects.toBeInstanceOf(InjuryFeedUnavailableError);
  });
});
