# Board Game Organizer

<p align="center">
  <img src="docs/assets/bgo-mascot-organizer.png" alt="Board Game Organizer mascot with cards, a die and a calendar" width="320" />
</p>

[![CI](https://github.com/BGOrganizer/board-game-organizer/actions/workflows/pr-ci.yml/badge.svg)](https://github.com/BGOrganizer/board-game-organizer/actions/workflows/pr-ci.yml)
[![Codecov](https://codecov.io/gh/BGOrganizer/board-game-organizer/branch/main/graph/badge.svg)](https://codecov.io/gh/BGOrganizer/board-game-organizer)

Organize board-game nights across web and native mobile: find players, manage collections,
plan events and tables, and record results.

[Get started](#get-started) | [Commands](#commands) | [Project structure](#project-structure) | [Documentation](#documentation)

## What you can do

- Create private or public Groups, manage membership and delegate moderation.
- Plan standalone or Group Events, propose dates, verified venues and games, and collect votes.
- Arrange seats and waiting lists manually or with assistance; prioritize player count or BGG Best.
  Event confirmation remains an explicit manager action.
- Record whole-event results and track GLOBAL/GROUP OpenSkill ratings.
- Connect with friends, search users and discover permission-gated device contacts on mobile.
- Link a BoardGameGeek account, sync owned games and browse a MongoDB-backed catalog with
  durations, difficulty and player-count recommendations.
- Receive in-app updates and optional push notifications, with English/Italian and light/dark UI.

Main navigation is **Tables / Events / Groups / Community / Contacts**:

- **Tables:** confirmed or completed tables where you are a confirmed player.
- **Events:** Participation includes your registrations, invitations and demonstrations, plus Events you manage.
  Available lists enrollable planning Events in Groups where you are an accepted member and are not already participating or managing.
- **Contacts:** Connections, Requests, Contacts and Search. Device contacts and remote search have separate lists;
  web shows registered contacts from the synchronized snapshot.

> [!NOTE]
> The unified Groups / Events / Tables domain is implemented on this branch; production and
> authenticated device/E2E acceptance remain incomplete. See the [domain contract](docs/groups-events-refactor.md)
> and [verification checkpoint](docs/implementation-progress.md). Retired Match/Organization writers are disabled;
> legacy database records are retained.

## Get started

### Requirements

- **Node.js 26** and **pnpm 11.25.0**, matching CI and `packageManager`.
- **Docker with Compose** for the local MongoDB replica set and integration tests.
- Clerk development keys, public MapTiler keys for each client and a server MapTiler key for address verification.
- A BGG rankings CSV at `data/boardgames_ranks.csv`; see [catalog setup](data/README.md).
- For mobile: an Android/iOS development build and the matching native toolchain. Expo Go and Expo web are unsupported.

### Install and configure

From the repository root:

```sh
pnpm install --frozen-lockfile
```

Copy each template to the corresponding private file, then fill its placeholders:

| App | Template | Local configuration |
| --- | --- | --- |
| API | `apps/api/.env.example` | `apps/api/.env.local` |
| Web | `apps/web/.env.example` | `apps/web/.env.local` |
| Mobile | `apps/mobile/.env.example` | `apps/mobile/.env` |

Use the same Clerk development instance across the API and clients. Configure Clerk user webhooks
for profile/contact discovery; existing users can be mirrored with `pnpm --filter api backfill:users`.
Sentry and push credentials are optional; the notification inbox works without push configuration.
BGG linking and synchronization need the API's `BGG_TOKEN`.

For a physical device, set `EXPO_PUBLIC_API_URL` to your computer's reachable LAN address.
Keep populated configuration files private; `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are public client configuration.

### Start the database

With the CSV in place and Docker running:

```sh
docker compose up -d --wait --wait-timeout 600
pnpm --filter api migrate
```

Compose initializes MongoDB 7 as replica set `rs0` and imports the CSV before reporting healthy.
The API template contains the local connection URI. `docker compose logs -f mongodb` shows import progress.
Migrations create indexes and remove the legacy `relationships` collection; run them against your intended local database.

### Run the apps

Run each command in its own terminal:

| App | Command | Local endpoint |
| --- | --- | --- |
| API | `pnpm --filter api dev` | <http://localhost:4000> |
| Web | `pnpm --filter web dev` | <http://localhost:3000> |
| Mobile | `pnpm --filter mobile dev` | Expo development-client server |

`pnpm dev` starts all workspace development tasks through Turborepo.
For a first local Android build use `pnpm --filter mobile android`; on macOS with Xcode use
`pnpm --filter mobile ios`. Starting Metro alone does not build the native app.

## Commands

Run from the repository root. On Windows PowerShell, use `pnpm.cmd` if execution policy blocks `pnpm.ps1`.

| Task | Command |
| --- | --- |
| Lint and formatting checks | `pnpm lint` |
| Type checking | `pnpm typecheck` |
| App unit tests | `pnpm --filter web test` (or `api`, `mobile`) |
| Shared logic tests | `pnpm --filter @board-game-organizer/shared test` |
| Schema tests | `pnpm --filter @board-game-organizer/schemas test` |
| Unit coverage | `pnpm --filter web test:coverage` (also API, mobile, shared and schemas) |
| MongoDB integration tests | `pnpm --filter api test:integration` |
| One web test file | `pnpm --filter web test src/components/events/__tests__/useTableSeatOrder.test.tsx` |
| Web E2E | `pnpm --filter web test:e2e` |
| Production web/API builds | `pnpm build` |
| Extract / compile translations | `pnpm i18n:extract` / `pnpm i18n:compile` |
| Regenerate / verify artwork | `node scripts/branding/export.mjs` / `node scripts/branding/export.mjs --check` |

There is no root `pnpm test`. `pnpm build` runs the web/API build scripts; it does not produce a native binary.
Integration tests start a Testcontainers replica set and need Docker. Web E2E requires running apps or an
explicit `PLAYWRIGHT_BASE_URL`, the matching API/Clerk configuration and provisioned test users.
Native UI acceptance uses the retained [Maestro flows](apps/mobile/.maestro); mobile Vitest covers pure logic.
See [delivery details](docs/development.md#delivery) for CI policy and acceptance limits.

## Project structure

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js 16, React 19, HeroUI 3 and Tailwind CSS 4 |
| `apps/mobile` | Expo SDK 57, React Native 0.86, HeroUI Native and Uniwind |
| `apps/api` | Next.js route handlers, Clerk, MongoDB and zod |
| `packages/shared` / `schemas` | Domain logic, Query hooks, models and DTOs |
| `packages/query` / `store` | TanStack Query server state / Zustand UI and unsaved drafts |
| `packages/biome-config` / `typescript-config` | Shared tooling configuration |
| `messages` | Shared Lingui English/Italian source and compiled catalogs |
| `docs` | Domain specifications, setup details and verification evidence |
| `.github` | CI/CD workflows, actions and supporting scripts |

Web and mobile own their UI; pure behavior is shared. Maps use MapTiler and native MapLibre.
Read [AGENTS.md](AGENTS.md) before changing code.

## Client responsiveness defaults

Clients retain cached data while refreshing and use bounded lists and optimistic mutation feedback.
Native Query data persists in an account/API-scoped encrypted cache; restoration does not grant authentication
or permission. Native cache retention, build requirements and implementation rules live in
[the development reference](docs/development.md#native-cache-and-builds) and
[responsiveness defaults](docs/development.md#client-responsiveness-defaults).

## Documentation

- [Groups, Events and Tables](docs/groups-events-refactor.md) | current behavior and permissions.
- [Profiles and BGG collections](docs/profiles.md) and [Community](docs/community.md).
- [Development reference](docs/development.md) | cache, responsiveness, BGG enrichment and delivery.
- [Operations](docs/organizations-events-operations.md) | environment isolation, providers and deployment gates.
- [Verification checkpoint](docs/implementation-progress.md) | completed checks and remaining acceptance work.
- [Mascot and app artwork](docs/branding.md) | source assets and platform exports.

## Source availability and permissions

The source is publicly viewable, with **all rights reserved**; this project is not offered under
an open-source license. Using or reusing the project code requires prior written authorization
from the applicable copyright holder. See [LICENSE](LICENSE) for the full notice, hosting-platform
exceptions, third-party materials and permission requests.
