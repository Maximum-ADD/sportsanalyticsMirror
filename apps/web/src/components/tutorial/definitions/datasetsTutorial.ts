import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The datasets page tutorial: what a dataset release is, then one step per
// part of the page in reading order — the sort controls, the release list,
// each release's download control, the details a release opens into, and
// the pager at the foot — and last, where to find the tutorial again.
//
// The map mirrors DatasetsPage at desktop width, below its title card: one
// full-width column with the sort selects on top, then a stack of release
// rows (text on the left, the Download button on the right), one of them
// opened onto its checksum and field schema, and the pager below. The title
// card is left off the map, since it only names the page, and so is the
// admin "Publish a release" form above the sort controls: only admins ever
// see it. Moving a section on the page means moving its region here too.
//
// Everything a step says has to be true of the page as built. The copy must
// also hold for anyone the page renders for — /datasets sits outside
// ProtectedRoute, though the API answers its list only for a session or an
// API key — so nothing here promises an action without saying who can take
// it, and nothing states a figure the server decides.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const DATASETS_TUTORIAL_ID = "datasets";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; a release row's text takes 36-146 and its Download button 150-184.
const DATASETS_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "sort",
    label: "Sort",
    x: 36,
    y: 18,
    width: 70,
    height: 14,
    sketch: "filters",
    calloutSide: "left",
  },
  {
    id: "releases",
    label: "Releases",
    x: 36,
    y: 36,
    width: 110,
    height: 36,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "download",
    label: "Download",
    x: 150,
    y: 36,
    width: 34,
    height: 36,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "release-details",
    label: "Release details",
    x: 36,
    y: 76,
    width: 148,
    height: 26,
    sketch: "table",
    calloutSide: "left",
  },
  {
    id: "pages",
    label: "Pages",
    x: 36,
    y: 107,
    width: 100,
    height: 12,
    sketch: "tabs",
    calloutSide: "left",
  },
  // Last, so it is drawn over the page's bottom-right corner the way the
  // real button floats over the bottom of the page.
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

const DATASETS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to datasets",
    summary:
      "This page lists our dataset releases: fixed snapshots of a season's player stats that you can download as a CSV file and analyse yourself.",
    points: [
      "This tutorial points out each part of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "sort",
    title: "Sort the list",
    summary: "Choose the order the releases are listed in.",
    points: [
      "Sort by Publish date or by Season. The two differ when an older season is published late.",
      "Newest first or Oldest first flips the order. Changing either takes you back to the first page.",
    ],
  },
  {
    regionId: "releases",
    title: "Releases",
    summary:
      "Each row is one release: a snapshot of one season, with one line per player who played in it and their averages for that season.",
    points: [
      "A row shows the release's version name, its season, a short description, how many players and games it covers, and when it was published.",
      // DatasetReleasesService.downloadRelease: every release downloads — a
      // stored file is served exactly as published even when stale, and a
      // release published before files were stored is rebuilt from current
      // data. The checksum sent with the file is what tells whether it
      // matches what was published.
      "Stale means a data correction landed after the release was made, so it no longer matches our current figures. It still downloads, and the check after downloading says whether the file matches the release's published checksum. Use a newer release of that season for the corrected numbers.",
    ],
  },
  {
    regionId: "download",
    title: "Download a release",
    summary: "Download saves the release as a CSV file — a spreadsheet-friendly text file — to your computer.",
    points: [
      // The download endpoint takes a session or an API key (ApiKeyGuard);
      // from this page that means a session.
      "You need to be signed in to download.",
      "After a download, the page checks the file against the release's published checksum and tells you whether it matches.",
      "A checksum is a fingerprint of the file's exact contents. A match means you have exactly what was published, so earlier analysis can be repeated.",
    ],
  },
  {
    regionId: "release-details",
    title: "Release details",
    summary: "Click a release, or the arrow at the end of its row, to open its details. Click again to close them.",
    points: [
      "The checksum is shown in full (SHA-256, the method used to make it), so you can check a file yourself.",
      "The field schema lists every column in the CSV, with its type and what it means.",
    ],
  },
  {
    regionId: "pages",
    title: "Pages",
    summary: "The list is split into pages. This bar says which releases you're looking at.",
    points: ["Use Prev, Next or a page number to move through the rest."],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const DATASETS_TUTORIAL: PageTutorialDefinition = {
  id: DATASETS_TUTORIAL_ID,
  pageName: "datasets",
  regions: DATASETS_TUTORIAL_REGIONS,
  steps: DATASETS_TUTORIAL_STEPS,
};
