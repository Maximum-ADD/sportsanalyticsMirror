import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { PlayersListPage } from "./pages/PlayersListPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { ComparePage } from "./pages/ComparePage";
import { TeamsListPage } from "./pages/TeamsListPage";
import { TeamProfilePage } from "./pages/TeamProfilePage";
import { OptimizerPage } from "./pages/OptimizerPage";
import { PredictionsPage } from "./pages/PredictionsPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProfileGate } from "./components/ProfileGate";

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
          <Route
            path="/home"
            element={<ProtectedRoute><ProfileGate><HomePage /></ProfileGate></ProtectedRoute>}
          />
          <Route path="/players" element={<PlayersListPage />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/teams" element={<TeamsListPage />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
