import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { ApiKeyGuard } from "../common/api-key.guard.js";
import { OptionalSessionGuard } from "../common/optional-session.guard.js";
import { ApiKeyOrSessionAccess } from "../common/openapi/api-docs.decorators.js";
import {
  ArchetypesService,
  type ArchetypeSummary,
  type StyleMapResponse,
} from "./archetypes.service.js";

// Archetypes are a league-wide concept rather than a property of one
// player, so they get their own route rather than hanging off
// /v1/players/:id — the map and the archetype list are both about the
// whole season's fit.
@ApiTags("archetypes")
@UseGuards(OptionalSessionGuard, ApiKeyGuard)
@ApiKeyOrSessionAccess()
@Controller("v1/archetypes")
export class ArchetypesController {
  constructor(private readonly archetypesService: ArchetypesService) {}

  // GET /v1/archetypes?season=2025-26 — the season's archetypes with their
  // member counts, for a browse page and for a chart legend.
  @Get()
  @ApiOperation({ summary: "Archetypes for a season, with member counts" })
  @ApiQuery({ name: "season", required: false, description: "Season to read. Defaults to the most recently fitted." })
  @ApiResponse({ status: 200, description: "Archetypes, largest first" })
  async listArchetypes(
    @Query("season") rawSeason: unknown
  ): Promise<{ season: string | null; archetypes: ArchetypeSummary[] }> {
    const season = await this.resolveSeasonOrNull(rawSeason);
    if (!season) return { season: null, archetypes: [] };
    return { season, archetypes: await this.archetypesService.listArchetypes(season) };
  }

  // GET /v1/archetypes/map?season=2025-26 — every placed player's position
  // in the season's style space. Declared before nothing else, but kept
  // below the list route for readability.
  //
  // Unpaginated on purpose: the map exists to show the whole league at
  // once, and the rows are thin enough that a few hundred of them cost
  // less than one page of full player records.
  @Get("map")
  @ApiOperation({ summary: "Every placed player's position on the style map" })
  @ApiQuery({ name: "season", required: false, description: "Season to read. Defaults to the most recently fitted." })
  @ApiResponse({ status: 200, description: "Player coordinates and the archetype legend" })
  @ApiResponse({ status: 404, description: "No season has been fitted" })
  async getStyleMap(@Query("season") rawSeason: unknown): Promise<StyleMapResponse> {
    const season = await this.resolveSeasonOrNull(rawSeason);
    if (!season) {
      // Distinct from an empty map: no season has been fitted at all, which
      // means apps/similarity has never run against this database.
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No season has a fitted archetype model"
      );
    }
    return this.archetypesService.getStyleMap(season);
  }

  private resolveSeasonOrNull(rawSeason: unknown): Promise<string | null> {
    const requested =
      typeof rawSeason === "string" && rawSeason.trim() ? rawSeason.trim() : undefined;
    return this.archetypesService.resolveSeason(requested);
  }
}
