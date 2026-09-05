# AGENTS.md

Instructions for coding agents working on **Board Game Organizer**.

## 1. Source of truth

Read this file before changing code. Then inspect the files touched by the task and every caller of
shared code being changed. Prefer current code and workflow files over historical notes.

Core rules:

- Keep changes small, complete, and tested.
- Fix root causes in shared code instead of patching each caller.
- Do not add speculative abstractions, dependencies, or scaffolding.
- Never weaken validation, authentication, authorization, accessibility, or data-safety checks.
- Never commit credentials or `.env*` files.
- Use **Biome**, not ESLint or Prettier.
- Use `import type` for type-only imports.
- Open a pull request only when the user explicitly asks.

## 2. Product and current scope

Board Game Organizer is a TypeScript monorepo for organizing board-game contacts and matches across
web and native mobile clients.

Implemented product areas:

- Clerk authentication on web and mobile.
- Profile display and logout.
- Social graph: follows, friend requests, friendships, blocks, user search, presence, and contact-based
  suggestions.
- Shareable invites with seven-day expiry and authenticated claim flow.
- Match creation and listing, including date slots, player limits, friend invitations, and board-game
  selection.
- BoardGameGeek catalog import and MongoDB-backed game search.
- English and Italian localization.
- Web Playwright and mobile Maestro end-to-end coverage.

Groups and Organizations remain placeholders. Collection management, session logging, player
statistics, venues, rankings, and marketplace features are not implemented.

## 3. Repository structure

pnpm workspaces and Turborepo manage ten workspace projects.

```text
apps/
  api/      Next.js route handlers, Clerk server auth, MongoDB repositories, zod validation
  web/      Next.js App Router, React, HeroUI, Tailwind CSS, Clerk
  mobile/   Expo Router native app, React Native, Clerk, Sentry, heroui-native, Uniwind
packages/
  query/              TanStack Query client and provider
  schemas/            Shared MongoDB models and zod DTOs
  shared/             Shared API helpers, types, and TanStack Query hooks
  store/              Zustand UI and draft-form state
  biome-config/       Shared Biome configuration only
  typescript-config/  Shared TypeScript configuration only
messages/              Shared Lingui catalogs and compiled messages
scripts/release/       Release versioning, changelog, and Telegram helpers
.github/actions/       Local composite CI actions
.github/workflows/     Branch, PR, release, mobile, and catalog-import workflows
```

Current dependency baselines:

- Node.js 26 in CI.
- pnpm 11.25.
- Next.js 16 and React 19.
- Expo SDK 57 and React Native 0.86.
- TypeScript 7 for non-mobile workspaces; Expo-compatible TypeScript 6 for `apps/mobile`.
- Vitest 3.2 (latest compatible baseline; Vitest 5 currently breaks existing JSX transforms and class mocks).

Workspace packages export source files directly; there is no package build step. App alias `@/*`
resolves to each app's `src/*`.

Expo web is not a supported product target. Do not implement or maintain it even though Expo-related
packages may expose web support transitively.

## 4. Commands

Run commands from repository root unless noted.

```bash
pnpm install                         # frozen in CI
pnpm dev                             # all development tasks through Turbo
pnpm build                           # all builds
pnpm lint                            # biome check through Turbo
pnpm typecheck                       # tsc --noEmit through Turbo
pnpm format                          # biome format --write .
pnpm clean                           # Turbo clean
pnpm i18n:extract
pnpm i18n:compile
pnpm release                         # semantic-release; main only

pnpm --filter web dev                # http://localhost:3000
pnpm --filter api dev                # http://localhost:4000
pnpm --filter mobile dev             # Expo development client
pnpm --filter <app> test
pnpm --filter <app> test:coverage
pnpm --filter api test:integration
pnpm --filter api migrate
pnpm --filter api backfill:users
```

No root `test` script exists. Run app/package tests with filters.

### Dependency updates

Use pnpm, keep `pnpm-lock.yaml` synchronized, and install the graph rather than editing only the
lockfile.

