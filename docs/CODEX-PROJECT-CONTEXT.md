# Codex Project Context

This document gives new Codex sessions durable context without copying private
chat history into the repository. It describes the current product contract,
not temporary officeholder data.

## 1. Product Map

IHP is a connected family of student-community applications sharing one
Supabase Auth tenant and database:

| Application | Public address | Build output | Responsibility |
| --- | --- | --- | --- |
| Main portal | `https://ihp.org.tr` | `dist/` | Membership, profile, announcements, boards, applications, complaints, agreements, regulations, games and personal notifications |
| Discipline portal | `https://dk.ihp.org.tr` | `dist-dk/` | DK applications, complaints, investigations, decisions, penalties, appeals and member reports |
| Finance | `https://finans.ihp.org.tr` or the currently configured Vercel alias | `dist-finance/` | Credit accounts, transfers, debts, requests, cheques, portfolios and officer operations |
| Mail | `https://mail.ihp.org.tr` | `dist-mail/` | Internal mailboxes, external mail through Resend, attachments, scheduling and archive |

All applications must read the same current identity, roles, account status and
authorization data. A separate site is a separate interface, not a separate
copy of member data.

## 2. Durable Product Principles

### Identity and membership

- Members authenticate with Supabase Auth and keep their session on the device
  until explicit logout, expiry, revocation, or a security event.
- Real members have server-backed profiles and may have multiple roles and
  multiple committee memberships.
- System, access, and test accounts are excluded from member counts, lists,
  committees, reports, applications, discipline targets and member IDs unless a
  narrowly defined system workflow requires them.
- Shared records must be visible across devices according to authorization.
- Member-facing examples and tests use anonymous identities only.

### Roles and authority

- Role labels and hierarchy come from the current source, migrations and live
  records. Do not infer authority from visual placement alone.
- Admin is the technical system moderator with server-enforced administrative
  powers. It is not a normal institutional office and must not be assigned as a
  side effect of another role.
- General leadership and Discipline Board hierarchy are independent. A high
  general role does not automatically outrank a member's DK rank inside a DK
  workflow.
- The Presidency interface is the place for leadership role management. The
  general member list should not expose administrative profile or password
  controls to non-Admin users.
- Current officeholders and role assignments are database content. Never encode
  a person's name as an authorization rule.

### Discipline workflows

- Members create complaints in the main portal and can see their own complaint
  records there. DK processing occurs in the DK portal.
- A complainant or target cannot take responsibility for or process the same
  case. Responsibility and hierarchy checks must be enforced server-side.
- Current workflow rules, including who may open, own, transfer, close, decide,
  penalize, archive, or appeal a case, are defined by the latest migrations and
  regression tests. Preserve those contracts when changing UI.
- Case attachments are server-backed and protected by RLS. Up to the currently
  configured limit must be handled as one coherent upload flow, including
  partial-failure cleanup and useful errors.
- A discipline decision must remain linked to its investigation and audit
  trail. Archiving is not equivalent to an unsafe hard delete.
- AI discipline analysis is advisory only. It may propose a sanction but must
  never apply one automatically.

### Finance and games

- Finance balances, debts, transfers, requests, salaries, portfolio positions,
  game charges and rewards are server-authoritative ledger data.
- Multi-role salary calculations are policy code and must be covered by tests.
  Never hardcode a member's computed salary.
- Credit officers cannot approve or directly benefit from their own privileged
  finance action unless a later explicit rule and server authorization allow it.
- Games create finance requests or ledger operations according to current
  configuration. Training modes must not mutate balances.
- Finance is entertainment/community accounting, not real banking, investment
  advice, currency, or a claim of monetary value.

### Mail and notifications

- Portal users access their institutional mailbox through the existing portal
  session; there is no second plaintext mailbox password.
- Internal mail is stored in Supabase. External delivery and inbound handling
  use server-side Resend integration.
- Notification content should be specific enough to identify the event without
  leaking another member's restricted case details.
- Resend, webhook and push credentials never reach client code.

### UI and accessibility

- Keep interfaces simple, mobile-first, and visually polished without adding
  empty marketing copy or explanatory text that users do not need.
- Preserve the visual identity of each application while keeping shared
  controls consistent and accessible.
- Buttons should react immediately and expose a loading state for network work.
- Support keyboard use, reduced motion, readable contrast, long Turkish text,
  uploaded images, and narrow mobile screens.

## 3. Repository Structure

- `src/app.ts`: application bootstrap and route composition.
- `src/features/`: feature UI and client-side behavior.
- `src/lib/`: Supabase and portal service clients.
- `server/`: reusable server-side domain modules.
- `serverless-handlers/`: authenticated HTTP handlers.
- `api/[...routePath].js`: consolidated Vercel API entrypoint.
- `supabase/migrations/`: database schema, RLS, RPC and data migrations.
- `tests/`: behavior, security, regression and visual smoke tests.
- `scripts/build.mjs`: variant-aware build pipeline.
- `scripts/package-*-deploy.mjs`: variant deployment package generation.
- `docs/IHP-Sistem-Kullanim-Kitapcigi.md`: operator and member workflow guide.

Generated folders (`dist/`, `dist-dk/`, `dist-finance/`, `dist-mail/`, `.vercel/`)
are outputs. Change their sources and rebuild them.

## 4. Data and Security Contract

- Supabase RLS is mandatory for client-accessible tables.
- The anon key may be public, but authorization must never depend on key secrecy.
- The service-role key is server-only and every privileged handler must
  authenticate the caller and check current profile status and roles before use.
- Storage policies must match table visibility. A hidden record with a public
  attachment URL is still a data leak.
- Prefer structured parsing and RPCs/transactions for multi-table changes.
- Preserve audit records for privileged actions and make errors understandable
  without returning tokens, SQL internals, or private records.
- Do not place production data in test fixtures. Tests use generated UUIDs,
  anonymous labels and `example.test` addresses.

## 5. Builds and Tests

The repository requires Node.js `>=22.13.0` and uses `pnpm-lock.yaml`.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm build:dk
pnpm build:finance
pnpm build:mail
pnpm check
```

Useful targeted suites:

```bash
pnpm check:dk
pnpm test:finance
pnpm test:mail
pnpm test:game
pnpm test:governance
```

Run the tests that own the changed behavior. For a shared authorization,
migration, routing, identity, or build change, run the full `pnpm check` before
calling the work complete.

## 6. Deployment Contract

- The GitHub repository is the shared source of truth. Web Codex should work in
  a branch and present reviewable changes.
- Vercel projects hold production environment variables. A Codex cloud
  environment does not need production secrets for normal development.
- Main, DK, Finance, and Mail are separate deployable variants. A change to
  shared source can affect all four, so test all impacted variants.
- Use preview deployments for visual and workflow verification. Production
  publication and live data migrations require an explicit task request.
- The catch-all API entrypoint is intentional and avoids multiplying Vercel
  serverless entrypoints. Preserve it unless the hosting architecture changes.

## 7. Resolving Ambiguity

Long project history can contain superseded or contradictory requests. Apply
this order of authority:

1. The newest explicit request in the active task.
2. Current security and privacy constraints.
3. Current migrations and automated tests.
4. This document and the user handbook.
5. Older comments or historical implementation details.

When a new decision changes behavior, update its tests and this documentation
in the same change. Do not try to recreate private chat history in the repo.
