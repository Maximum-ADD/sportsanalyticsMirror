import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

// The dashboard shell, lifted out of App.tsx so the landing page at "/" can
// render without it.
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <Sidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
