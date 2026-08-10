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
provision a test user via the Clerk API). Repo **variables** (baked into mobile builds):
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_API_URL`.

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
- **E2E (mobile)**: Maestro flows in `apps/mobile/.maestro/flows/` (`maestro test`). The CI
  workflow `maestro.yml` boots a software-rendered Android emulator
  (`.github/actions/android-emulator` composite action), installs the latest internal APK from
  GitHub Releases, provisions an E2E user via the Clerk API (`CLERK_SECRET_KEY` secret) and runs
  the flows: launch/welcome → login → profile+logout → dark mode. Run manually via
  `workflow_dispatch`; also `android-emulator.yml` is the diagnostic smoke test (screenshots +
  logcat artifacts).

## Git Workflow (IMPORTANT)

- **Commit messages must follow Conventional Commits** — enforced by CI
  (`.github/actions/conventional-commits` composite action). Allowed types:
  `feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert`.
  Examples: `feat(api): add groups endpoint`, `fix(mobile): header spacing`, `docs: update README`.
- **All commits are signed** (SSH commit signing). Repo-local config (already set):
  ```bash
  git config user.name "Alessandro Mancini"
  git config user.email "alexemancio1985@gmail.com"   # personal email
  git config user.signingkey /root/.ssh/mancioshell_github.pub
  git config gpg.format ssh
  git config commit.gpgsign true
  ```
  Verify after committing: `git log --show-signature -1` (expect `Good "git" signature for ...`).
- Workflow: branch off `main` → commit (signed, conventional) → `git push origin <branch>`
  → open PR. Direct pushes to `main` trigger production deploys (Vercel + mobile
  APK build & draft release) — prefer PRs.
- Push command for the current branch: `git push origin <branch>`, or `git push` if upstream is set.

## CI/CD (GitHub Actions)

- Path-filtered per-app pipelines: `web.yml` / `api.yml` (tests + Vercel
  preview/production) and `mobile.yml` (checks + APK build & draft release) —
  the only workflows visible in the Actions tab.
- All reusable pieces are **composite actions** in `.github/actions/`
  (invisible in the Actions tab by design): `setup-pnpm`, `conventional-commits`,
  `test`, `vercel-deploy`, `mobile-build`. ⚠️ Local actions require
  `actions/checkout` **before** the first `uses: ./.github/actions/...` step in
  each job (the runner loads action metadata from the workspace at job start).
- **Mobile APK builds are local** (`eas build --local` on the runner — no EAS
  cloud credits needed), following the pipeline from
  TanayK07/expo-react-native-cicd. The `mobile-build` composite action builds
  ONE profile per invocation (`development` dev client or `internal` release
  from `apps/mobile/eas.json`); `mobile.yml` runs it for **both profiles in
  parallel** via a matrix. The action installs workspace deps (EAS requires
  `node_modules` to resolve config plugins and check `expo-dev-client`),
  frees ~7GB of preinstalled toolchains (keeping `/usr/local/lib/android` for
  NDK/CMake), caches `~/.eas-build-local` and `~/.gradle`, and exposes
  `version` / `build-number` / `artifact-name` / `artifact-path` outputs.
  Version comes from `app.config.js` (`expo.version`).
- Both APKs are uploaded as build artifacts and attached to a **draft GitHub
  Release** by the `release` job of `mobile.yml`
  (`softprops/action-gh-release`), named
  `board-game-organizer-v<version>-<build-number>`. Trigger: push to main or
  manual dispatch → always builds both profiles.
- Setup via `.github/actions/setup-pnpm` (Node 26, pnpm 11.6.0,
  `--frozen-lockfile`).
- If you change dependencies, keep `pnpm-lock.yaml` in sync (run `pnpm install`, not `pnpm install --lockfile-only` when the graph changes).
