import type { PageTutorialDefinition } from "@/lib/pageTutorial";
import { ADMIN_TUTORIAL } from "./adminTutorial";
import { BECOME_PRO_TUTORIAL } from "./becomeProTutorial";
import { COMPARE_TUTORIAL } from "./compareTutorial";
import { DATASETS_TUTORIAL } from "./datasetsTutorial";
import { GAME_DETAIL_TUTORIAL } from "./gameDetailTutorial";
import { HOME_TUTORIAL } from "./homeTutorial";
import { ONBOARDING_TUTORIAL } from "./onboardingTutorial";
import { OPTIMIZER_TUTORIAL } from "./optimizerTutorial";
import { PLAYER_PROFILE_TUTORIAL } from "./playerProfileTutorial";
import { PLAYERS_TUTORIAL } from "./playersTutorial";
import { PREDICTIONS_TUTORIAL } from "./predictionsTutorial";
import { PROFILE_TUTORIAL } from "./profileTutorial";
import { TEAM_PROFILE_TUTORIAL } from "./teamProfileTutorial";
import { TEAMS_TUTORIAL } from "./teamsTutorial";

/**
 * Every page tutorial in the app — one per page except the landing page,
 * which is the pitch rather than a tool and explains itself. Pages import
 * their own definition directly; this list exists so pageTutorials.spec.ts
 * can hold every one of them to the same rules, and so a new tutorial can't
 * ship unchecked — add it here when you add it to a page.
 */
export const ALL_PAGE_TUTORIALS: PageTutorialDefinition[] = [
  HOME_TUTORIAL,
  PLAYERS_TUTORIAL,
  PLAYER_PROFILE_TUTORIAL,
  COMPARE_TUTORIAL,
  TEAMS_TUTORIAL,
  TEAM_PROFILE_TUTORIAL,
  DATASETS_TUTORIAL,
  OPTIMIZER_TUTORIAL,
  PREDICTIONS_TUTORIAL,
  GAME_DETAIL_TUTORIAL,
  BECOME_PRO_TUTORIAL,
  PROFILE_TUTORIAL,
  ONBOARDING_TUTORIAL,
  ADMIN_TUTORIAL,
];
