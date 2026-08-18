import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
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
      <div className="flex min-h-screen flex-col bg-surface-base">
        <Navbar />
        {/* tabIndex={-1} is what lets the skip link move focus here, not just scroll to it. */}
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/players" element={<PlayersListPage />} />
            <Route path="/players/:playerId" element={<PlayerProfilePage />} />
            <Route path="/teams" element={<TeamsListPage />} />
            <Route path="/teams/:teamId" element={<TeamProfilePage />} />
            <Route path="/optimizer" element={<OptimizerPage />} />
            <Route path="/predictions" element={<PredictionsPage />} />
            <Route path="/games/:gameId" element={<GameDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
