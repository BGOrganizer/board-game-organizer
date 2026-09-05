# Board Game Organizer

![CI](https://github.com/BGOrganizer/board-game-organizer/actions/workflows/pr-ci.yml/badge.svg)
![Codecov](https://codecov.io/gh/BGOrganizer/board-game-organizer/branch/main/graph/badge.svg)

Multi-platform app to organize board game sessions, collections, groups, and player stats —
web, API, and mobile, all in one TypeScript monorepo.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router, React 19) · Tailwind CSS v4 · HeroUI |
| API | Next.js 16 route handlers · Clerk auth · MongoDB (raw driver) · zod |
| Mobile | Expo SDK 57 (React Native, Expo Router) · Clerk · Sentry · heroui-native + uniwind |
| Shared | `@board-game-organizer/store` (Zustand, UI state) · `@board-game-organizer/query` (TanStack Query) · `@board-game-organizer/shared` (types, API client, hooks) · `@board-game-organizer/schemas` (DB models + zod DTOs) |
| i18n | **LinguiJS** (it + en catalogs, web + mobile) — see AGENTS.md |
| Tooling | TypeScript · Biome (lint + format) · Vitest (+ coverage ≥ 50% per app) · commitlint · Maestro · Playwright |

## Features

**Implemented**
- Clerk authentication on web and mobile (sign-in / sign-up, Google OAuth)
- Profile screen (avatar, user info, stats) powered by the API (`GET /api/profiles`, deployed on
  Vercel) with **logout**; specular web/mobile implementation
- Light/dark theme follows the device (HeroUI + uniwind)
- Profile endpoint and follow / friend-request / friend / block "relationships" API (MongoDB)
- App shells with Matches · Groups · Organizations · Contacts · Profile navigation (web + mobile)
- **Contacts tab** (web + mobile): Following/Followers/Blocked lists, follow/unfollow,
  address-book suggestions (mobile: permission-gated, matched registered users persisted
  in `contactLinks`; 'Add contacts' CTA re-prompts when denied), prefix search (with block
  policy + rate limit), presence green-dot (heartbeat), coherent follow state across
  sections (TanStack Query cache invalidation), block/unblock with confirmation via a
  kebab action menu (mobile bottom sheet / web dropdown)
- **Invites** (Phase 3): shareable invite links with 7-day TTL (`POST /api/invites`,
  `POST /api/invites/claim`); claiming makes both users MUTUAL followers/friends. UI: an
  `InviteCard` (card + button, no email form) above the Contacts tabs. The link ALWAYS points
  at the **API** that generated it (preview API → preview link, production → production link);
  claim happens on the public page `/invite/<token>` HOSTED BY THE API (Clerk sign-in modal +
  Bearer claim). Icons via lucide-react / lucide-react-native.
- E2E tests with **Maestro** (mobile) and **Playwright** (web) in CI — test users are
  provisioned via the Clerk API per run and deleted afterwards (never accumulate)

**Planned**
- Collection management, session logging, player statistics, game catalog (BGG import)
- Groups, match scheduling, venues, ELO rankings, marketplace

**Release 2 (deferred)** — see `plan.md`: friend requests UI + expired-invite
cleanup job.

## Prerequisites

- **Node.js ≥ 22** (CI uses 26)
- **pnpm 11.25** (`corepack enable && corepack prepare pnpm@11.25.0 --activate`, or `npm i -g pnpm@11.25.0`)
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
pnpm release                        # semantic-release (version bump + changelog, on main)
```

## Git Workflow & CI/CD

- **`main` is protected** — no direct pushes; every change goes through a **pull request**
  with at least 1 approval (branch protection: Settings → Branches → `main`).
- **Branch pushes run `branch-ci.yml`** (fast subset: commitlint, Biome, typecheck, unit +
  integration tests) — quick feedback while implementing; **the PR is opened only when the
  whole feature is done** (on request) and runs the full `pr-ci.yml` below.
- **PRs run `pr-ci.yml`**: commitlint → Biome → typecheck → unit tests with coverage → API
  integration tests (testcontainers) → mobile APK build (internal) → api/web builds → Vercel
  **preview** deploys → E2E **Maestro** (mobile) + **Playwright** (web).
- If every gate passes, a **draft prerelease** (`v<version>-pr.<PR>`) is created/updated with
  the PR **changelog** (from conventional commits), the internal APK and the preview links,
  and a **Telegram notification** is sent (changelog + preview links + PR APK).
- Merging to main runs `main-ci.yml`: **semantic-release** bumps the **semver** version from
  the conventional commits (breaking → major, `feat` → minor, `fix` → patch), generates
  **`CHANGELOG.md`**, syncs the version across api/web/mobile + the APK, creates the GitHub
  release `v<version>` with the changelog, attaches the internal APK, deploys api/web to
  **Vercel production** and posts the release to the **Telegram channel**.
- The **development APK** is built only manually from main (`mobile-development.yml`) and
  attached to the latest release.

See `AGENTS.md` for the full spec, env vars, and the signed git/commit workflow.

## Board automation (pi-board-agent)

Autonomous execution of the GitHub project board (story refine → sub-issue tasks →
implementation in worktrees → PR per plan → CI fixes → Telegram): the config lives in
 (gitignored) and the runtime in a separate Docker container.
See  → *Board automation* for the full config + the gh token permissions
needed to initialize the project ().

## License

MIT
