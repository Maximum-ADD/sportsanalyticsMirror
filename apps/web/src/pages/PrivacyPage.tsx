import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// Where privacy requests and questions go. Published on this page, so it
// must be an address the team actually reads.
const PRIVACY_CONTACT_EMAIL = "analyticclaritycontact@gmail.com";
// The date this notice last changed in substance, shown to readers.
const LAST_UPDATED = "9 October 2026";
const INFORMATION_REGULATOR_URL = "https://inforegulator.org.za/";

function NoticeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg tracking-[0.04em] text-landing-ink uppercase">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-landing-ink">{children}</div>
    </section>
  );
}

/**
 * The platform's privacy notice: what personal information it keeps, why,
 * where, for how long, and how to see, correct or delete it. Written to
 * cover what POPIA section 18 asks a responsible party to tell people.
 * Public, so it can be read before signing in.
 *
 * Keep it in step with the code: auth.config.ts (what sign-in stores),
 * DataRetentionService (how long), DataExportService (what an export holds)
 * and LeaderboardService (what is public).
 */
export function PrivacyPage() {
  return (
    <div className="min-h-full bg-landing-hero">
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="border border-landing-light bg-locker-surface p-5 sm:p-8">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Privacy notice</h1>
          <p className="mt-2 font-mono text-[10.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
            Last updated {LAST_UPDATED}
          </p>

          <NoticeSection title="Who we are">
            <p>
              This NBA analytics platform is a student project built for COMS3011A at the University of the
              Witwatersrand. The project team decides what personal information the platform keeps and why, and is
              responsible for it under the Protection of Personal Information Act (POPIA). Questions and requests go to{" "}
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="underline">
                {PRIVACY_CONTACT_EMAIL}
              </a>
              .
            </p>
            <p>You can browse players, teams, games and datasets without an account. Nothing about you is stored for that.</p>
          </NoticeSection>

          <NoticeSection title="What we keep, and why">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>From Google, when you sign in:</strong> your name, email address, Google profile picture link and
                Google account ID, plus the tokens that keep you signed in. We use these to create your account and keep
                it secure. We never get your Google password.
              </li>
              <li>
                <strong>What you add:</strong> your username and, if you upload one, a profile photo; your favourite team,
                followed players, Beat the Model picks, saved comparisons and lineups; any Become Pro seasons and game
                stats you log; custom statistics; and API keys you create. We use these only to provide those features to
                you.
              </li>
              <li>
                <strong>Automatically:</strong> when each sign-in session started and when it expires (not your IP address
                or device), and, for API keys, which endpoint was called and when, to enforce rate limits.
              </li>
            </ul>
            <p>We don't use your information for advertising, don't sell it, and don't run analytics or tracking cookies.</p>
          </NoticeSection>

          <NoticeSection title="What other people can see">
            <p>
              Only your username and your Beat the Model record, on the public leaderboard once you have called enough
              games. Your name, email address, photo and everything else stay private to you. Become Pro seasons are
              never shown to anyone else.
            </p>
          </NoticeSection>

          <NoticeSection title="Where it is stored">
            <p>
              Your data is stored with Supabase in London (United Kingdom). The API runs on Render in the United States
              and the website is served through Cloudflare, so your requests and data pass through their servers. Google
              handles sign-in. These providers process data for us under their own security and data-protection terms.
              Player photos and some images load from the NBA&apos;s and Unsplash&apos;s servers, which see your
              browser&apos;s request.
            </p>
          </NoticeSection>

          <NoticeSection title="How long we keep it">
            <ul className="list-disc space-y-2 pl-5">
              <li>Your account and everything you added: until you delete your account.</li>
              <li>Expired sign-in sessions: deleted daily.</li>
              <li>API usage records: deleted after 90 days.</li>
            </ul>
          </NoticeSection>

          <NoticeSection title="How we protect it">
            <p>
              Connections are encrypted, profile photos sit in private storage, API keys are stored only as one-way
              hashes, and the database accepts requests only from the platform itself.
            </p>
          </NoticeSection>

          <NoticeSection title="Your rights">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>See your data:</strong> on your <Link to="/profile" className="underline">Profile</Link>, choose{" "}
                <em>Download my data</em> for a copy of everything we store about you.
              </li>
              <li>
                <strong>Correct it:</strong> change your username, photo and preferences on your Profile, or email us about
                anything else.
              </li>
              <li>
                <strong>Delete it:</strong> <em>Delete account</em> on your Profile removes your account, everything you
                added and your photo, immediately.
              </li>
              <li>
                <strong>Object or complain:</strong> email us. If you aren&apos;t satisfied, you can complain to the{" "}
                <a href={INFORMATION_REGULATOR_URL} className="underline" target="_blank" rel="noreferrer">
                  Information Regulator (South Africa)
                </a>
                .
              </li>
            </ul>
            <p>
              The platform is meant for adults. If you are under 18, please ask a parent or guardian before creating an
              account.
            </p>
          </NoticeSection>
        </div>
      </article>
    </div>
  );
}
