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
  web/      Next.js 16 (App Router, React 19) + Tailwind v4 + HeroUI + Clerk   → port 3000
  api/      Next.js 16 route handlers + Clerk + MongoDB (raw driver, no ODM) + zod → port 4000
  mobile/   Expo SDK 56 (RN 0.85, Expo Router, dev client) + Clerk + Sentry + uniwind (RN Tailwind)
packages/
  store/              @board-game-organizer/store   Zustand store, slice pattern
  query/              @board-game-organizer/query   TanStack Query provider + client factory
  biome-config/       @board-game-organizer/biome-config
  typescript-config/  @board-game-organizer/typescript-config (base / next / expo)
```

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
| web | `NEXT_PUBLIC_API_URL` | defaults to `http://localhost:4000` |
| api | `CLERK_SECRET_KEY` | backend calls to Clerk API |
| api | `MONGODB_URI` / `MONGODB_DB_NAME` | MongoDB (needs transactions → replica set) |
| api | `ALLOWED_ORIGINS` | comma-separated CORS allowlist (dev allows all) |
| mobile | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | via `app.config.js` `extra` |
| mobile | `EXPO_PUBLIC_API_URL` | read from `Constants.expoConfig.extra.apiUrl`; use LAN IP (e.g. `http://192.168.1.10:4000`) for physical devices |
| mobile | `EXPO_PUBLIC_SENTRY_DSN` | optional |

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
  (`enrichUserIds`, `enrichSingleUser`). `apps/api/src/app/api/profiles/route.ts` is a simpler
  direct-Clerk-API variant with CORS handling — beware of duplication between the two.
- Dynamic imports in `listHandler` (`await import('./clerk')`) keep Clerk out of the edge bundle.

### Web (`apps/web`)
- App Router; server components by default; `dynamic = "force-dynamic"` on pages needing auth state.
- Auth: `middleware.ts` protects all routes except `/`, `/sign-in(.*)`, `/sign-up(.*)`.
  `ClerkProvider` in root `layout.tsx` (uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`).
- UI: HeroUI (`@heroui/react`) + Tailwind v4 (`@import "tailwindcss"` + `@import "@heroui/styles"`).
- Route group `(tabs)` hosts Matches / Groups / Organizations / Contacts.
- Client state via `@board-game-organizer/store` (Zustand); server data via `@board-game-organizer/query` (TanStack Query — `QueryProvider` uses `useState` to avoid client sharing during SSR).

### Mobile (`apps/mobile`)
- Expo Router file-based routing; `(tabs)` group with Matches/Groups/Organizations/Profile.
- Root `_layout.tsx`: Sentry init (before providers), `GestureHandlerRootView` → `HeroUINativeProvider`
  → `ClerkProvider` (with `tokenCache` from `@clerk/expo/token-cache`) → `Stack`.
- Styling: **uniwind** (Tailwind-like runtime for RN) — `global.css` entry wired in `metro.config.js`
  via `withUniwindConfig`; components use `className`, not `style`.
- Env access through `app.config.js` `extra` + `Constants.expoConfig.extra`.

### Shared packages
- `store`: add slices following `createCounterSlice` pattern (see `store/src/index.ts` example).
- `query`: `createQueryClient()` (staleTime 60s, retry 1) + `QueryProvider` with devtools.
- Never add runtime code to `biome-config`/`typescript-config` (config-only, `private: true`).

## Code Conventions

- **Biome** only: `pnpm lint` = `biome check .`; `pnpm format` = `biome format --write .`.
- Prefer server components; `"use client"` only where interactivity is needed.
- Keep domain logic in `lib/` with thin route handlers.
- Use `import type` for type-only imports (Biome rule `useImportType`).
- Tests: vitest per app (`vitest.config.ts`), currently placeholder tests only.

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
  `test`, `vercel-deploy`, `mobile-build`.
- **Mobile APK builds are local** (`eas build --local` on the runner — no EAS
  cloud credits needed). The `mobile-build` composite action builds the APK with
  the `internal` or `development` profile from `apps/mobile/eas.json`, caches
  `~/.eas-build-local`, and exposes `version` / `build-number` / `artifact-path`
  outputs. Version comes from `app.config.js` (`expo.version`).
- APKs are uploaded as **draft GitHub Releases** by `mobile.yml`
  (`softprops/action-gh-release`), named
  `board-game-organizer-v<version>-<build-number>-<type>`
  (type = internal or development). Trigger: push to main → internal; manual
  dispatch → choose internal or development.
- Setup via `.github/actions/setup-pnpm` (Node 26, pnpm 11.6.0,
  `--frozen-lockfile`).
- If you change dependencies, keep `pnpm-lock.yaml` in sync (run `pnpm install`, not `pnpm install --lockfile-only` when the graph changes).
