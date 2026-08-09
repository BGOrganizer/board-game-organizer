# Board Game Organizer

Multi-platform app to organize board game sessions, collections, groups, and player stats —
web, API, and mobile, all in one TypeScript monorepo.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router, React 19) · Tailwind CSS v4 · HeroUI |
| API | Next.js 16 route handlers · Clerk auth · MongoDB (raw driver) · zod |
| Mobile | Expo SDK 56 (React Native, Expo Router) · Clerk · Sentry · uniwind |
| Shared | `@board-game-organizer/store` (Zustand) · `@board-game-organizer/query` (TanStack Query) |
| Tooling | TypeScript · Biome (lint + format) · Vitest |

## Features

**Implemented**
- Clerk authentication on web and mobile (sign-in / sign-up)
- Profile endpoint and follow / friend-request / friend / block "relationships" API (MongoDB)
- App shells with Matches · Groups · Organizations · Contacts navigation (web + mobile)

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

# 1. Create env files (see .env.example)
cp .env.example .env.local      # used by web (NEXT_PUBLIC_*)
# api reads MONGODB_URI, MONGODB_DB_NAME, CLERK_SECRET_KEY, ALLOWED_ORIGINS
# mobile reads EXPO_PUBLIC_* (set in apps/mobile/.env or shell)

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
pnpm --filter <app> test   # vitest
```

See `AGENTS.md` for architecture, conventions, env vars, and the git/commit workflow.

## License

MIT
