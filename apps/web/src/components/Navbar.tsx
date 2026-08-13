import { Link, NavLink } from "react-router-dom";
import { House, Shield, Target, Users } from "lucide-react";
import { AuthStatus } from "./AuthStatus";
import { BasketballIcon } from "./BasketballIcon";
import { RecentResultWidget } from "./RecentResultWidget";

const NAV_LINKS = [
  { to: "/", label: "Home", icon: House },
  { to: "/players", label: "Players", icon: Users },
  { to: "/teams", label: "Teams", icon: Shield },
  { to: "/optimizer", label: "Optimizer", icon: Target },
];

export function Navbar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border-subtle bg-surface-raised px-6">
      <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold text-text-primary">
        <BasketballIcon className="size-6 shrink-0" />
        NBA Analytics
      </Link>

      <nav className="flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
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

      <div className="ml-auto flex items-center gap-4">
        <RecentResultWidget />
        <AuthStatus />
      </div>
    </header>
  );
}
