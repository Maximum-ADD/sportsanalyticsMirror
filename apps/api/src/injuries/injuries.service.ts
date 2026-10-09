import { Inject, Injectable, Logger } from "@nestjs/common";
import { ResponseCacheService, buildCacheKey } from "../cache/response-cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseEspnInjuryReport, type EspnInjury, type InjurySeverity } from "./espn-injury-parser.js";
import { INJURY_FEED_SOURCE, type InjuryFeedSource } from "./injury-feed-sources.js";
import { buildPlayerNameIndex, findPlayerId, findTeamByEspnName } from "./injury-matching.js";

// The injury report: ESPN's league-wide list, matched to this app's teams and
// players. Nothing is stored. The whole matched report is built at most once
// per REPORT_TTL_IN_MILLISECONDS and every read is cut from it, so ESPN sees
// about one request per half hour however many pages ask.

export const INJURY_REPORT_CACHE = Symbol("INJURY_REPORT_CACHE");

const MILLISECONDS_PER_MINUTE = 60_000;
// ESPN updates entries a few times a day, so half an hour behind is as fresh
// as the page needs to be.
const REPORT_TTL_IN_MILLISECONDS = 30 * MILLISECONDS_PER_MINUTE;
const REPORT_CACHE_KEY = buildCacheKey("injuries:report");

// Out before day-to-day before anything else, within a team.
const SEVERITY_ORDER: Record<InjurySeverity, number> = { OUT: 0, DAY_TO_DAY: 1, OTHER: 2 };

/** One injured player, as the pages show them. */
export interface PlayerInjury extends Omit<EspnInjury, "espnTeamName"> {
  /** This app's Player.id when the player is matched, so the page can link them; null otherwise. */
  playerId: string | null;
}

export interface InjuryReportTeam {
  id: string;
  city: string;
  name: string;
  abbreviation: string;
}

export interface TeamInjuries {
  team: InjuryReportTeam;
  injuries: PlayerInjury[];
}

export interface InjuryReport {
  /** When this report was read from ESPN, UTC ISO 8601. */
  fetchedAt: string;
  /** Only teams with at least one injury, by city. */
  teams: TeamInjuries[];
}

export interface TeamInjuryReport {
  fetchedAt: string;
  injuries: PlayerInjury[];
}

export interface PlayerInjuryReport {
  fetchedAt: string;
  /** Null when the player isn't on the report. */
  injury: PlayerInjury | null;
}

@Injectable()
export class InjuriesService {
  private readonly logger = new Logger(InjuriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INJURY_FEED_SOURCE) private readonly feed: InjuryFeedSource,
    @Inject(INJURY_REPORT_CACHE) private readonly cache: ResponseCacheService,
  ) {}

  /**
   * Reads the league-wide injury report, matched to this app's teams and players.
   *
   * @throws InjuryFeedUnavailableError when ESPN can't be read or has changed format.
   */
  getLeagueReport(): Promise<InjuryReport> {
    return this.cache.getOrLoad(REPORT_CACHE_KEY, REPORT_TTL_IN_MILLISECONDS, () => this.buildLeagueReport());
  }

  /**
   * Reads one team's injuries.
   *
   * @returns the team's injuries (an empty list when none), or null when no team has this id.
   * @throws InjuryFeedUnavailableError as getLeagueReport does.
   */
  async getTeamInjuries(teamId: string): Promise<TeamInjuryReport | null> {
    const report = await this.getLeagueReport();
    const teamInjuries = report.teams.find((entry) => entry.team.id === teamId);
    if (teamInjuries) return { fetchedAt: report.fetchedAt, injuries: teamInjuries.injuries };

    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    return team ? { fetchedAt: report.fetchedAt, injuries: [] } : null;
  }

  /**
   * Reads one player's injury, if they are on the report.
   *
   * @throws InjuryFeedUnavailableError as getLeagueReport does.
   */
  async getPlayerInjury(playerId: string): Promise<PlayerInjuryReport> {
    const report = await this.getLeagueReport();
    const injury = report.teams.flatMap((entry) => entry.injuries).find((entry) => entry.playerId === playerId) ?? null;
    return { fetchedAt: report.fetchedAt, injury };
  }

  private async buildLeagueReport(): Promise<InjuryReport> {
    const espnInjuries = parseEspnInjuryReport(await this.feed.readReport());
    const [teams, players] = await Promise.all([
      this.prisma.team.findMany({ select: { id: true, city: true, name: true, abbreviation: true } }),
      this.prisma.player.findMany({ select: { id: true, firstName: true, lastName: true, teamId: true } }),
    ]);
    const playerNameIndex = buildPlayerNameIndex(players);

    const injuriesByTeamId = new Map<string, TeamInjuries>();
    for (const { espnTeamName, ...injury } of espnInjuries) {
      const team = findTeamByEspnName(espnTeamName, teams);
      if (!team) {
        // Every NBA nickname is unique, so this means a team this app
        // doesn't hold (or ESPN renamed one). Worth knowing, not worth failing over.
        this.logger.warn(`No team matches ESPN's "${espnTeamName}"; skipping its injuries`);
        continue;
      }
      const entry = injuriesByTeamId.get(team.id) ?? { team, injuries: [] };
      entry.injuries.push({ ...injury, playerId: findPlayerId(injury.playerName, team.id, playerNameIndex) });
      injuriesByTeamId.set(team.id, entry);
    }

    const sortedTeams = [...injuriesByTeamId.values()]
      .map((entry) => ({ ...entry, injuries: entry.injuries.sort(compareInjuries) }))
      .sort((a, b) => `${a.team.city} ${a.team.name}`.localeCompare(`${b.team.city} ${b.team.name}`));
    return { fetchedAt: new Date().toISOString(), teams: sortedTeams };
  }
}

/** Orders a team's injuries: out first, then day-to-day, then by name. */
function compareInjuries(a: PlayerInjury, b: PlayerInjury): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.playerName.localeCompare(b.playerName);
}
