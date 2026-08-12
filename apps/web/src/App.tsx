import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { PlayersListPage } from "./pages/PlayersListPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { TeamsListPage } from "./pages/TeamsListPage";
import { TeamProfilePage } from "./pages/TeamProfilePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public marketing page: brings its own TopNav, no dashboard sidebar. */}
        <Route path="/" element={<LandingPage />} />

        {/* Everything behind the landing page shares the sidebar shell. */}
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/players" element={<PlayersListPage />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/teams" element={<TeamsListPage />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