```bash
pnpm outdated -r
pnpm update -r                         # compatible updates within declared ranges
pnpm --filter mobile exec expo install --fix
pnpm dedupe
pnpm peers check
pnpm --filter mobile exec expo install --check
```

Upgrade major versions one package family at a time; do not use a blanket `--latest` update without
running and fixing the full validation suite. Expo owns compatible versions of React Native and native
modules. Do not force npm-latest versions over Expo's compatibility matrix. Keep mobile `react`,
`react-dom`, and other exact Expo-managed versions pinned when a caret would let pnpm dedupe to an
incompatible version. Keep Vitest 3.2 until the web JSX transform and constructor mocks are migrated
for Vitest 5.

After any dependency update, run lint, typecheck, unit tests, builds, and relevant integration tests.
Native dependency changes also require a fresh APK and Maestro coverage in CI.

## 5. Environment configuration

Copy examples; never commit generated environment files.

| App | File | Variables |
| --- | --- | --- |
| web | `apps/web/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` |
| api | `apps/api/.env.local` | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `MONGODB_URI`, `MONGODB_DB_NAME`, `ALLOWED_ORIGINS` |
| mobile | `apps/mobile/.env` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN` |

`MONGODB_URI` is mandatory. Transactions require a replica set.

Mobile reads public variables through `apps/mobile/app.config.js` and
`Constants.expoConfig.extra`. Web public variables must be read inside `apps/web` and passed to
workspace helpers: Next.js does not reliably inline `NEXT_PUBLIC_*` reads from workspace package
source.

Production endpoints:

- Web: `https://board-game-organizer.com`
- API: `https://api.board-game-organizer.com`

Preview web and mobile builds must receive the API preview URL produced by `deploy-preview-api`.
If API preview deployment fails, workflow conditions intentionally allow fallback to configured
repository variables.

Vercel preview protection bypass is a **query parameter**, not a custom header. Use
`withProtectionBypass()` so CORS preflight requests reach the protected deployment.

## 6. Data and state ownership

### TanStack Query

TanStack Query owns all server data: profiles, contacts, relationships, suggestions, matches, games,
and invite results.

Contact query keys use this shape:

```ts
["contacts", listType, apiUrl, token]
```

Every relationship mutation must invalidate the `['contacts']` prefix. If search is active,
`useContacts` must rerun the last query so action state updates without manual refresh.

Match creation must invalidate the `['matches']` prefix.

Clerk session JWTs rotate. Shared hooks receive `getToken` and resolve a fresh token immediately
before every request. Do not retain a token snapshot for later network calls.

### Zustand

Zustand owns local UI state and unsaved form state only:

- theme preference;
- selected tabs and open/closed UI;
- match-wizard draft values;
- transient optimistic flags.

Never mirror Query data into Zustand.

## 7. API architecture

API routes live under `apps/api/src/app/api`. Keep route handlers thin. Put data access in repository
classes under `apps/api/src/app/lib` and shared validation in `packages/schemas`.

Current route surface:

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Health probe |
| `/api/profiles` | GET | Current Clerk profile |
| `/api/relationships` | GET, POST, PATCH, DELETE | Social lists and mutations |
| `/api/users/search` | GET | Registered-user search |
| `/api/users/suggestions` | GET | Persisted contact matches |
| `/api/users/presence` | POST | Presence heartbeat |
| `/api/contacts/sync` | POST | Replace caller's matched address-book contacts |
| `/api/invites` | POST | Create invite |
| `/api/invites/claim` | POST | Claim invite and connect users |
| `/api/matches` | GET, POST | List and create matches |
| `/api/bgg/search` | GET | Search imported board-game catalog |
| `/api/bgg/thing` | GET | Get imported game details |
| `/api/webhooks/clerk` | POST | Mirror Clerk user events |
| `/api/admin/sync-user` | POST | Administrative user mirror |
| `/api/admin/import-games` | POST | Chunked catalog import |

Most routes expose `OPTIONS` through CORS helpers. Keep CORS handling centralized in
`lib/cors.ts`.

### Authentication and users

