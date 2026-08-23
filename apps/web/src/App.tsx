import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { PlayersListPage } from "./pages/PlayersListPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { TeamsListPage } from "./pages/TeamsListPage";
import { TeamProfilePage } from "./pages/TeamProfilePage";
import { OptimizerPage } from "./pages/OptimizerPage";
import { PredictionsPage } from "./pages/PredictionsPage";
import { GameDetailPage } from "./pages/GameDetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/players" element={<PlayersListPage />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/teams" element={<TeamsListPage />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          <Route path="/optimizer" element={<OptimizerPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
