import { NavLink } from "react-router-dom";
import { AuthStatus } from "./AuthStatus";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/players", label: "Players" },
  { to: "/teams", label: "Teams" },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised px-4 py-6">
      <div className="mb-8 px-2 text-lg font-semibold text-text-primary">
        NBA Analytics
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-accent/15 text-brand-accent"
                  : "text-text-secondary hover:bg-surface-card hover:text-text-primary"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-6">
        <AuthStatus />
      </div>
    </aside>
  );
}
