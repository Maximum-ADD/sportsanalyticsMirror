import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroCtaProps {
  to: string;
  children: React.ReactNode;
}

export function HeroCta({ to, children }: HeroCtaProps) {
  return (
    <Button
      asChild
      size="lg"
      // text-white rather than the theme token, and the dark overlay below,
      // because the leather texture's brightest specks leave off-white at 2.99:1.
      // The default accent focus ring is unreliable over a busy photo.
      className="group relative overflow-hidden border border-brand-accent/40 bg-[url('/texture-leather-790.webp')] bg-cover bg-center px-7 text-base font-semibold text-white shadow-lg shadow-black/40 hover:bg-[url('/texture-leather-790.webp')] focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
    >
      <Link to={to}>
        <span
          aria-hidden
          className="absolute inset-0 bg-[rgb(18_13_9/0.35)] transition-colors group-hover:bg-[rgb(18_13_9/0.15)]"
        />
        <span className="relative flex items-center gap-2">
          {children}
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </Button>
  );
}
