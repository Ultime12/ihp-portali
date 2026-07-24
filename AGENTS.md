# IHP Portal Repository Guidance

## Required Context

Before changing code, read `docs/CODEX-PROJECT-CONTEXT.md`. For user-facing
workflows also consult `docs/IHP-Sistem-Kullanim-Kitapcigi.md`. Treat the current
source, migrations, and tests as the implementation source of truth.

## Product Boundaries

- IHP is a student/community portal, not a real political party or an official
  government service. Keep public wording and examples consistent with that.
- Never add real member names, personal email addresses, passwords, tokens, or
  production records to source, documentation, fixtures, screenshots, or tests.
  Use labels such as `Uye 1` and `uye1@example.test`.
- Persist shared application data in Supabase. Do not use browser storage as a
  substitute for database persistence. Device-only preferences and Supabase
  session persistence are acceptable.
- Preserve role checks, RLS, auditability, and system-account exclusions. UI
  visibility is not authorization; privileged operations require server-side
  enforcement.
- Admin is the technical moderator role. Do not silently turn a corporate role
  into Admin or weaken hierarchy rules to make a UI action pass.

## Architecture

- Runtime requirement: Node.js `>=22.13.0`; use pnpm and the checked-in lockfile.
- Source lives under `src/`. Do not hand-edit `dist*` or `.vercel` output.
- `scripts/build.mjs` builds the main, DK, Finance, and Mail variants.
- Server modules live in `server/`; route handlers live in
  `serverless-handlers/`; Vercel enters through `api/[...routePath].js`.
- Supabase schema changes belong in a new ordered file under
  `supabase/migrations/`. Do not reset, truncate, or rewrite production data
  unless the user explicitly requests that exact destructive operation.
- Production secrets stay server-side in Vercel. Never expose service-role,
  Resend, Gemini, VAPID private, webhook, cron, or deployment credentials to the
  browser or commit them.

## Working Rules

- Inspect `git status` first and preserve unrelated user changes.
- Make changes in source modules, not runtime patch files or generated bundles.
- Keep changes scoped. When behavior changes, update the matching tests and
  checked-in documentation in the same change.
- Existing database records, officeholders, salaries, and role assignments are
  live data. Do not hardcode them into application code.
- If a new request conflicts with an older document, the newest explicit user
  request wins; update the relevant tests and documentation so the decision is
  durable.
- Do not deploy or mutate live Supabase data unless the task explicitly asks for
  it. Prefer preview validation before production publication.

## Validation

Use the narrowest relevant command while iterating, then broaden validation
according to risk:

```bash
pnpm build
pnpm check:dk
pnpm test:finance
pnpm test:mail
pnpm test:game
pnpm test:governance
pnpm check
```

For user-facing changes, verify loading, empty, error, and retry states. Test
responsive behavior at approximately 390 px, 1024 px, and 1440 px and check for
horizontal overflow. For authentication work, verify session persistence and
explicit logout separately.

