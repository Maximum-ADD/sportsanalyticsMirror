import { NavLink } from "react-router-dom";
import { House, Shield, Users } from "lucide-react";
import { AuthStatus } from "./AuthStatus";
import { BasketballIcon } from "./BasketballIcon";

// "/" is the public landing page; the dashboard home lives at /home.
const NAV_LINKS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/players", label: "Players", icon: Users },
  { to: "/teams", label: "Teams", icon: Shield },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold text-text-primary">
        <BasketballIcon className="size-6 shrink-0" />
        NBA Analytics
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_LINKS.map((link) => (
          // No `end` prop: it existed only because NavLink to="/" matched every
          // path. /home needs no such guard.
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-accent/15 text-brand-accent"
                  : "text-text-secondary hover:bg-surface-card hover:text-text-primary"
              }`
            }
          >
            <link.icon className="size-4 shrink-0" />
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
