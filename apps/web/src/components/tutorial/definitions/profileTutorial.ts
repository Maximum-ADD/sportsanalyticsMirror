import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The profile page tutorial: what the page is for, then one step per part of
// it from top to bottom — your details, the players you follow, your saved
// lineups, your Become Pro card, your API keys and the account controls —
// and last, where to find the tutorial again.
//
// The map mirrors ProfilePage at desktop width: one narrow centred column
// (max-w-3xl), its sections stacked under one another. The title card, the
// Avatar, Username and Favorite team sections are one region here — each is
// a single control, too small to draw on its own — and so are the Sign out
// and Delete account buttons under Account. Moving a section on the page
// means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure the server decides (the API keys' request limits,
// the games Become Pro needs before it values a season).

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const PROFILE_TUTORIAL_ID = "profile";

// Map units — see lib/pageTutorial.ts. The page's centred column takes x 56-164
// of the frame's 36-184 content area, and its sections run y 18-119.
const PROFILE_COLUMN_X = 56;
const PROFILE_COLUMN_WIDTH = 108;

const PROFILE_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "your-details",
    label: "Your details",
    x: PROFILE_COLUMN_X,
    y: 18,
    width: PROFILE_COLUMN_WIDTH,
    height: 22,
    sketch: "form",
    calloutSide: "left",
  },
  {
    id: "followed-players",
    label: "Followed players",
    x: PROFILE_COLUMN_X,
    y: 41,
    width: PROFILE_COLUMN_WIDTH,
    height: 14,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "saved-lineups",
    label: "Saved lineups",
    x: PROFILE_COLUMN_X,
    y: 56,
    width: PROFILE_COLUMN_WIDTH,
    height: 16,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "become-pro",
    label: "Become Pro",
    x: PROFILE_COLUMN_X,
    y: 73,
    width: PROFILE_COLUMN_WIDTH,
    height: 12,
    sketch: "value",
    calloutSide: "right",
  },
  {
    id: "api-keys",
    label: "API keys",
    x: PROFILE_COLUMN_X,
    y: 86,
    width: PROFILE_COLUMN_WIDTH,
    height: 20,
    sketch: "table",
    calloutSide: "left",
  },
  {
    id: "account",
    label: "Account",
    x: PROFILE_COLUMN_X,
    y: 107,
    width: PROFILE_COLUMN_WIDTH,
    height: 12,
    sketch: "tabs",
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

const PROFILE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to your profile",
    summary:
      "This is where you manage your account: how you appear, the team and players you follow, what you've saved, and your API keys.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "your-details",
    title: "Your details",
    summary: "Your email address, your avatar, your username and your favorite team.",
    points: [
      "Change avatar uploads a new picture from your computer.",
      "Change username lets you pick a new one. Usernames are unique, so you'll be told if yours is already taken.",
      // YourTeamsList on /home reads the favorite team from this profile.
      "Change team (or Pick a team, if you haven't chosen one) sets the team whose results appear on your home page.",
    ],
  },
  {
    regionId: "followed-players",
    title: "Followed players",
    summary: "Every player you follow — the same players as the watchlist on your home page.",
    points: [
      "The × next to a player unfollows them.",
      "To follow someone new, use the Follow button on the Players list or on that player's own page.",
    ],
  },
  {
    regionId: "saved-lineups",
    title: "Saved lineups",
    summary:
      "The fantasy lineups you've saved from the Optimizer, each with its projected points and salary from the day you saved it.",
    points: [
      "Each lineup lists its players, with what each was projected to score and cost when you saved it.",
      "The line starting \"Since you saved it\" compares that with the latest predictions: points up or down, salary up or down, and whether the lineup is now over the salary cap.",
      "Remove deletes a saved lineup.",
    ],
  },
  {
    regionId: "become-pro",
    title: "Become Pro",
    summary:
      "Your private Become Pro card, the same one as on your home page: what a season you log yourself would be worth on the NBA rookie salary scale.",
    points: [
      "Once you've logged enough games, it shows your projected value and the draft pick your season projects to.",
      "Its button takes you to the Become Pro page, to start a season, log games or see the full breakdown.",
    ],
  },
  {
    regionId: "api-keys",
    title: "API keys",
    summary:
      "An API key lets your own scripts and tools fetch this app's data directly, without signing in. Send it as the X-API-Key request header.",
    points: [
      "Give a key an optional label so you can tell your keys apart, then click Generate Key.",
      "A new key is shown only once, straight after you generate it. Copy it then — it can't be shown again.",
      "The table lists your keys and when each was last used. Revoke switches a key off but keeps it listed; Delete removes it for good.",
      // The rate limit and daily quota are the server's figures, read live
      // from GET /v1/me/api-keys — never stated here.
      "The line above the table shows how many requests your keys have made and the limits on how many they can make.",
    ],
  },
  {
    regionId: "account",
    title: "Your account",
    summary: "Sign out, or delete your account.",
    points: [
      "Sign out signs you out and takes you back to the front page.",
      "Delete account asks you to confirm first. Deleting can't be undone.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const PROFILE_TUTORIAL: PageTutorialDefinition = {
  id: PROFILE_TUTORIAL_ID,
  pageName: "profile",
  regions: PROFILE_TUTORIAL_REGIONS,
  steps: PROFILE_TUTORIAL_STEPS,
};
