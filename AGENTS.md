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
```

## Environment Variables

No committed `.env*` files — copy each app's `.env.example` (`apps/web/.env.example`, `apps/api/.env.example`, `apps/mobile/.env.example`) into that app as `.env.local` (web/api) or `.env` (mobile).

| App | Variable | Notes |
|-----|----------|-------|
| web | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| web | `NEXT_PUBLIC_API_URL` | defaults to `http://localhost:4000`; prod → `https://api-chi-two-97.vercel.app` |
| api | `CLERK_SECRET_KEY` | backend calls to Clerk API |
| api | `MONGODB_URI` / `MONGODB_DB_NAME` | MongoDB (needs transactions → replica set) |
| api | `ALLOWED_ORIGINS` | comma-separated CORS allowlist (dev allows all) |
| mobile | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | via `app.config.js` `extra` |
| mobile | `EXPO_PUBLIC_API_URL` | read from `Constants.expoConfig.extra.apiUrl`; prod → the Vercel API URL |

**Production deployments**: web → `web-rosy-phi-82.vercel.app`, api → `api-chi-two-97.vercel.app`.
CI relies on repo **secrets**: `EXPO_TOKEN`, `VERCEL_TOKEN` (admin), `VERCEL_ORG_ID`,
`VERCEL_WEB_PROJECT_ID`, `VERCEL_API_PROJECT_ID`, `CLERK_SECRET_KEY` (used by Maestro E2E to
provision a test user via the Clerk API and by Playwright E2E for the testing token +
user cleanup), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (release notifications on the
Telegram channel), `RELEASE_PAT` (admin PAT usato da main-ci per il push del bump di
semantic-release su `main` protetta). Repo **variables** (baked into mobile builds / E2E):
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_API_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web, required by the Playwright `clerkSetup()`).

Note: root `.env*` files are gitignored; the API's `db.ts` throws if `MONGODB_URI` is missing, so the API can't start without it.

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
- Client state via `@board-game-organizer/store` (Zustand); server data via
  `@board-game-organizer/query` (TanStack Query — `QueryProvider` uses `useState` to avoid client
  sharing during SSR).

### Mobile (`apps/mobile`)
- Expo Router file-based routing; `(tabs)` group with Matches/Groups/Organizations/Contacts/Profile
  (specular to web). After sign-in `index.tsx` renders `<Redirect href="/(tabs)" />` (never a
  `Stack.Screen` outside a Layout — that crashes the app).
- Root `_layout.tsx`: Sentry init (before providers), `GestureHandlerRootView` → `HeroUINativeProvider`
  → `ClerkProvider` (with `tokenCache` from `@clerk/expo/token-cache`) → `QueryProvider` → `Stack`.
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
6. **Mobile build (internal only)** — `mobile-build` composite action, profile `internal`
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