Clerk user IDs are application identities; there is no separate local authentication identity.
There **is** a MongoDB `users` mirror used by social search and contact suggestions. Clerk webhook
`user.created`, `user.updated`, and `user.deleted` events maintain it. `backfill:users` mirrors
existing Clerk accounts idempotently.

A Clerk account alone does not make a user searchable. The corresponding document must exist in the
`users` collection.

`GET /api/profiles` uses `enrichSingleUser` from `lib/clerk.ts`; do not duplicate direct Clerk calls.
Relationship list enrichment uses local users through `lib/enrichUsers.ts`.

### Collections

`COLLECTIONS` in `lib/db.ts` defines:

- `users`
- `follows`
- `friendRequests`
- `blocks`
- `invites`
- `contactLinks`
- `matches`
- `boardGames`
- legacy `relationships`, retained only as a migration constant

`pnpm --filter api migrate` creates indexed social collections and drops legacy `relationships`.
The current `RelationshipRepository` writes only `follows`, `friendRequests`, and `blocks`.

### Relationship invariants

- Follow is a directed edge in `follows`.
- Friendship is derived from accepted friend-request records in both directions.
- Block is a directed edge in `blocks`.
- Blocking removes only blocker-to-target follow, preserves target-to-blocker follow, and clears
  pending friend requests. This deliberately prevents blocked users from detecting the block through
  their own follow state.
- Blocked users are hidden from normal lists and search. The Blocked list must still show users
  blocked by the viewer so unblock remains possible.
- MongoDB operations sharing one session must run sequentially. Never use `Promise.all` on operations
  using the same transaction session.
- DELETE relationship requests include `targetUserId`. Parse DELETE bodies defensively with
  `request.text()` plus guarded JSON parsing so a missing body returns 400, not 500.

### Invites

Invite tokens are 128-bit base64url values with seven-day expiry. Creation links always use
`new URL(request.url).origin`; preview APIs create preview links and production creates production
links. Claim UI is hosted by the API at `/invite/[token]`, uses Clerk modal sign-in, and claims with a
Bearer token. Successful claim connects both users.

### Board-game catalog

Runtime search reads MongoDB `boardGames`; it does not call BoardGameGeek. Import the authenticated
BGG rankings CSV through `apps/api/scripts/import-boardgames.mjs`, `/api/admin/import-games`, or the
manual `import-boardgames.yml` workflow. Imports use chunked idempotent upserts keyed by BGG ID.

## 8. Web architecture and UI

`apps/web` uses Next.js App Router and server components by default. Add `"use client"` only for
interactive state or browser APIs. Auth middleware leaves `/`, sign-in, and sign-up public and
protects application routes.

The `(tabs)` group exposes Matches, Groups, Organizations, Contacts, and Profile. Do not repeat a page
or section title inside tab content; main navigation already identifies the section.

Use `@heroui/react` and Tailwind CSS. For unsupported components, build a small accessible custom
component matching HeroUI styling.

HeroUI v3 uses React Aria composition:

- Do not use obsolete `startContent`, `endContent`, `flat`, `light`, or `solid` APIs.
- Put item icons inside item children.
- Attach `onAction` to each `Dropdown.Item`; menu-level `onAction` is not reliable here.
- `Dropdown.Trigger` must contain an interactive Button.
- Prefer the existing custom portal dialog for controlled confirmation dialogs; the HeroUI composite
  modal previously left orphaned overlays.
- Check installed `.d.ts` files before introducing a HeroUI component API not already used.

HeroUI dark mode is class-based. `ThemeScript` sets the initial class from system preference.

Use `lucide-react` icons only.

## 9. Mobile architecture and UI

`apps/mobile` is native-only Expo Router. Root provider order is:

```text
Sentry initialization
GestureHandlerRootView
HeroUINativeProvider
I18nProvider
ClerkProvider
QueryProvider
Expo Router Stack
```

Keep `index.tsx` authentication navigation declarative with `<Redirect>`; an effect-driven
`router.replace` raced cold-start navigation.

