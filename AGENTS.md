# AGENTS.md

Guidance for AI agents working on the **Board Game Organizer** monorepo.

## Project Overview

Multi-platform app for organizing board game sessions, collections, groups, and player stats.
Users authenticate with **Clerk** (user identity = Clerk user ID, no local users table); the API enriches
profiles/relationships from the Clerk API on demand. Data lives in **MongoDB**.

Currently in early stage: auth, web/mobile shells with tab navigation, and a first API feature
(follow/friend/block "relationships") are implemented. Most pages are placeholders.

## Stack & Structure

pnpm + Turborepo monorepo. TypeScript everywhere. **Biome** for lint/format (no ESLint/Prettier).

```
apps/
  web/      Next.js 16 (App Router, React 19) + Tailwind v4 + HeroUI (@heroui/react) + Clerk   → port 3000
  api/      Next.js 16 route handlers + Clerk + MongoDB (raw driver, no ODM) + zod → port 4000
  mobile/   Expo SDK 56 (RN 0.85, Expo Router, dev client) + Clerk + Sentry + heroui-native + uniwind
packages/
  store/              @board-game-organizer/store   Zustand store, slice pattern (UI state ONLY)
  query/              @board-game-organizer/query   TanStack Query provider + client factory
  shared/             @board-game-organizer/shared  shared types, API client + TanStack Query hooks
  schemas/            @board-game-organizer/schemas  DB models (5 collections) + zod DTOs (Phase 0)
  biome-config/       @board-game-organizer/biome-config
  typescript-config/  @board-game-organizer/typescript-config (base / next / expo)
```

- **The Expo web target is NOT used** — never implement/maintain it; mobile is a native-only app.
- UI on mobile = **heroui-native** components + **uniwind** (Tailwind-like) `className`s.
  UI on web = **@heroui/react** components + Tailwind v4 classes. Both follow the same
  HeroUI look. If a component can't be built with HeroUI, build a custom one that matches
  HeroUI's aesthetic, always styled with uniwind/tailwind classes.
- `apps/mobile` and `apps/web` are **specular**: same folder structure (route groups, tabs,
  components). Reuse shared logic via `packages/shared`; only duplicate a component when it
  cannot be shared (then keep one copy in each app, same path/name).

- Path alias `@/*` → `<app>/src/*` in all apps.
- Workspace packages are consumed as source (`exports` point to `./src/index.ts`), no build step.
- `biome.json` at root extends the shared `biome-config` (2-space indent, double quotes,
  semicolons, trailing commas, 100 col width). Each app has its own `biome.json` too.

## Commands (run from repo root)

```bash
pnpm install                # install (lockfile frozen in CI)
pnpm dev                    # turbo: run all apps in dev mode (persistent)
pnpm build                  # turbo build (depends on ^build)
pnpm lint                   # turbo lint → biome check .
pnpm typecheck              # turbo typecheck (depends on ^build)
pnpm test                   # not wired at root → use per-app: pnpm --filter web test
pnpm format                 # biome format --write .
pnpm clean                  # turbo clean
pnpm release                # semantic-release (only on main, via main-ci.yml)
```

Per-app (filters: `web`, `api`, `mobile`):

```bash
pnpm --filter web dev       # http://localhost:3000
pnpm --filter api dev       # http://localhost:4000 (binds 0.0.0.0)
pnpm --filter mobile dev    # expo start --dev-client
pnpm --filter <app> test    # vitest run
pnpm --filter <app> lint|typecheck|format
pnpm --filter api migrate        # Phase 1: create social collections + indexes
pnpm --filter api backfill:users # Phase 1: mirror all Clerk users into `users`
```

## Environment Variables

No committed `.env*` files — copy each app's `.env.example` (`apps/web/.env.example`, `apps/api/.env.example`, `apps/mobile/.env.example`) into that app as `.env.local` (web/api) or `.env` (mobile).

| App | Variable | Notes |
|-----|----------|-------|
| web | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| web | `NEXT_PUBLIC_API_URL` | defaults to `http://localhost:4000`; prod → `https://api-chi-two-97.vercel.app` |
| api | `CLERK_SECRET_KEY` | backend calls to Clerk API |
| api | `CLERK_WEBHOOK_SECRET` | SVIX signing secret for `POST /api/webhooks/clerk` (user.created/updated/deleted mirroring) |
| api | `MONGODB_URI` / `MONGODB_DB_NAME` | MongoDB (needs transactions → replica set) |
| api | `ALLOWED_ORIGINS` | comma-separated CORS allowlist (dev allows all) |
| mobile | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | via `app.config.js` `extra` |
| mobile | `EXPO_PUBLIC_API_URL` | read from `Constants.expoConfig.extra.apiUrl`; prod → the Vercel API URL |

**Preview chaining (option B)**: in pr-ci the mobile APK and the web preview are
built to talk to **this PR's API preview deployment**: `build-mobile-internal` and
`deploy-preview-web` depend on `deploy-preview-api` and inject its `outputs.url` as
`EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` (via `vercel-deploy`'s `extra-env`
input). Both jobs keep an `if: !cancelled() && <main needs> == 'success'` so a failed
API preview falls back to the repo/project env var instead of killing the E2E chain.
The standalone `mobile-e2e.yml` workflow keeps using the repo variable (no preview
deploy there).

The API preview deployments are protected by **Vercel Deployment Protection**; the
repo secret `VERCEL_PROTECTION_BYPASS` (x-vercel-protection-bypass token) is injected
at build time into the mobile APK (`EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS` via the
mobile-build action) and into the web preview (`NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS`
via `extra-env`), and every client fetch attaches it via `apiHeaders()` in
`packages/shared/src/api.ts`, so preview clients can call the protected API.

