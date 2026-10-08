import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The onboarding tutorial: what set-up is for, where the card says which step
// you're on, then one step per set-up step in the order you meet them —
// username, team, players — and last, where to find the tutorial again.
//
// The map mirrors OnboardingPage at desktop width: one narrow centred card
// (max-w-2xl) with the step's heading on top and the step itself under it.
// The page shows one set-up step at a time in that same space, so the three
// set-up steps all point at the one "This step" region rather than at three
// regions the page never shows side by side.
//
// The tutorial opens by itself on the first step, before anything is saved,
// so it explains the whole flow up front. It must never stand in the way of
// finishing it: nothing here asks the reader to do anything before carrying
// on, and every step says plainly what each button does. Everything a step
// says has to be true of the flow as built — no promised feature, and no
// figure the server decides.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const ONBOARDING_TUTORIAL_ID = "onboarding";

// Map units — see lib/pageTutorial.ts. The page's centred card takes x 64-156
// of the frame's 36-184 content area.
const ONBOARDING_CARD_X = 66;
const ONBOARDING_CARD_WIDTH = 88;

const ONBOARDING_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "step-heading",
    label: "Step heading",
    x: ONBOARDING_CARD_X,
    y: 20,
    width: ONBOARDING_CARD_WIDTH,
    height: 22,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "this-step",
    label: "This step",
    x: ONBOARDING_CARD_X,
    y: 46,
    width: ONBOARDING_CARD_WIDTH,
    height: 44,
    sketch: "form",
    calloutSide: "left",
  },
  // Last, so it is drawn over the page the way the real button floats over
  // the bottom of the screen.
  {
    id: "help-button",
    label: "Tutorial button",
    x: 177,
    y: 111,
    width: 9,
    height: 9,
    sketch: "help-button",
    calloutSide: "right",
  },
];

const ONBOARDING_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome — let's set you up",
    summary:
      "Three quick steps get your account ready: choose a username, pick your team, and follow a few players if you like. Then you're taken to your home page.",
    points: [
      "This tutorial walks through each step before you start. Close it whenever you're ready — your set-up is waiting underneath.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "step-heading",
    title: "Where you are",
    summary: "The top of the card says which step you're on, out of three, and what that step asks for.",
    points: ["Continue saves what you've chosen and moves you on to the next step."],
  },
  {
    regionId: "this-step",
    title: "Choose a username",
    summary: "Step 1. Your username is how you'll show up around the app.",
    points: [
      // The format rule is the UI's own hint text, not restated here, so the
      // two can't drift apart.
      "Type a name and click Continue. If it doesn't fit the rules, or someone already has it, a note under the box says so.",
      "You can change it later from your profile.",
    ],
  },
  {
    regionId: "this-step",
    title: "Pick your team",
    summary: "Step 2. Click the one NBA team you support, then Continue.",
    points: [
      // YourTeamsList on /home reads the favorite team saved here.
      "Your team's recent results appear on your home page.",
      "You can change your team later from your profile.",
    ],
  },
  {
    regionId: "this-step",
    title: "Follow a few players",
    summary: "Step 3, and optional. These are players from the team you just picked.",
    points: [
      "They're ranked by usage rate: the share of the team's plays a player finishes — with a shot, free throws or a turnover — while they're on the court.",
      "Click a player to follow them, and again to unfollow. The players you follow appear on your home page's watchlist.",
      "Finish takes you to your home page. If you haven't followed anyone, the button reads Skip instead.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole set-up. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const ONBOARDING_TUTORIAL: PageTutorialDefinition = {
  id: ONBOARDING_TUTORIAL_ID,
  pageName: "onboarding",
  regions: ONBOARDING_TUTORIAL_REGIONS,
  steps: ONBOARDING_TUTORIAL_STEPS,
};
