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
import { ProtectedRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/players" element={<PlayersListPage />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/teams" element={<TeamsListPage />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          <Route
            path="/optimizer"
            element={<ProtectedRoute><OptimizerPage /></ProtectedRoute>}
          />
          <Route
            path="/predictions"
            element={<ProtectedRoute><PredictionsPage /></ProtectedRoute>}
          />
          <Route
            path="/games/:gameId"
            element={<ProtectedRoute><GameDetailPage /></ProtectedRoute>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
