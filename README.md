# Board Game Organizer

![CI](https://github.com/BGOrganizer/board-game-organizer/actions/workflows/pr-ci.yml/badge.svg)
![Codecov](https://codecov.io/gh/BGOrganizer/board-game-organizer/branch/main/graph/badge.svg)

Web and native mobile clients for board-game contacts, collections, matches, groups,
organizations, and events, backed by a shared TypeScript API.

## Current functionality

- Clerk authentication, required post-signup mobile-number step, profile and logout.
- Friends, follows, requests, blocks, user search, presence, permission-gated mobile contact
  suggestions, and shareable seven-day invites.
- Match planning, verified locations and personal location favorites, game/date voting,
  invitations and link-based participation requests, confirmation, and immutable results.
- Groups with friend invitations, membership, editing/archival, public discovery, group matches,
  and per-game OpenSkill leaderboards.
- MongoDB-backed BoardGameGeek catalog search, account linking and collection synchronization.
- Durable notification inbox, unread state, optional push delivery, light/dark theme, and EN/IT.
- Organizations with verified addresses, logos, moderation, membership and exclusions; events
  with drafts, tables, invitations/bookings, cutoff enforcement and fixed matches.

**Organizations/events are implemented in this branch, but full PR/native acceptance is incomplete.**
They are not production-verified. Event publication fails closed without the required deadline-service
configuration; real Inngest registration/delivery has not been attested. See the
[implementation checkpoint](docs/implementation-progress.md) and
[operational gates](docs/organizations-events-operations.md).

## Stack

| Area | Technologies |
| --- | --- |
| Workspace | pnpm 11.25, Turborepo; Node.js 26 in CI |
| Web | Next.js 16 App Router, React 19, HeroUI 3, Tailwind CSS 4, Clerk |
| API | Next.js route handlers, Clerk, MongoDB driver 7, zod 4, OpenSkill 5, Sharp 0.35, Inngest 4 |
| Native mobile | Expo SDK 57, React Native 0.86, Expo Router, HeroUI Native 1, Uniwind 1, Clerk, Sentry |
| Maps | MapTiler SDK 4 on web; MapLibre React Native 11 with MapTiler tiles on mobile |
| State | TanStack Query 5 for remote data; Zustand 5 for UI and unsaved drafts |
| Localization | Lingui 6, shared English/Italian source and compiled catalogs |
| Quality | Biome, Vitest 3.2, Playwright, Maestro, commitlint |
| TypeScript | 7 in non-mobile workspaces; Expo-compatible 6 on mobile |

Expo web is not a supported product target. Native MapLibre requires a development build, not Expo Go.

## Repository and component structure

There are three apps and six shared/configuration workspace packages, plus the root project.

```text
apps/
  api/                  Routes, services, repositories, migrations and integration tests
  web/                  Next.js routes and web-owned feature components
  mobile/               Expo Router routes and native-owned feature components
packages/
  schemas/              MongoDB models and zod DTOs
  shared/               Pure domain logic, API helpers and reusable Query hooks
  query/                Query client and provider
  store/                Local UI and unsaved draft state
  biome-config/         Shared Biome configuration
  typescript-config/    Shared TypeScript configuration
messages/               EN/IT Lingui catalogs
scripts/release/        Versioning, changelog and release helpers
docker/mongodb/         Local replica-set startup and catalog import
data/                   Ignored local CSV; tracked setup notes
docs/                   Domain specifications, operations and implementation evidence
.github/                CI workflows, composite actions and regression scripts
.agents/skills/         Managed project skills
.pi/skills/             Pi skills, including the tracked BGO architecture guide
skills-lock.json        Managed skill sources and integrity
```

Both clients use this platform-owned component layout:

```text
src/
  app/                  Next.js or Expo Router entries
  components/
    contacts/
    matches/
    groups/
    organizations/
    events/
    profile/
    common/ui/          Only proven cross-feature reuse
  lib/                  Platform adapters and local helpers
```

Feature folders are the component structure convention, not a universal web/native renderer.
Existing flat components migrate within requested feature work; this documentation change does not
move application files or create empty folders. See [AGENTS.md](AGENTS.md) for ownership rules.

## Local setup

Use Node.js 26 to match CI, pnpm 11.25, Clerk keys and a MongoDB replica set.
Map display needs each client's public MapTiler key; address verification uses the server-only key.
Sentry and push credentials are optional. Deployment configuration comes from Infisical;
local files must remain private.

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Fill the documented placeholders, then run the clients you need:

```bash
pnpm --filter api dev       # http://localhost:4000
pnpm --filter web dev       # http://localhost:3000
pnpm --filter mobile dev    # Expo development client
# pnpm dev runs all workspace development tasks through Turbo
```

Use your machine's LAN address for a physical device's API URL. `NEXT_PUBLIC_*` and
`EXPO_PUBLIC_*` values are public, even when a secret manager labels them Secret.
Never commit populated env files, credentials, private MCP configuration or service-account files.

### MongoDB and BoardGameGeek

Download/extract the BGG `bg_ranks` CSV to `data/boardgames_ranks.csv`, then:

```bash
docker compose up -d --wait --wait-timeout 600
docker compose logs -f mongodb
pnpm --filter api migrate
```

`compose.yaml` initializes a MongoDB 7 replica set and imports the CSV before reporting healthy.
Use the API example's replica-set URI and `MONGODB_DB_NAME`. Migrations create social, group,
rating, location, organization and event indexes before writes.

Catalog imports upsert by BGG ID without deleting absent games or match history. To re-import a
local CSV, use `BGG_CSV_PATH` with `docker compose up -d --force-recreate --wait`.
`docker compose down` preserves data; add `-v` only when deletion is explicitly intended.

Remote imports use `.github/workflows/import-boardgames.yml` or
`apps/api/scripts/import-boardgames.mjs`; direct Preview database imports use
`apps/api/scripts/import-boardgames-direct.ts`. Verify the exact target and credentials before
running either. BGG account validation/synchronization uses the API's `BGG_TOKEN`.

## Checks and delivery

```bash
pnpm lint
pnpm typecheck
pnpm --filter <workspace> test
pnpm --filter <workspace> test:coverage
pnpm --filter api test:integration   # Docker/Testcontainers replica set
pnpm --filter web test:e2e           # Isolated API/Clerk and explicit E2E configuration
pnpm build
pnpm i18n:extract
pnpm i18n:compile
```

There is no root `test` script. Mobile Vitest focuses on pure logic; Maestro covers native UI.
Missing authenticated E2E configuration must fail, not silently skip. Written flows and static
checks do not establish runtime acceptance.

Branch CI runs quality/unit/integration checks. PR CI adds isolated Preview deployments, separate
CI/development APKs, browser/native E2E and cleanup before draft publication. Main CI verifies
isolated E2E and cleanup before release and production deployment. Vercel builds uploaded source
with app-specific build commands; deployment-local overrides preserve database isolation.

`main` is protected. Use signed Conventional Commits; open a PR only on explicit request.
See [AGENTS.md](AGENTS.md) and the current [workflow files](.github/workflows) for operational rules.

## Domain and operational references

- [Organizations/events behavior](docs/organizations-events.md)
- [Moderation, deadline workers, Infisical and deployment isolation](docs/organizations-events-operations.md)
- [Implementation evidence and incomplete acceptance](docs/implementation-progress.md)

These documents hold the detailed specifications and procedures; this README does not duplicate them.

## License

MIT is the declared license; a standalone `LICENSE` file is not currently included.