Use heroui-native components and Uniwind classes. Use explicit React Native style objects for
structural layout (`flex`, row direction, gaps, dimensions) because generated utility availability is
not reliable at runtime. Use classes for theme-aware visual styling. Every text element needs a
visible theme-aware color or heroui-native's Text default.

`global.css` must retain `@source "./src"`; otherwise app utility classes are not generated.

`ThemeSync` maps Zustand `system | light | dark` to `Uniwind.setTheme`. Selected mobile chips and tabs
must visibly reflect active state.

Use `lucide-react-native` icons only.

Address-book suggestions require explicit `expo-contacts` permission. Sync emails to
`POST /api/contacts/sync`; persist only registered matches in `contactLinks`. Repeated denials lead to
an open-settings path, not silent permission loops.

HeroUI Native Skeleton has no intrinsic size. Give each skeleton explicit width, height, and border
radius, and keep parent rows stretched to full width.

Do not add a custom mobile Babel configuration. React Native's Babel/runtime combination and
worklets previously caused release builds to crash at launch. Mobile localization intentionally uses
runtime helpers instead of Lingui Babel macros.

## 10. Shared localization

Lingui configuration lives at repository root. Source catalogs are `messages/en.po` and
`messages/it.po`; compiled catalogs are committed.

```bash
pnpm i18n:extract
pnpm i18n:compile
```

Web uses Lingui macros through `apps/web/babel.config.js`. Mobile uses `useT()` and `translate()` from
`apps/mobile/src/lib/i18n.ts`.

Strings used only by mobile runtime helpers are invisible to Lingui extraction. Add them manually to
both PO files, then compile.

For dynamic web messages, use a descriptor with stable ID and values rather than a runtime template
literal that produces a hashed fallback.

## 11. Loading, errors, and accessibility

- Use skeletons, not spinners, on all web and mobile pages and tabs.
- Keep logout available even when profile loading fails.
- Do not convert network failures into empty-list success states; preserve an observable error path.
- Keep buttons, dialogs, dropdowns, and form inputs accessible by role and label.
- Search runs automatically after 300 ms, requires at least four characters, and has a clear button;
  do not add a submit button.

## 12. Tests

Vitest covers web, mobile pure logic, API, and schemas. Each coverage config enforces at least 50% for
lines, functions, branches, and statements.

Mobile component unit tests are not run under Vitest because React Native 0.86 packages include Flow
syntax loaded outside Vite transforms. Keep mobile unit coverage focused on pure logic; Maestro owns
native UI behavior.

API integration tests use Testcontainers with MongoDB configured as a single-node replica set so
transactions behave like production.

Every product feature requires both:

- Playwright coverage for web in `apps/web/e2e`;
- Maestro coverage for mobile in `apps/mobile/.maestro/flows`.

Social E2E uses two provisioned users. Wait for Clerk webhook mirroring before searching for the target.
Never allow missing E2E environment variables to silently skip authenticated tests. Inspect JUnit
skip counts when expected flows appear suspiciously fast.

When extending `useContacts`, update every test mock. UI code reads pending state from each mutation;
a missing mutation object crashes tests before assertions.

Useful validation order:

```bash
pnpm lint
pnpm typecheck
pnpm --filter mobile test
pnpm --filter web test
pnpm --filter api test
pnpm --filter schemas test
pnpm --filter api test:integration
pnpm build
```

## 13. CI/CD

Every job using a local action must run `actions/checkout` first. GitHub cannot resolve
`./.github/actions/...` before checkout.

### `branch-ci.yml`

Runs on every non-main branch push:

1. commitlint
2. Biome
3. typecheck
4. unit tests for mobile, web, API, and schemas
5. API integration tests

No builds, deployments, or E2E.

### `pr-ci.yml`

Runs full pull-request gates:

1. commitlint, Biome, and typecheck
2. unit coverage and Codecov upload
3. API integration tests
4. API and web builds
5. mobile-change detection and internal APK build or reuse
6. API and web Vercel preview deployments
7. two-user synchronization
8. Maestro and Playwright E2E
9. unconditional test-user cleanup
10. draft prerelease and Telegram notification after all gates pass

