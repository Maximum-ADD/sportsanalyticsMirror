import { lazy, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { PrivacyPage } from "./pages/PrivacyPage";
import { LandingPage } from "./pages/LandingPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProfileGate } from "./components/ProfileGate";
import { AdminGate } from "./components/AdminGate";

/**
 * Wraps a page in React.lazy, so its code is downloaded the first time its
 * route renders instead of with the first page a visitor opens.
 *
 * Every page here is a named export, and React.lazy expects a default one,
 * so this picks the named component off the loaded module.
 *
 * @param loadPageModule - the dynamic import() of the page's module.
 * @param pageName - the page component's export name in that module.
 */
function lazyPage<PageModule, PageName extends keyof PageModule>(
  loadPageModule: () => Promise<PageModule>,
  pageName: PageName
) {
  return lazy(async () => ({ default: (await loadPageModule())[pageName] as ComponentType }));
}

// The landing page stays in the main bundle: it is the first page most
// visitors see, so splitting it out would only add a second request before
// anything paints. Every other page is its own chunk; AppLayout's Suspense
// boundary shows a spinner inside the shell while one loads.
const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const PlayersListPage = lazyPage(() => import("./pages/PlayersListPage"), "PlayersListPage");
const PlayerProfilePage = lazyPage(() => import("./pages/PlayerProfilePage"), "PlayerProfilePage");
const ComparePage = lazyPage(() => import("./pages/ComparePage"), "ComparePage");
const TeamsListPage = lazyPage(() => import("./pages/TeamsListPage"), "TeamsListPage");
const TeamProfilePage = lazyPage(() => import("./pages/TeamProfilePage"), "TeamProfilePage");
const OptimizerPage = lazyPage(() => import("./pages/OptimizerPage"), "OptimizerPage");
const PredictionsPage = lazyPage(() => import("./pages/PredictionsPage"), "PredictionsPage");
const GameDetailPage = lazyPage(() => import("./pages/GameDetailPage"), "GameDetailPage");
const OnboardingPage = lazyPage(() => import("./pages/OnboardingPage"), "OnboardingPage");
const ProfilePage = lazyPage(() => import("./pages/ProfilePage"), "ProfilePage");
const AdminPage = lazyPage(() => import("./pages/AdminPage"), "AdminPage");
const DatasetsPage = lazyPage(() => import("./pages/DatasetsPage"), "DatasetsPage");
const BecomeProPage = lazyPage(() => import("./pages/BecomeProPage"), "BecomeProPage");
const LiveGamesPage = lazyPage(() => import("./pages/LiveGamesPage"), "LiveGamesPage");
const LiveGamePage = lazyPage(() => import("./pages/LiveGamePage"), "LiveGamePage");
const AllTimeLeadersPage = lazyPage(() => import("./pages/AllTimeLeadersPage"), "AllTimeLeadersPage");

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          {/* Deliberately NOT wrapped in ProfileGate — a user in the middle
              of onboarding (username already null) must be able to reach
              this route without being bounced right back into it. */}
          <Route
            path="/onboarding"
            element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>}
          />
          <Route
            path="/profile"
            element={<ProtectedRoute><ProfileGate><ProfilePage /></ProfileGate></ProtectedRoute>}
          />
          {/* API key management moved into Profile — kept as a redirect so
              existing links and bookmarks still land somewhere useful. */}
          <Route path="/api-keys" element={<Navigate to="/profile" replace />} />
          <Route
            path="/home"
            element={<ProtectedRoute><ProfileGate><HomePage /></ProfileGate></ProtectedRoute>}
          />
          <Route path="/players" element={<PlayersListPage />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/teams" element={<TeamsListPage />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          {/* Public like Players: NBA-provided career totals that need no account. */}
          <Route path="/all-time" element={<AllTimeLeadersPage />} />
          {/* Public like Players and Teams: NBA-provided data that needs no
              account, and the API serves it without a session or key. */}
          <Route path="/live" element={<LiveGamesPage />} />
          <Route path="/live/:gameId" element={<LiveGamePage />} />
          {/* Public, so it can be read before signing in (POPIA s18). */}
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* The user's own Become Pro page. Private to them — there is no
              public Become Pro route, because the feature compares a user
              with real NBA players and never with each other. */}
          <Route
            path="/become-pro"
            element={<ProtectedRoute><ProfileGate><BecomeProPage /></ProfileGate></ProtectedRoute>}
          />
          <Route
            path="/optimizer"
            element={<ProtectedRoute><ProfileGate><OptimizerPage /></ProfileGate></ProtectedRoute>}
          />
          <Route
            path="/predictions"
            element={<ProtectedRoute><ProfileGate><PredictionsPage /></ProfileGate></ProtectedRoute>}
          />
          <Route
            path="/games/:gameId"
            element={<ProtectedRoute><ProfileGate><GameDetailPage /></ProfileGate></ProtectedRoute>}
          />
          <Route
            path="/admin"
            element={<ProtectedRoute><AdminGate><AdminPage /></AdminGate></ProtectedRoute>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
