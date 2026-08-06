import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-text-primary">NBA Analytics Platform</h1>
      <p className="mt-2 max-w-xl text-sm text-text-secondary">
        Browse players and see season stats derived from game event data.
      </p>
      <Link
        to="/players"
        className="mt-4 inline-block rounded-md bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent-soft"
      >
        Browse players
      </Link>
    </div>
  );
}