Mobile change detection compares against the last successful PR workflow run on the branch, not the
PR base. Mobile code, related workspace packages, and lockfiles trigger APK rebuilds. Maestro-only and
unit-test-only changes do not.

Preview web and mobile jobs consume the API preview deployment URL. Protected previews receive
`VERCEL_PROTECTION_BYPASS` and clients append it to request URLs.

### `main-ci.yml`

On merge to main:

1. semantic-release calculates one product version from Conventional Commits;
2. release scripts update changelog, all app package versions, and Expo version;
3. internal APK builds with a 180-minute timeout;
4. production API and web deploy;
5. Maestro and Playwright run against released artifacts and production;
6. GitHub release publishes only after gates pass;
7. Telegram notification sends release links and changelog.

Release commits use `[skip ci]` to avoid recursion. If a failed release leaves a tag without a release,
remove the orphan tag and restore version state before retrying; semantic-release treats existing tags
as published history.

Preview/test Clerk uses `CLERK_SECRET_KEY`. Production uses
`CLERK_SECRET_KEY_PRODUCTION` and production publishable-key variables. Never mix instance keys: tokens
from one Clerk instance return 401 against the other.

### Other workflows

- `mobile-development.yml`: manual development APK from `main`, attached to latest release.
- `mobile-e2e.yml`: standalone mobile APK and Maestro iteration workflow; currently manual or limited
  to its configured branch/path trigger.
- `import-boardgames.yml`: manual BoardGameGeek CSV import into a chosen API deployment.

## 14. Required GitHub configuration

Repository secrets used by workflows:

- `EXPO_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_WEB_PROJECT_ID`
- `VERCEL_API_PROJECT_ID`
- `VERCEL_PROTECTION_BYPASS`
- `CLERK_SECRET_KEY`
- `CLERK_SECRET_KEY_PRODUCTION`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RELEASE_PAT`
- `CODECOV_TOKEN`

Repository variables used by workflows:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_API_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`

## 15. Git workflow

`main` is protected. Never commit or push directly to it.

For each feature, fix, documentation change, dependency update, or CI change:

1. start a new branch from current `main`;
2. implement the complete task;
3. run relevant checks;
4. commit with a signed Conventional Commit;
5. push the branch so `branch-ci.yml` validates it;
6. open a PR only after the user explicitly requests it.

Allowed commit types:

```text
feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert
```

Repository-local signing identity:

```bash
git config user.name "Alessandro Mancini"
git config user.email "alexemancio1985@gmail.com"
git config gpg.format ssh
git config commit.gpgsign true
```

Keep the machine's valid SSH public key in `user.signingkey`. The board-agent container uses
`/root/.ssh/mancioshell_github.pub`; local Windows development uses the configured user key.

Verify signatures with:

```bash
git log --show-signature -1
```

Use `git push origin <branch>`. Do not open a PR proactively.

## 16. Debugging invariants

- Browser `Failed to fetch` without a response usually means unreachable host, deployment protection,
  or CORS. Capture request URLs as well as responses.
- Confirm frontend API URLs after domain changes; changing a Vercel domain does not update baked public
  environment variables.
- Keep profile E2E assertions specific to API-loaded profile content; header display names can create
  false positives.
- Controlled block dialogs may coexist with a dropdown carrying `role="dialog"`; target the intended
  dialog explicitly in Playwright.
- YAML folded blocks (`>-`) join lines. Use literal blocks (`|`) for multiline environment input.
- GitHub Actions `actions/runs` does not honor `conclusion=success` as a query filter; filter returned
  JSON explicitly and pass `GH_TOKEN` to `gh api`.
- Main APK builds need 180 minutes; clean local EAS builds can exceed 90 minutes.

## 17. Board automation

`pi-board-agent` runs separately and uses gitignored `.pi/board-agent.yml`. It manages project-board
refinement, task worktrees, cumulative PRs, CI watchdog behavior, and Telegram notifications.

`/board-agent init-project` creates configured project fields and views. Tokens need repository Issues,
Pull requests, Contents, Actions, and Metadata permissions plus organization Projects read/write.
Never store this token in the repository.
