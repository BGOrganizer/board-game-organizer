# Board Game Organizer

Multi-platform app to organize board game sessions, collections, groups, and player stats —
web, API, and mobile, all in one TypeScript monorepo.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router, React 19) · Tailwind CSS v4 · HeroUI |
| API | Next.js 16 route handlers · Clerk auth · MongoDB (raw driver) · zod |
| Mobile | Expo SDK 56 (React Native, Expo Router) · Clerk · Sentry · heroui-native + uniwind |
| Shared | `@board-game-organizer/store` (Zustand, UI state) · `@board-game-organizer/query` (TanStack Query) · `@board-game-organizer/shared` (types, API client, hooks) |
| Tooling | TypeScript · Biome (lint + format) · Vitest (+ coverage) · commitlint · Maestro · Playwright |

## Features

**Implemented**
- Clerk authentication on web and mobile (sign-in / sign-up, Google OAuth)
- Profile screen (avatar, user info, stats) powered by the API (`GET /api/profiles`, deployed on
  Vercel) with **logout**; specular web/mobile implementation
- Light/dark theme follows the device (HeroUI + uniwind)
- Profile endpoint and follow / friend-request / friend / block "relationships" API (MongoDB)
- App shells with Matches · Groups · Organizations · Contacts · Profile navigation (web + mobile)
- E2E tests with **Maestro** (mobile) and **Playwright** (web) in CI — test users are
  provisioned via the Clerk API per run and deleted afterwards (never accumulate)

**Planned**
- Collection management, session logging, player statistics, game catalog (BGG import)
- Groups, match scheduling, venues, ELO rankings, marketplace

## Prerequisites

- **Node.js ≥ 22** (CI uses 26)
- **pnpm ≥ 11.6** (`corepack enable && corepack prepare pnpm@11.6.0 --activate`, or `npm i -g pnpm`)
- **MongoDB** running (transactions require a replica set: `mongod --replSet rs0` + `rs.initiate()`)
- Accounts/keys: [Clerk](https://clerk.com) (publishable + secret keys); Sentry DSN only for mobile

## Setup & Run

```bash
pnpm install          # install all workspace dependencies

# 1. Create env files from the per-app examples
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/mobile/.env.example apps/mobile/.env

pnpm dev              # run all apps
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Mobile: `pnpm --filter mobile dev` (Expo dev client / emulator)

Per-app: `pnpm --filter web dev`, `pnpm --filter api dev`, `pnpm --filter mobile dev`.

## Quality

```bash
pnpm lint         # biome check
pnpm typecheck    # tsc --noEmit across apps
pnpm format       # biome format --write .
pnpm --filter <app> test             # vitest (unit)
pnpm --filter <app> test:coverage    # vitest + coverage report
pnpm --filter api test:integration   # integration tests (testcontainers / Docker)
pnpm --filter web test:e2e           # Playwright E2E (needs CLERK_SECRET_KEY +
                                   #   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for the Clerk
                                   #   testing token; PLAYWRIGHT_BASE_URL for the target)
pnpm commitlint                      # conventional-commit check
```

## Git Workflow & CI/CD

- **`main` is protected** — no direct pushes; every change goes through a **pull request**
  with at least 1 approval (branch protection: Settings → Branches → `main`).
- **PRs run `pr-ci.yml`**: commitlint → Biome → typecheck → unit tests with coverage → API
  integration tests (testcontainers) → mobile APK build (internal) → api/web builds → Vercel
  **preview** deploys → E2E **Maestro** (mobile) + **Playwright** (web).
- If every gate passes, a **draft release** is created (internal APK + preview links).
- Merging to main runs `main-ci.yml`: promotes the draft to a **final release** (production
  links + APK) and deploys api/web to **Vercel production**.
- The **development APK** is built only manually from main (`mobile-development.yml`) and
  attached to the latest release.

See `AGENTS.md` for the full spec, env vars, and the signed git/commit workflow.

## License

MIT
