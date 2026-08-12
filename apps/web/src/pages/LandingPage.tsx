import { HeroSection } from "@/components/HeroSection";
import { TopNav } from "@/components/TopNav";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-nav">
      <TopNav />
      {/* tabIndex={-1} is what makes the skip link move focus, not just scroll. */}
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <HeroSection />
      </main>
    </div>
  );
}
