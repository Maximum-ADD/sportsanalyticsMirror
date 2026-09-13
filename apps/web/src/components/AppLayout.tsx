import { Outlet } from "react-router-dom";
import { LandingHeader } from "./landing/LandingHeader";

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-landing-hero">
      <LandingHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
