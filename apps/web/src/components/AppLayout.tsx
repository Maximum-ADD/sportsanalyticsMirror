import { Outlet } from "react-router-dom";
import { LandingHeader } from "./landing/LandingHeader";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-base">
      <LandingHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
