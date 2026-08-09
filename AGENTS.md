# AGENTS.md

Guidance for AI agents and contributors working in this repository. Read this
before making changes.

## Project Overview

**Board Game Organizer** — a multi-platform app for tracking and organizing
board game sessions, collections, and player statistics, with game groups,
match scheduling, and ELO rankings.

It is a **pnpm + Turborepo monorepo** with three deployable apps (web, api,
mobile) and shared packages:

- **apps/web** — Next.js 16 frontend (App Router, React 19) — port **3000**
- **apps/api** — Next.js 16 API (Route Handlers) + MongoDB — port **4000**
- **apps/mobile** — Expo SDK 56 (React Native 0.85, Expo Router) — dev client
- **packages/** — shared store (Zustand), query (TanStack Query), Biome and
  TypeScript configs

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces (pnpm 11.6.0) |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS v4, HeroUI |
| API | Next.js 16 Route Handlers, MongoDB driver (no ODM), Zod |
| Mobile | Expo SDK 56, React Native 0.85 (new arch), Expo Router, heroui-native, uniwind, Sentry |
| Auth | Clerk (web: `@clerk/nextjs`, mobile: `@clerk/expo`) |
| State / Data | Zustand (`@board-game-organizer/store`), TanStack Query (`@board-game-organizer/query`) |
| Quality | Biome (lint + format), Vitest, TypeScript strict, Turbo |

## Repository Layout

```
.
├── apps/
│   ├── web/        # Next.js frontend, port 3000, src/ alias @/
│   ├── api/        # Next.js API server, port 4000, src/ alias @/
│   └── mobile/     # Expo app (dev-client), src/ alias @/
├── packages/
│   ├── store/              # Zustand store (slice pattern)
│   ├── query/              # TanStack Query client factory + provider
│   ├── biome-config/       # Shared Biome config
│   └── typescript-config/  # Shared TS configs (base / next / expo)
├── .github/
│   ├── actions/setup-pnpm/ # Composite action (Node 26, pnpm 11.6.0)
│   └── workflows/          # web.yml, api.yml, mobile.yml + reusable workflows
├── turbo.json
├── pnpm-workspace.yaml
└── package.json            # packageManager: pnpm@11.6.0
```

## Commands

Run from the repo root:

```bash
pnpm install          # install all workspace deps
pnpm dev              # run ALL apps (turbo) — web :3000, api :4000, expo
pnpm build            # production build (web, api; mobile via EAS)
pnpm lint             # biome check in every app
pnpm typecheck        # tsc --noEmit in every app
pnpm test             # vitest in every app (per-app: pnpm --filter <app> test)
pnpm format           # biome format --write .
pnpm clean            # remove caches/build output
```

Filter to one app: `pnpm --filter web dev`, `pnpm --filter api test`, etc.

## Environment Variables

There is **no env setup in git** — copy the `.env.example` in each app:

- **Web** (`apps/web/.env.local`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`)
- **API** (`apps/api/.env.local`): `CLERK_SECRET_KEY`, `MONGODB_URI`,
  `MONGODB_DB_NAME`, `ALLOWED_ORIGINS` (comma-separated, optional)
- **Mobile** (`apps/mobile/.env`): `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN` (optional)

The API is unusable without MongoDB + Clerk. Auth-protected endpoints return
401 otherwise.

## Code Conventions

- **Commits**: Conventional Commits, **enforced by CI** (reusable
  `conventional-commits` workflow). Allowed types:
  `feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert`.
- **Lint/format**: Biome only (no ESLint/Prettier). Shared config in
  `packages/biome-config`; root `biome.json` extends it. Key style: 2-space
  indent, 100 col width, double quotes, semicolons, trailing commas, import
  organizing enabled.
- **TypeScript**: strict; shared configs in `packages/typescript-config`
  (`base.json`, `next.json`, `expo.json`).
- **Tests**: Vitest, one config per app (`vitest.config.ts`), currently
  placeholder tests in `src/app/__tests__/`.
- Import path alias `@/*` → `src/*` in web, api, mobile.

## App-Specific Patterns

### API (`apps/api`) — Next.js Route Handlers

- Auth via Clerk: `clerkMiddleware()` in `src/proxy.ts`; handlers read
  `auth()` from `@clerk/nextjs/server`. The Clerk `userId` **is** the user
  identity — there is no local users table; profiles are enriched from the
  Clerk API (`src/app/lib/clerk.ts`).
- **Data access**: raw MongoDB driver (no ODM). Singleton client in
  `src/app/lib/db.ts`; use `withTransaction(fn)` for multi-operation writes.
- **Repository pattern**: `RelationshipRepository` (`relationship.repository.ts`)
  takes `(db, session?)` so the same methods work inside and outside
  transactions. It's the only consumer of collections; model types live in
  `src/app/models/relationship.ts`.
- **Route factory pattern**: `src/app/lib/handler.ts` exports
  `typedMutationHandler(actionTable)` and `listHandler`. Routes are thin —
  see `src/app/api/relationships/route.ts` (GET/POST/PATCH/DELETE mapped to
  handlers, action selected by `?type=` query param). Actions live in
  `relationship.actions.ts` (CREATE/REMOVE/UPDATE tables); list types in
  `relationship.lists.ts`.
- **Errors**: throw `httpError(status, message)`; handlers return
  `{ error }` JSON with the status.
- **Domain model** (relationships): types `follow | friend_request | friend |
  block` with statuses `pending | accepted | blocked`; friendships and
  follows are stored bidirectionally. Keep this semantics when extending.

### Web (`apps/web`) — Next.js App Router

- Server components by default; mark interactive components `"use client"`.
- **Auth**: Clerk; `src/middleware.ts` protects everything except `/`,
  `/sign-in(.*)`, `/sign-up(.*)`.
- **UI**: HeroUI (`@heroui/react`) + Tailwind CSS v4 — `globals.css` imports
  `tailwindcss` and `@heroui/styles`. Theme tokens via HeroUI classes
  (`bg-background`, `text-foreground`, `bg-content1`, …).
- **Routing**: `(tabs)` route group → matches / groups / organizations /
  contacts. Root layout wraps children in `ClerkProvider`.
- **State/data**: `@board-game-organizer/store` (Zustand) for client state;
  `@board-game-organizer/query` (TanStack Query) for server state —
  `QueryProvider` exists but is **not yet mounted** in the layout.
- Web fetches the API directly (`fetch(apiUrl)` with a Clerk bearer token,
  see `components/Profile.tsx`); CORS is handled by the API.

### Mobile (`apps/mobile`) — Expo

- Expo Router file-based routing: root `src/app/_layout.tsx` wires providers
  (Sentry → GestureHandlerRootView → HeroUINativeProvider → ClerkProvider
  with `tokenCache`), `(tabs)` group for main navigation.
- **Styling**: uniwind (Tailwind-like classes in RN) — `global.css` is the
  CSS entry, wired via `withUniwindConfig` in `metro.config.js`.
- **Config**: `app.config.js` reads `EXPO_PUBLIC_*` vars; API base URL comes
  from `Constants.expoConfig.extra.apiUrl` with a localhost fallback.
- Runs via **development client** (`pnpm --filter mobile dev`), not Expo Go.
  EAS profiles in `eas.json` (development / preview / production).

## Shared Packages

- **`@board-game-organizer/store`** — Zustand, slice pattern: each slice is a
  `createXSlice` factory; the `AppStore` type in `index.ts` is the union of
  slices. Add a slice by extending the type and spreading it into `create()`.
- **`@board-game-organizer/query`** — `createQueryClient()` (staleTime 60s,
  retry 1) + `QueryProvider` (`'use client'`, `useState`-memoized to avoid
  sharing the client across SSR requests).
- **`@board-game-organizer/biome-config`** / **`typescript-config`** — shared
  tooling configs; apps extend them and must not duplicate the settings.

## CI/CD

- GitHub Actions, path-filtered per app: `web.yml`, `api.yml`, `mobile.yml`.
- Every PR/push: conventional-commits check + Vitest via
  `reusable-test.yml` (`pnpm --filter <app> test`).
- `main` → production: Vercel for web & api (`reusable-vercel-deploy.yml`),
  EAS build for mobile. PRs → preview builds (Vercel preview, EAS development).
- `setup-pnpm` action: Node **26**, pnpm **11.6.0**,
  `pnpm install --frozen-lockfile` — keep `pnpm-lock.yaml` in sync.

## Gotchas

- `.npmrc` sets `package-manager-strict=false`; `pnpm-workspace.yaml` has an
  override (`utf-8-validate`) and a peerDependencyRule for
  `@gorhom/bottom-sheet` — don't remove them, they fix install failures.
- Turbo caches `.next/**` and `dist/**` outputs; `dev` and `clean` are
  uncached. Env glob: `**/.env.*local`.
- Mobile uses React Native worklets + reanimated; keep versions aligned with
  the SDK 56 set in `apps/mobile/package.json`.
