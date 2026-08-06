import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { PlayersListPage } from "./pages/PlayersListPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { TeamsListPage } from "./pages/TeamsListPage";
import { TeamProfilePage } from "./pages/TeamProfilePage";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-surface-base">
        <Sidebar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/players" element={<PlayersListPage />} />
            <Route path="/players/:playerId" element={<PlayerProfilePage />} />
            <Route path="/teams" element={<TeamsListPage />} />
            <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
