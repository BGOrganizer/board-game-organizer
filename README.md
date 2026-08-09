# Board Game Organizer

Multi-platform app for tracking and organizing board game sessions,
collections, and player statistics — including game groups, match scheduling,
and player rankings. Built as a pnpm + Turborepo monorepo with three apps:

| App | Stack | Port |
|-----|-------|------|
| **web** | Next.js 16 (App Router, React 19), Tailwind CSS v4, HeroUI | 3000 |
| **api** | Next.js 16 Route Handlers, MongoDB, Zod, Clerk auth | 4000 |
| **mobile** | Expo SDK 56 (React Native, Expo Router), heroui-native, uniwind | — |

Auth is handled by **Clerk** on all three platforms.

## Features

- 🔐 Clerk authentication (web + mobile, with a shared API)
- 👥 Social graph: follow, friend requests, friends, blocking (MongoDB API)
- 🗂️ Tabs: Matches, Groups, Organizations, Contacts (web + mobile)
- 🧩 Shared Zustand store and TanStack Query setup across apps
- 🚀 CI/CD: Vercel deploys (web, api) + EAS builds (mobile), conventional-commits enforced
- 📋 Planned: collection management, session logging, BGG import, ELO rankings, marketplace

## Prerequisites

- **Node.js** >= 20 (CI runs on 26)
- **pnpm** >= 11 (the repo pins `pnpm@11.6.0` in `package.json`)
- **MongoDB** — local or Atlas (required by the API)
- **Clerk account** — free; gives you the publishable/secret keys
- For mobile: an emulator or device with the dev client (Expo Go is not supported)

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment — copy the example files in each app
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# 3. Fill in your Clerk keys and MongoDB URI in those files

# 4. Run everything (web :3000, api :4000, expo)
pnpm dev

# Run a single app
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter mobile dev
```

> The API needs valid `CLERK_SECRET_KEY` + `MONGODB_URI`/`MONGODB_DB_NAME`
> or every endpoint will fail. The web UI works without the API for auth-only flows.

## Quality Checks

```bash
pnpm lint       # Biome check
pnpm typecheck  # TypeScript across all apps
pnpm test       # Vitest across all apps
pnpm build      # Production build
pnpm format     # Biome format --write .
```

## Repository Structure

```
apps/
  web/        # Next.js frontend
  api/        # Next.js API + MongoDB
  mobile/     # Expo React Native app
packages/
  store/      # Zustand store (slice pattern)
  query/      # TanStack Query client + provider
  biome-config/       # Shared Biome config
  typescript-config/  # Shared TS configs
.github/workflows/    # CI/CD per app
```

## License

MIT