**Production deployments**: web → `web-rosy-phi-82.vercel.app`, api → `api-chi-two-97.vercel.app`.
CI relies on repo **secrets**: `EXPO_TOKEN`, `VERCEL_TOKEN` (admin), `VERCEL_ORG_ID`,
`VERCEL_WEB_PROJECT_ID`, `VERCEL_API_PROJECT_ID`, `VERCEL_PROTECTION_BYPASS`,
`CLERK_SECRET_KEY` (used by Maestro E2E to
provision a test user via the Clerk API and by Playwright E2E for the testing token +
user cleanup), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (release notifications on the
Telegram channel), `RELEASE_PAT` (admin PAT usato da main-ci per il push del bump di
semantic-release su `main` protetta), `CODECOV_TOKEN` (upload coverage a Codecov;
installa anche l'app GitHub Codecov per i commenti PR col delta di coverage). Repo **variables** (baked into mobile builds / E2E):
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_API_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web, required by the Playwright `clerkSetup()`).

Note: root `.env*` files are gitignored; the API's `db.ts` throws if `MONGODB_URI` is missing, so the API can't start without it.

## i18n (LinguiJS)

- **One shared catalog** for web + mobile: `lingui.config.ts` at the repo root,
  catalogs in `messages/{en,it}.po` (compiled to `messages/{en,it}.js`).
- Commands: `pnpm i18n:extract` / `pnpm i18n:compile` (root). Compiled catalogs
  are committed; keep them in sync after editing strings.
- **Locale detection**: web reads the browser `Accept-Language` header
  server-side (`apps/web/src/lib/i18n.ts` + `i18n-locale.ts`, q-values parsed)
  with a `navigator.language` client fallback in `LinguiClientProvider`;
  mobile uses `expo-localization` (`apps/mobile/src/lib/i18n.ts`).
- **Macros**: `t` / `Trans` / `useLingui` from `@lingui/react/macro` (and
  `@lingui/core/macro`). Web uses `babel.config.js` (next/babel +
  `@lingui/babel-plugin-lingui-macro`); **mobile uses RUNTIME i18n only**
  (`useT()`/`translate()` from `apps/mobile/src/lib/i18n.ts` — English
  source string mapped to the shared hashed catalog id).
- **Mobile build quirk (why no Babel macro on mobile)**: RN 0.85 ships
  `@babel/core@8`, but a custom mobile `babel.config.js` forced the
  worklets plugin (react-native-worklets/reanimated 4.x) to run under
  Babel 7, producing a bundle that crashed at LAUNCH on real devices
  (release + New Architecture — no error, just instant close; works on the
  CI emulator because Maestro never exercises worklet animations). The fix:
  no custom Babel config on mobile (identical to main) + runtime i18n.
- **Vitest**: the Lingui macro transform is applied in WEB tests via
  `@lingui/vite-plugin` + `@rolldown/plugin-babel`
  (`linguiTransformerBabelPreset`); mobile tests use plain runtime
  `translate()` (no Babel).

## Coverage thresholds

- Every app (`web`, `mobile`, `api`) and `packages/schemas` enforces a **50%**
  coverage threshold in its `vitest.config.ts` (lines/functions/branches/
  statements) — the PR pipeline fails below it.
- **Mobile note**: RN 0.85 ships CJS with Flow syntax, which node's native CJS
  loader bypasses the Vite transform pipeline for (jest-expo is the official
  path for RN component tests, but would add a second test framework for one
  app). Mobile unit coverage therefore targets the pure logic
  (`src/lib/**`, and Phase 3: hooks/store/schemas); mobile UI behaviour is
  covered by the Maestro E2E flows in pr-ci/main-ci.

## Architecture & Patterns

### API (`apps/api`)
- Route handlers in `src/app/api/<resource>/route.ts` re-export handlers from `src/app/lib/handler.ts`.
- **Handler factories**: `typedMutationHandler(actionTable)` (validates `targetUserId` via zod,
  requires Clerk auth, maps errors via `httpError(status, msg)`) and `listHandler` (validates `?type=`
  against `LISTS` in `relationship.lists.ts`).
- **Repository pattern**: `RelationshipRepository` takes `(db, session?)`; all mutations run inside
  `withTransaction` from `lib/db.ts` (single `MongoClient` singleton).
- **Domain model**: `Relationship { fromUserId, toUserId, type, status }` —
  types `follow | friend_request | friend | block`, statuses `pending | accepted | blocked`.
  Follow = immediate `accepted`; friend = bidirectional pair of accepted records; block clears
  bidirectional follow/request/friend first. See comments in `apps/api/src/app/models/relationship.ts`.
- **Phase 1 (social backend)**: users are mirrored from Clerk via the webhook
  `POST /api/webhooks/clerk` (SVIX-verified with `CLERK_WEBHOOK_SECRET`; events
  `user.created/updated/deleted`) into the `users` collection via `UsersRepository`
  (`lib/users.repository.ts`). `lib/migrate.ts` creates the social collections
  (`users`, `follows`, `friendRequests`, `blocks`, `invites`) with indexes shared from
  `packages/schemas` (`*_INDEXES` constants) and optionally drops the legacy
  `relationships` collection. Run it with
  `pnpm --filter api migrate` (scripts/migrate.ts). `scripts/backfill-users.ts`
  (`pnpm --filter api backfill:users`) mirrors ALL existing Clerk users idempotently.
  The legacy `RelationshipRepository` still powers the existing relationships API
  until Phase 2 migrates those routes to the new collections.
