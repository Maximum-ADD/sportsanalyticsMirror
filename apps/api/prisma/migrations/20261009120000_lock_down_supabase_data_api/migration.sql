-- Close Supabase's auto-generated Data API (PostgREST and GraphQL) to the
-- public `anon` and signed-in `authenticated` roles.
--
-- Nothing in this project uses those roles. The API and the Python jobs
-- reach Postgres as the tables' owner (`postgres`), and avatars go through
-- Storage with the service-role key; both bypass row level security. But
-- an audit on 8 Oct 2026 found that Supabase's defaults had granted both
-- roles every privilege on every table in `public`, and that the 39 RLS
-- policies on them (all named `service_role_all`) applied to PUBLIC with
-- `USING (true) WITH CHECK (true)`. So RLS allowed everything: anyone with
-- the project's anon key, which is not a secret, could read or change
-- users, sessions, OAuth tokens and API keys through the Data API.
--
-- After this migration a non-owner role has no privileges, no policy and
-- RLS on every table, so it reaches no rows by any route. The service role
-- never needed those policies: it bypasses RLS.
--
-- Written to be a no-op where the Supabase roles don't exist (the CI and
-- local Docker databases), and safe to re-run.

DO $$
DECLARE
  target record;
BEGIN
  -- 1. The allow-everything policies that made RLS a no-op.
  FOR target IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'::name[]
      AND qual = 'true'
      AND coalesce(with_check, 'true') = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', target.policyname, target.tablename);
  END LOOP;

  -- 2. RLS on every table, including the ones that had none
  --    (UserSeenTutorial, _prisma_migrations). Owners are unaffected.
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
  END LOOP;

  -- 3. Take the Data API roles' privileges away, on today's tables and on
  --    every table, sequence or function this role creates from now on.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
