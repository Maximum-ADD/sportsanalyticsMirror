import { CompetitionLevel } from "@prisma/client";
import { z } from "zod";

// One validator for the competition-level enum, built FROM the Prisma enum
// rather than beside it.
//
// Hand-listing the values in a zod schema would create a second definition
// that compiles happily while disagreeing with the database — adding a level
// to schema.prisma would then be accepted by Prisma and rejected by the API
// with a validation error naming values the caller can see are wrong. Reading
// them off the generated enum means there is nothing to keep in sync.
const COMPETITION_LEVEL_VALUES = Object.values(CompetitionLevel) as [CompetitionLevel, ...CompetitionLevel[]];

export const competitionLevelSchema = z.enum(COMPETITION_LEVEL_VALUES);