- Profiles are **not stored locally**: `lib/clerk.ts` fetches users from Clerk in chunks of 100
  (`enrichUserIds`, `enrichSingleUser`). `apps/api/src/app/api/profiles/route.ts` reuses
  `enrichSingleUser` + adds CORS handling (do NOT duplicate the direct Clerk call).
- Dynamic imports in `listHandler` (`await import('./clerk')`) keep Clerk out of the edge bundle.

### Web (`apps/web`)
- App Router; server components by default; `dynamic = "force-dynamic"` on pages needing auth state.
- Auth: `middleware.ts` protects all routes except `/`, `/sign-in(.*)`, `/sign-up(.*)`.
  `ClerkProvider` in root `layout.tsx` (uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`).
- UI: HeroUI (`@heroui/react`) + Tailwind v4 (`@import "tailwindcss"` + `@import "@heroui/styles"`).
- Theme: HeroUI v3 dark mode is **class-based** — `layout.tsx` toggles `.dark` on `<html>` from
  `prefers-color-scheme` (no forced `className="light"`).
- Route group `(tabs)` hosts Matches / Groups / Organizations / Contacts / Profile.
- **Contacts tab (Phase 2 UI)**: `components/Contacts.tsx` + `app/(tabs)/contacts/page.tsx`
  with 5 tabs (Following / Followers / Friends / Suggestions / Search), presence green-dot
  and follow/unfollow actions, backed by `useContacts` from `packages/shared`
  (`hooks/useContacts.ts`). Client sends a **presence heartbeat** (`POST /api/users/presence`)
  on mount and every 60s while the tab is open.
- **Search (Phase 3 review)**: auto-search with 300ms debounce, minimum 4 characters, clear
  (X) button when there is text — NO submit button. Web uses `lucide-react` icons.
- **Invite a friend (Phase 3 review)**: NO Invites tab — a single `InviteCard` (card + button)
  above the tabs generates a shareable link (no email form). The link ALWAYS points at the
  **API** (the origin that received `POST /api/invites`), never at the web app — preview API
  generates preview links, production generates production links. Claim happens on the public
  claim page HOSTED BY THE API: `apps/api/src/app/invite/[token]/` (server wrapper awaits
  params + client `claim.tsx` with ClerkProvider; signed-out visitors sign in via modal,
  signed-in visitors claim with a Bearer token). Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  on the API deployment (injected in pr-ci via `extra-env`). API: `POST /api/invites` (create),
  `POST /api/invites/claim` (TTL 7gg) → both users become MUTUAL followers/friends. Repo:
  `lib/invites.repository.ts` (token `base64url` 128bit, `expireStale()` per cleanup).
- Client state via `@board-game-organizer/store` (Zustand); server data via
  `@board-game-organizer/query` (TanStack Query — `QueryProvider` uses `useState` to avoid client
  sharing during SSR).

### Mobile (`apps/mobile`)
- Expo Router file-based routing; `(tabs)` group with Matches/Groups/Organizations/Contacts/Profile
  (specular to web). `index.tsx` renders a declarative `<Redirect href="/matches" />` when signed in
  (a `router.replace` effect raced the navigator on cold start → intermittent
  crash when reopening the app while still logged in).
- `global.css` must list `@source "./src"` — with only the heroui-native
  `@source`, Tailwind v4 does not generate the app's own utility classes
  (`flex-1`, `gap-*`, `p-*`) and layouts fall back to RN defaults
  (content appears centered).
- Root `_layout.tsx`: Sentry init (before providers), `GestureHandlerRootView` → `HeroUINativeProvider`
  → `I18nProvider` (defaultI18n) → `ClerkProvider` (with `tokenCache` from `@clerk/expo/token-cache`)
  → `QueryProvider` → `Stack`.
- **Contacts screen (Phase 2 UI)**: `app/(tabs)/contacts.tsx` — same 5 tabs as web; search
  auto (debounce + min 4 chars + clear X with `lucide-react-native`); `InviteCard` above the
  tabs (create + native Share sheet); shared `useContacts`/`useInvites` hooks, presence
  heartbeat; `useT()` runtime i18n (no Babel macro).
- Styling: **heroui-native** components + **uniwind** classes (`global.css` wired in `metro.config.js`
  via `withUniwindConfig`). Use `className`, never raw `style` for colors.
- **Theme**: uniwind auto-follows the device `Appearance`; the Zustand `uiSlice.themePreference`
  (`system|light|dark`) is synced to `Uniwind.setTheme` by `ThemeSync` in the root layout.
  Every text must carry a theme-aware color (`text-foreground`/`text-muted`/`text-danger` or the
  heroui-native `Text` default) — RN's default black text is invisible on dark backgrounds.
- Env access through `app.config.js` `extra` + `Constants.expoConfig.extra`.

### Shared packages
- `store`: Zustand — **local UI state ONLY** (theme preference, open/closed components, active tab,
  multi-step form state, optimistic flags). Never store server data here. Add slices following
  the `createCounterSlice`/`createUiSlice` pattern (`store/src/index.ts`).
- `query`: `createQueryClient()` (staleTime 60s, retry 1) + `QueryProvider` with devtools.
- `shared`: cross-app logic — types (`UserProfile`), API client (`fetchProfile`, `resolveApiUrl`),
  TanStack Query hooks (`useProfileQuery`). Add shared hooks/types here, not per-app.
- Never add runtime code to `biome-config`/`typescript-config` (config-only, `private: true`).

## Data & State Pattern (IMPORTANT)

- **TanStack Query owns all server data**: friends/follow requests, games, profiles, anything from
  the REST API. Mutations update the server and `invalidateQueries` the cache.
- **Zustand owns client UI state only**: active tab, applied filters, open/closed components,
  multi-step form state before submit, transient optimistic UI flags.
- Zustand never mirrors Query data. At most it holds a temporary "optimistic UI flag" for instant
  feedback while a mutation resolves.
- **Cache correctness rules (web AND mobile)**:
  - Every contact list (following/followers/friends/suggestions) is a `useQuery` with a
    `["contacts", <type>, apiUrl, token]` key.
  - Every mutation (follow/unfollow/…) MUST invalidate the whole `["contacts"]` prefix on
    success (`queryClient.invalidateQueries({ queryKey: ["contacts"] })`) so all lists and
    suggestions refetch; NEVER let the UI rely on manual refresh.
  - If a search is active when a follow/unfollow succeeds, re-run it (see `runSearch` +
    `lastSearchQuery` in `packages/shared/src/hooks/useContacts.ts`) so buttons switch
    follow ⇄ unfollow without a user action.
  - Session JWTs rotate: never use a stale `token` snapshot across calls — pass Clerk
    `getToken` into `useContacts` (or `useProfileQuery`-style hooks) so every fetch resolves
    a fresh token; a cached snapshot eventually returns HTTP 401.

## Code Conventions

- **Biome** only: `pnpm lint` = `biome check .`; `pnpm format` = `biome format --write .`.
- Prefer server components; `"use client"` only where interactivity is needed.
- Keep domain logic in `lib/` with thin route handlers.
- Use `import type` for type-only imports (Biome rule `useImportType`).
- Tests: vitest per app (`vitest.config.ts`), currently placeholder tests only.
- **E2E (mobile)**: Maestro flows in `apps/mobile/.maestro/flows/` (`maestro test`), run via the
  `.github/actions/maestro-e2e` composite (which boots the software-rendered emulator via
  `.github/actions/android-emulator`). The E2E runs in **both** pipelines — pr-ci (PR's internal
  APK) and main-ci (the released APK) — never as a standalone workflow. Each run provisions an
  E2E user via the Clerk API (`CLERK_SECRET_KEY` secret), runs
  launch/welcome → login → profile+logout → dark mode, then deletes the user.
- **E2E (web)**: Playwright (`apps/web/e2e`) against the Vercel preview URL. The spec signs in
  with the provisioned Clerk test user using a **Testing Token** (bypasses Clerk bot detection;
  minted by `clerkSetup()` in `apps/web/e2e/global.setup.ts` via `CLERK_SECRET_KEY`) and a
  **server-side sign-in ticket** (`clerk.signIn({ emailAddress })` from `@clerk/testing` — no
  password, no email verification, no cross-domain redirects), then checks profile + logout.
  Requires the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` repo variable (read by `clerkSetup()`).
- **Test-user cleanup**: every E2E run provisions exactly one user (tagged
  `public_metadata.e2e: true`) and the `cleanup-e2e-user` job (pr-ci) / final step (maestro)
  deletes it afterwards — `if: always()`, never blocks the run. A leftover sweep in
  `.github/scripts/cleanup-e2e-clerk-users.sh` also removes orphaned e2e users older than 24h
  (from runs killed mid-flight); the age filter keeps concurrent PR runs safe.

## Versioning & Releases

- **Single unified semver** for the whole product (api + web + mobile), driven by
  **semantic-release** on `main` (see `release.config.mjs`, run via `pnpm release`).
- Bump rules: conventional commits since the last release — breaking change → **major**,
  `feat` → **minor**, `fix`/perf/… → **patch**. Every release generates **`CHANGELOG.md`**,
  syncs `apps/{api,web,mobile}/package.json` + `apps/mobile/app.config.js`
  (`scripts/release/bump-versions.mjs`) and creates the GitHub release `v<version>`.
- PRs do **not** bump: the PR pipeline only creates/updates a **draft prerelease**
  (`v<version>-pr.<PR>`, e.g. `v1.0.0-pr.3`) with the PR changelog + internal APK.
- Release/PR notifications are sent to the **Telegram channel** via
  `scripts/release/telegram-notify.mjs` (HTML parse mode, truncated to 4096 chars).

## Git Workflow (IMPORTANT)

- **main is protected**: no direct pushes/commits to `main` — every change lands via a
  **pull request** with **at least 1 approval** (Alessandro). The branch protection rule
  must be enabled in **Settings → Branches → Add rule → main** (require PR + 1 approval +
  status checks) — requires an admin account.
- **For every feature/fix/docs/CI change: create a new branch** off `main`
  (e.g. `feat/...`, `fix/...`, `ci/...`) and commit (signed, conventional). Push the
  branch and **implement ALL the tasks of the feature before opening a PR**.
- **PRs are opened ONLY when the user explicitly asks for it.** Do NOT open a PR
  proactively: push commits on the branch while implementing, let `branch-ci.yml`
  (fast subset: commitlint, Biome, typecheck, unit + integration tests) validate each
  push, and only when the feature is complete — and the user says so — open the PR to
  `main`. The full pipeline (`pr-ci.yml`) then runs all the heavy gates (builds, Vercel
  previews, Maestro + Playwright E2E) and publishes the draft prerelease + Telegram
  notification.
- **Commit messages must follow Conventional Commits** — enforced by CI via
  **commitlint** (`commitlint.config.mjs`, `@commitlint/config-conventional`). Allowed
  types: `feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert`.
- **All commits are signed** (SSH commit signing). Repo-local config (already set):
  ```bash
  git config user.name "Alessandro Mancini"
  git config user.email "alexemancio1985@gmail.com"   # personal email
  git config user.signingkey /root/.ssh/mancioshell_github.pub
  git config gpg.format ssh
  git config commit.gpgsign true
  ```
  Verify after committing: `git log --show-signature -1` (expect `Good "git" signature for ...`).
- Push command: `git push origin <branch>` (upstream is set after the first push).

## CI/CD (GitHub Actions)

### Branch pipeline — `branch-ci.yml` (every push to a feature branch)

Fast subset of the PR gates, meant for quick feedback while implementing on a branch:
1. **commitlint** — conventional-commit check on the pushed commits
2. **Biome** — `pnpm lint`
3. **Typecheck** — `pnpm typecheck`
4. **Unit tests (vitest)** — mobile/web/api (no coverage)
5. **API integration tests (testcontainers)** — MongoDB in Docker

No builds (mobile/Vercel), no preview deploys, no E2E: those run only when the PR is
opened. Concurrency is per-branch with `cancel-in-progress` so a new push cancels the
previous run.

### PR pipeline — `pr-ci.yml` (every pull request to main)

A single workflow runs ALL quality gates on every PR:
1. **commitlint** — conventional-commit check on the PR commits
2. **Biome** — `pnpm lint` (format + lint, TS/React rules)
3. **Typecheck** — `pnpm typecheck` (tsc --noEmit across apps)
4. **Unit tests (vitest)** — mobile/web/api with **coverage** (`test:coverage`,
   `@vitest/coverage-v8`) → coverage report uploaded as artifact
5. **API integration tests (vitest + testcontainers)** — `pnpm --filter api test:integration`;
   spins up a real MongoDB container (Docker) — the scaffold for the upcoming MongoDB
   integration
6. **Mobile build (internal only)** — `mobile-build` composite action, profile `internal`.
   The APK is rebuilt ONLY when mobile-affecting code changed: `detect-mobile-changes`
   diffs HEAD against the **last green pr-ci run** on the branch (NOT the PR base — the
   base diff always contains historical mobile commits and would rebuild on every run),
   restricted to `apps/mobile`, `packages/{shared,query,store,schemas}`, lockfiles; Maestro
   flows and unit tests are excluded. When nothing changed, the last successful `apk-internal`
   artifact is downloaded and re-uploaded instead of rebuilding.
7. **Build API + Web** — `next build` for both apps
8. **Vercel preview deploys** — api and web deployed to **preview** (never production)
9. **E2E Maestro (mobile)** — boots a software-rendered Android emulator
   (`.github/actions/android-emulator`), installs the PR's internal APK and runs the flows in
   `apps/mobile/.maestro/flows` (welcome → login → profile/logout → dark mode)
10. **E2E Playwright (web)** — `apps/web/e2e` against the **Vercel preview URL**: signed-out
    checks + real sign-in with the provisioned Clerk test user via **Testing Token** and
    **sign-in ticket** (`@clerk/testing`) → profile → logout
11. **Cleanup E2E test users** — deletes the provisioned user (`if: always()`, never blocks)
    and sweeps stale e2e users > 24h (`.github/scripts/cleanup-e2e-clerk-users.sh`)
12. **Draft prerelease + Telegram** — if ALL gates pass, a **draft prerelease** is created/
    updated (tag `v<version>-pr.<PR>`, e.g. `v1.0.0-pr.3`) with the **PR changelog**
    (from conventional commits `base...head`), the **internal APK** attached and the
    **web/api preview links** in the body. Every PR update refreshes the draft (new APK +
    changelog). Last step: a **Telegram notification** with changelog + preview links +
    PR APK (only when the whole pipeline passed)

E2E test users are provisioned per-run via the Clerk API (`CLERK_SECRET_KEY` secret) and deleted
at the end of the run (cleanup job/script above) — they never accumulate.

### Main pipeline — `main-ci.yml` (push/merge to main)

After the approved PR is merged to main, `main-ci.yml` runs:
1. **semantic-release** (`.github/../release.config.mjs`, `pnpm release`) — analyzes the
   conventional commits since the last release and computes the next **semver**
   (breaking → major, `feat` → minor, `fix` → patch), then:
   - generates **`CHANGELOG.md`** from the commit messages
   - syncs the version in `apps/{api,web,mobile}/package.json` and
     `apps/mobile/app.config.js` (`expo.version`) via `scripts/release/bump-versions.mjs`
   - commits the bump (`chore(release): vX.Y.Z [skip ci]`) and creates the
     **GitHub release `v<version>`** with the changelog in the body
2. **Build APK (internal)** — `mobile-build` (sync al commit di bump: l'APK porta il
   versionName corretto) + **attach to the release** con nome pulito
   (`board-game-organizer-<version>-internal.apk`)
3. **Maestro E2E** — emulatore software (`.github/actions/maestro-e2e`) sull'**APK rilasciato**
4. **Playwright E2E** — test web contro **produzione** (sign-in autenticato con testing token)
5. **Vercel production deploys** — api + web (`vercel-deploy`, production: true)
6. **Telegram notification** — changelog + links (APK → release, web, api production)

The release commit carries `[skip ci]`, so the workflow does not re-trigger on its own bump.

### Development APK — `mobile-development.yml` (manual, main only)

`workflow_dispatch` **only from main** (guard `github.ref == 'refs/heads/main'`): builds the
**development** profile APK and **uploads it to the latest release** as an additional asset.

### Other workflows

*(none — every quality gate lives in `pr-ci.yml` / `main-ci.yml`; no standalone workflows)*

### Composite actions (`.github/actions/`)

`setup-pnpm` (Node 26, pnpm 11.6.0, `--frozen-lockfile`), `vercel-deploy` (preview/production), `mobile-build`
(local `eas build --local`, ONE profile per invocation; frees ~7GB of toolchains, caches
`~/.eas-build-local` and `~/.gradle`), `android-emulator` (software-rendered emulator + script
runner), `maestro-e2e` (install APK + run the Maestro flows), `provision-e2e-user` (Clerk
test user via the Backend API), `publish-draft-release` (create/update the PR draft
prerelease + attach APK), `telegram-notify` (send the release message to the channel).
⚠️ GitHub can only resolve **local** actions after `actions/checkout` has run: every job must
start with `actions/checkout@v4` before the first `uses: ./.github/actions/...` (a local
action as the first step fails with "Can't find action.yml").

- If you change dependencies, keep `pnpm-lock.yaml` in sync (run `pnpm install`, not `pnpm install --lockfile-only` when the graph changes).
- The repo is **public** (Actions are free). Branch protection on `main` must be enabled by an
  admin: Settings → Branches → Add rule → `main` → require a PR with 1 approving review +
  status checks.

## Board automation — pi-board-agent (autonomous GitHub Project executor)

A separate pi extension ([mancioshell/pi-board-agent](https://github.com/mancioshell/pi-board-agent))
watches the project board and does the whole loop autonomously: story refine →
sub-issue tasks → implementation in git worktrees → cumulative PR per plan →
watchdog (CI fixes + mentions) → Telegram notifications.

### Config

Local, **gitignored**: `.pi/board-agent.yml` (a full example is already in place in this
repo). Key sections: `project` (owner + project number), `columns` (the 6 Status options:
Backlog / Ready / In Progress / Needs Design / Review / Done), `status_field` / `plan_field`
/ `type_field` ("Type" is reserved in Projects v2 → "Kind" with Story|Task), `models`
(builder/refine/watch — default `deepseek-v4-flash-0731`), `context`, `refine`, `watchdog`,
`telegram`, `auto_start` (container).

### Initialize the GitHub Project

`/board-agent init-project` creates the standard fields from the config: **Status**
single-select (the 6 columns), **Kind** (Story|Task), **Plan** (text) + a Board view.

### gh token (permissions needed)

For both `init-project` and the daily loop the token needs:

- **Fine-grained PAT** (recommended):
  - Repository access on the **target repo** (BGOrganizer/board-game-organizer):
    `Issues: Read and write`, `Pull requests: Read and write`,
    `Contents: Read and write` (branch pushes), `Actions: Read` (check-runs/logs),
    `Metadata: Read`
  - **Organization permissions (BGOrganizer): `Projects: Read and write`** — this is the
    one `init-project` needs to create fields/options/view. "All repositories" does NOT
    grant it.
- **Classic PAT** alternative: scopes `repo` + `project`.

The token value goes in the environment (container `GH_TOKEN` / `gh auth login`), never in
the repo.

### Run

See pi-board-agent `docs/docker.md`: the board-agent runs in its own Docker container
(pi headless + `auto_start: true`), with the repo mounted at `/workspace`. Control via
GitHub comments (`@<bot-login> status|stop|refine <plan>`) or `docker compose exec`.

## UX & UI Rules (da ricordare SEMPRE)

- **Chip/tab selezionata (mobile)**: le chip della tab bar devono riflettere la
  selezione corrente (stato visivo attivo/non attivo). Su web funziona; su
  mobile va corretto ovunque (non solo Contacts — tutte le tab).
- **Loading**: usare componenti **skeleton** al posto degli spinner, per
  TUTTE le pagine/tab (web + mobile), non solo le nuove.
- **Titolo di sezione**: NON mettere il titolo della pagina/sezione nelle
  pagine dei tab — la sezione è già indicata dal menu principale (tab bar).
  Vale per web e mobile e per tutte le implementazioni future.
- **Users/search**: gli utenti compaiono in Contacts solo se sono nella
  collection `users` (webhook Clerk o backfill). Un account Google in Clerk
  NON basta: serve `pnpm --filter api backfill:users` (o webhook
  configurato con CLERK_WEBHOOK_SECRET).

## Lessons Learned (errori passati — NON ripeterli)

- **`NEXT_PUBLIC_*` non viene inlined da Next.js nei workspace packages**
  (node_modules): le env vanno lette nei file del progetto (es.
  `apps/web/src/components/*.tsx`) e passate esplicitamente agli helper
  condivisi. Leggerle dentro `packages/shared` produce `undefined` nel
  browser. (`EXPO_PUBLIC_*` invece funziona ovunque.)
- **Il bypass Vercel è un query param, NON un header**: i preflight CORS
  (OPTIONS) non trasportano mai header custom → header-based bypass fallisce
  con "Redirect is not allowed for a preflight request". Usare
  `withProtectionBypass()` che appende `?x-vercel-protection-bypass=…`
  all'URL (l'URL fa parte del preflight).
- **Skeleton**: heroui-native Skeleton non ha dimensione intrinseca (nasconde
  i children) → sempre `style={{width,height,borderRadius}}` espliciti, e le
  righe/figure devono avere `width: "100%"` nel parent con `alignItems`
  stretch (flex-start li restringe).
- **Layout mobile**: NON dipendere dalle classi Tailwind/uniwind per la
  struttura (flex-1, gap-2, mb-3, flex-row) — potrebbero non essere generate
  a runtime. Usare style object espliciti per il layout strutturale.
- **Token Clerk ruota**: mai riusare uno snapshot di `getToken()` catturato
  al mount — ogni fetch risolve un token FRESCO (`getToken` passato a
  `useContacts`). Uno snapshot vecchio → 401 dopo poco.
- **DELETE con body**: il server deve parsare il body in modo difensivo
  (`req.text()` + try/catch JSON → 400) e il client invia `targetUserId`
  anche su DELETE; `req.json()` diretto su body assente → 500.
- **Invalidazione cache**: ogni mutation (follow/unfollow/…) deve
  invalidare il prefisso `["contacts"]` su success (refetch di tutte le
  liste + re-run della ricerca attiva, così i bottoni Follow ⇄ Unfollow si
  aggiornano da soli). Stato follow sempre coerente tra sezioni.
- **YAML folded block `>-` unisce le righe**: per multi-line env usare il
  literal block `|` (es. `extra-env`), altrimenti la seconda riga sparisce.
- **GitHub Actions API**: `conclusion=success` NON filtra nei query param di
  `actions/runs` → va filtrato in jq. Il token `GH_TOKEN` va esplicitato
  come env per `gh api`.
- **detect-mobile-changes**: il diff va fatto contro l'ultimo run verde sul
  branch (non contro la base PR — quello include sempre i commit storici e
  rebuilda sempre).
- **Stringhe i18n mobile-only**: Lingui extract vede solo le stringhe web
  (macro). Le stringhe usate SOLO nel mobile con `t("...")` runtime non
  entrano nel catalogo: aggiungerle a mano in `messages/{en,it}.po` e
  rilanciare `pnpm i18n:compile` (il reverse index `idByEnglish` le mappa).
- **Icone**: usare `lucide-react` (web) e `lucide-react-native` (mobile) —
  già installate. Mai importare icone da altri posti.
- **Link di invito = API corrente**: il link deve puntare SEMPRE all'API che
  ha generato l'invito (`new URL(request.url).origin` in `POST /api/invites`) —
  preview API → link preview, production → link production. Mai al web app e
  mai hardcodare l'URL di produzione.
- **HeroUI v3 (`@heroui/react` ^3) usa l'API react-aria-components**: niente
  `startContent/endContent` su DropdownItem (icona dentro i children),
  niente `variant="light"/"flat"/"solid"` né `color="danger"` sui Button
  (usare `variant="ghost"/"danger"`), niente `ModalContent`/`size`:
  `Modal` è composito (`.Backdrop/.Container/.Dialog/.Header/.Body/.Footer`).
  Controllare i `.d.ts` in `node_modules/@heroui/react/dist/components/*`
  prima di usare un componente nuovo.
- **I mock di `useContacts` nei test vanno aggiornati a ogni nuova
  mutation**: `isBusy` legge `follow/unfollow/block/unblock.isPending` — un
  mock vecchio (senza `block`/`unblock`) fa crashare i tab test con
  "Cannot read properties of undefined (reading 'isPending')".
- **Suggerimenti = contatti salvati su DB**: i suggerimenti non sono più
  utenti random — il mobile legge la rubrica (permesso esplicito,
  `expo-contacts`), invia le email a `POST /api/contacts/sync`, l'API fa
  match con gli utenti registrati e persiste SOLO i match nella collection
  `contactLinks` (replace semantics). `GET /api/users/suggestions` legge da
  lì e ritorna `hasContacts` per guidare CTA/empty state. Le stringhe
  mobile-only vanno aggiunte a mano nei .po (la macro Lingui non vede il
  mobile runtime `useT`).
- **HeroUI v3 Modal è inaffidabile per dialog controllati**: il composito
  (DialogTrigger/Overlay) mostrava backdrop senza dialog, richiedeva doppio
  click e non chiudeva l'overlay. Usare un dialog portale custom
  (`createPortal` + div fisso, chiude su Cancel/Escape/backdrop) —
  deterministico.
- **Dropdown HeroUI v3**: `MenuItem.onAction` è `() => void` (nessun id) →
  `onAction` a livello di Menu non scatta. Attaccare `onAction` a OGNI
  `Dropdown.Item` direttamente. Il `Dropdown.Trigger` è un Button react-aria:
  deve contenere un Button cliccabile (un'icona nuda non è cliccabile).
- **Interpolazione i18n runtime web**: `t\`Block ${name}?\`` via macro
  runtime cerca l'id letterale interpolato → hash fallback (es. "vPh7mM").
  Usare `i18n.t({ id: "Block {0}?", values: { name } })` con `i18n` da
  `@lingui/core` (NON `useLingui` core — causa timeout nei test).
- **Blocco (policy finale)**: al blocco il FOLLOW DEL BLOCKANTE verso il
  bloccato viene eliminato (unidirezionale), mentre il follow del bloccato
  verso il bloccante resta — così l'utente bloccato non si accorge di nulla e
  allo sblocco l'asimmetria è: lui segue me, io non seguo lui. Si eliminano
  solo le friend request pendenti. Test unit + integration coprono l'edge
  b→a sopravvissuto.

## CI Rules (trigger intelligenti)

- **E2E per OGNI funzionalità**: ogni feature implementata deve avere copertura
  e2e — Playwright (web) E e Maestro (mobile). Non basta il test unit. Aggiungere
  i casi e2e nello stesso commit della feature (es. follow/unfollow, block,
  search, inviti). I flussi social usano 2 utenti E2E: l'actor (`E2E_EMAIL`) e
  il target (`E2E_EMAIL_2`) provisionati dal CI. Il target viene mirrorato nella
  collection `users` dal webhook Clerk user.created — il test attende con poll
  lungo per tollerare la latenza del webhook.

- **pr-ci build mobile**: parte SOLO se modificati `apps/mobile` o i package
  correlati (shared/query/store/schemas) + lockfile. NON deve triggerare per
  i file `.maestro/flows/*` (nuovi flow Maestro senza cambio codice non
  devono rifare la build APK).
- **Unit test**: se aggiunti/modificati SOLO test (senza cambio codice app),
  NON rieseguire il rebuild mobile.
- **mobile-e2e.yml** (workflow singolo per test veloci): builda APK
  (profilo **internal**, NON development) e runna i flow Maestro. Serve per
  iterare velocemente senza tutta la pr-ci.

## Lessons Learned (rilascio + CI, turno main-ci #9)

- **main-ci build APK**: `timeout-minutes` deve essere 180, NON 90. Una
  `eas build --local` fresca (cache invalidata perché il bump semantico tocca
  `apps/mobile/package.json`) dura ~88-90 min sulle runner GitHub: a 90 min il
  job veniva cancellato durante `packageRelease`. Su pr-ci la build veniva
  RIUSATA (zero diff mobile) → il timeout non si era mai visto.
- **Tag orfani da publish fallito**: se il publish job fallisce DOPO aver
  creato il tag (release non creata), semantic-release considera la versione
  già rilasciata → "no release" → `published=false` → build skippata. Se il
  bump è committato ma il tag non esiste, revertare il bump e cancellare il
  tag prima di pushare nuovi fix, così semantic-release rigenera il bump.
- **`[skip ci]` nel messaggio**: un commit il cui subject contiene
  `[skip ci]` (es. `git revert` di un commit `chore(release): … [skip ci]`)
  NON triggera i workflow. Verificare il subject del commit prima del push.
- **pr-ci needs dei job E2E**: `e2e-maestro` e `e2e-playwright` usano
  `needs.provision.outputs.*` — `provision` DEVE essere nella loro lista
  `needs`, altrimenti `E2E_EMAIL`/`E2E_EMAIL_2` sono vuoti e i test
  (sign-in/profile/logout, contacts) vengono SILENZIOSAMENTE skippati →
  pr-ci falsi verdi. Controllare il junit (skipped > 0) se i test non girano.
- **Logout sempre raggiungibile**: il bottone Logout non deve dipendere dal
  caricamento del profilo (se l'API profile fallisce con 401, il logout
  spariva e l'E2E andava in timeout sul click). Logout = azione globale,
  renderizzarlo anche nel ramo errore.

## Lessons Learned (due ambienti Clerk — preview vs production)

- Esistono DUE istanze Clerk: **preview/test** (`pk_test_…singular-marten-79`,
  chiave `CLERK_SECRET_KEY`) e **production/live** (`pk_live_…`,
  `CLERK_SECRET_KEY_PRODUCTION`). Il GitHub secret `CLERK_SECRET_KEY` è quella
  di preview: usarla verso l'API production dà 401 (mismatch istanza).
- **pr-ci / preview**: tutto su `CLERK_SECRET_KEY` (test) — preview deploy usa
  l'istanza test.
- **main-ci / production**: i job E2E (provision, mirror sync-user, testing
  token, cleanup) usano `CLERK_SECRET_KEY_PRODUCTION` (live) — il Bearer del
  sync-user deve combaciare con l'env `CLERK_SECRET_KEY` di Vercel api
  production (attualmente la live).
- Coerenza richiesta: web production (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` su
  Vercel) e APK (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` vars GitHub) devono usare
  la pk dell'istanza GIUSTA, altrimenti i token emessi dal frontend non
  vengono verificati dall'API (profile → 401).
- I tag orfani da release fallite vanno cancellati insieme al revert del bump
  (vedi lezione precedente), altrimenti semantic-release considera la
  versione già rilasciata.

## Lessons Learned (migrazione domini custom production — run #27-#45)

- **Cambio dominio Vercel ≠ aggiornamento env**: spostando web/api da
  `web-rosy-phi-82`/`api-chi-two-97.vercel.app` ai custom domain, le env
  `NEXT_PUBLIC_API_URL` (Vercel web) e `EXPO_PUBLIC_API_URL` (vars GitHub)
  restavano ai vecchi alias eliminati → la web puntava a un host morto.
  Sintomo: contacts E2E "No users found" (il fetch fallisce con "Failed to
  fetch" — la UI maschera l'errore come lista vuota; `page.on("request")`
  mostra l'URL reale). Fix: `extra-env` nel main-ci (deterministico) +
  vars GitHub aggiornati.
- **"Failed to fetch" nel browser senza risposta catturabile** =
  l'host è irraggiungibile/CORS bloccato. `page.on("request")` rivela l'URL
  che la UI chiama davvero (a differenza di `response`, che non scatta se
  la fetch muore in rete).
- **Falso positivo test profile**: `getByText("E2E Test")` è il NOME
  UTENTE nell'header, non i dati del profilo — il test 4 passa anche se
  il fetch `/api/profiles` fallisce. Assertion debole.
- **Il dialog di blocco web**: `getByRole("dialog")` può risolvere 2
  elementi (il kebab dropdown lascia un role=dialog residuo) → usare
  `.last()` nel test.
- **Debug E2E efficace**: log nel componente (console del browser) +
  `page.on("console")` nel test + `page.on("request")` per l'URL reale.
  Ogni run di debug ha isolato un pezzo: token → mutate → URL.
