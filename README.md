# Board Game Organizer

<p align="center">
  <img src="docs/assets/bgo-mascot.png" alt="Board Game Organizer mascot: a playful purple meeple hugging a golden die" width="280" />
</p>

![CI](https://github.com/BGOrganizer/board-game-organizer/actions/workflows/pr-ci.yml/badge.svg)
![Codecov](https://codecov.io/gh/BGOrganizer/board-game-organizer/branch/main/graph/badge.svg)

Web and native mobile clients for board-game contacts, collections, groups, events and tables,
backed by a shared TypeScript API. Main navigation is Tables / Events / Groups / Contacts.
Groups has Private / Public / Search tabs; Private/Public show administered, joined and pending
invited Groups of that type, while Search retains public discovery. Events has Registered / Available
(Iscritti / Disponibili): registrations/invitations/requests or demonstrations belong to Registered;
other accessible member-Group Events and own admin-only Events belong to Available. Public non-members
and pending Group memberships never grant Event access. Tables has one combined source-paged list,
without inner tabs: explicit participation, demonstrations, invitations, requests and accepted queue
places, never administration alone. These lists and Group's
Events filter their own authorized scope by name with no minimum length; Group Search remains discovery
with its four-character minimum.

## Current functionality

- Clerk authentication and required post-signup mobile-number step.
- [Authenticated profiles](docs/profiles.md), block-aware activity history, unified participation
  statistics, GLOBAL OpenSkill progression, owner-only BGG synchronization and confirmed logout
  (local implementation; authenticated/device acceptance incomplete).
- Friends, follows, requests, blocks, user search, presence, permission-gated mobile contact
  suggestions, and shareable seven-day invites.
- Immutable private/public Groups, friend invitations and consent, public membership requests,
  verified venues/logos, moderation, timed/permanent group exclusions and per-game leaderboards.
  Creator-confirmed Group deletion atomically removes its unified Events and related history.
- Standalone or grouped Events with Tables: a fixed date/time and verified location for standalone
  and public Events, multiple date/time and venue proposals for private Groups, automatic venue time
  zones, unsaved multi-step editors, explicit registrations, reserved invitations/waiting priorities,
  date/location/game voting and manual confirmation.
- Exact public-event cutoffs, verified locations/favorites, BGG/manual durations, overlap checks,
  atomic whole-event results and GLOBAL/GROUP OpenSkill ratings. Pending invitees never vote.
- MongoDB-backed BoardGameGeek catalog search, account linking and collection synchronization.
- Durable notification inbox with a counted bell and static danger dots inside affected cards/items,
  after shrinkable titles/names. No automatic Group/Event/Table propagation, borders or pulses.
  Top tabs reflect unread rows in their authorized category without making parent cards unread.
  Each Group/Event/Table tab shows one warning change Alert with its sole compact icon-only warning read
  action; item dots stay passive. No entry, focus, visibility timer or vote reads information.
  Accepted members mark Members and their actual row; Table participation marks Participants only.
  Alert reads capture only displayed information and preserve later/unshown work. Pending invitations
  remain in the Alert and unread until their response; generic mark-read/mark-all cannot consume them.
  Known source reads/decisions immediately reconcile related navigation indicators without granting consent.
  Optional push, light/dark and EN/IT. Reading never grants invitation consent.
- Native cache-first restart: authoritative TanStack Query data persists in account/API-scoped,
  AES-256 MMKV with random device-only SecureStore keys. Restore waits for Clerk identity; it is not
  offline authentication. Snapshots retain up to 24 hours, 200 queries and an 8 MiB conservative
  serialized budget; older entries are evicted. Native infinite refreshes restart at page one.
  Combined personal Tables remains first in the existing three-worker priority warmup; four first
  datasets gate splash, never beyond five total seconds. Cached content stays visible during refresh.
  Logout/account or session changes purge owned disk/key and cancel RAM work. No optimistic intents,
  raw address-book scans, credentials or offline write replay persist. Storage failures retain usable
  RAM/network behavior and show a nonblocking localized warning.
- Consistent Group/Event/Table cards: shared title/body typography, explicit parent labels and
  human-readable Event schedules/venues, with accent option counts. Tables inside their Event omit
  redundant parent/schedule metadata; older cached responses retain partial loading placeholders.
- HeroUI-token-only light/dark UI across native navigation, headers, controls and custom surfaces.
  Theme changes preserve drafts and selection. Both clients inherit the installed HeroUI default
  palettes without app theme-variable overrides. Static provider artwork retains its brand contrast.

The [unified domain contract](docs/groups-events-refactor.md) describes this branch. Legacy
Match/Organization writers return authenticated `410`; old UI links redirect without treating old
IDs as new resources. Automatic legacy deadline functions are unregistered; confirmation is manual.
Legacy database documents are retained and excluded from unified readers. **No database reset or
provider deployment is authorized by this refactor.** This is not production or E2E acceptance:
retained suites/jobs were not modified. See the [verification checkpoint](docs/implementation-progress.md)
and [deployment isolation](docs/organizations-events-operations.md).

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

Expo web is not a supported product target. Native MapLibre and MMKV/Nitro require a fresh native
build, not Expo Go or a JavaScript-only update. Native cache/device acceptance remains recorded in
the [verification checkpoint](docs/implementation-progress.md).

## Client responsiveness defaults

Apply these best practices to every new or touched client flow; they are not optional optimizations
reserved for the game picker. Existing ownership, privacy and authorization rules in
[AGENTS.md](AGENTS.md#6-data-and-state-ownership) remain authoritative.

- **Bound presentation independently from cache.** Keep source paging and virtualized rendering.
  On entry/reentry, expose a bounded cached page/window and reveal more cached pages before fetching.
  Derive only that window, not a full-cache flatten followed by a slice. Preserve cached pages,
  stable row keys/callbacks, accessibility and loading/error states. Reset-to-top is acceptable when
  the flow allows it. The mobile game picker exposes eight source items initially, retaining six-row
  render batches and its seven-screen window. It reveals cached chunks on scroll or an accessible
  load-more action, not on an automatic initial `onEndReached`. These are picker-specific budgets,
  not universal constants or fixed-height assumptions.
- **Optimistic feedback for explicit remote actions.** Use the shared scoped journal/intent layer
  on web and native: cancel conflicting reads, project owned cached state or pending intent,
  reconcile the real acknowledgment and roll back only the failed operation. Do not invent consent,
  capabilities, server IDs, frozen results or records for a cold cache. Unknown outcomes require
  verification, not blind replay. Reads, unsaved local edits and background/authentication workflows
  retain their existing behavior; they do not acquire user-action toasts merely to look optimistic.
- **Central encrypted MMKV persistence for eligible native Query data.** Reuse the account/API-owned
  adapter described above, reviewing each query family's privacy and retention/budget eligibility.
  Persist canonical bases only; never optimistic overlays, credentials, raw contacts or transient
  provider searches. Restore does not grant authentication or permissions. Preserve logout/session
  purge safeguards. No separate feature cache, duplicated Query state or web MMKV adapter.
- **Measure both directions.** Faster list opening does not prove faster Back or selection return.
  Cached data can still require rebuilding an editor's native controls; cache snapshots can still
  require serialization. Profile JS work, React/native mount/commit and storage separately on a
  current native build. Do not hide costs with arbitrary delays, disabled animations or unbounded
  hidden lists. Unit/source checks and desktop timings are not device-frame acceptance.

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
    groups/
    events/
    profile/
    common/ui/          Only proven cross-feature reuse
  lib/                  Platform adapters and local helpers
```

Components and their tests are organized by feature on both clients, without a universal web/native
renderer. Shared logic/hooks and schema models/DTOs also live in domain folders. API HTTP helpers,
services and repositories are grouped inside `apps/api/src/app/lib/<domain>`; route handlers remain
the controllers and keep their existing URLs. Query/configuration packages stay flat and Zustand
retains its slices. See [AGENTS.md](AGENTS.md) for ownership rules and
[the refactoring evidence](docs/skills-and-component-architecture-plan.md#9-feature-organization-execution)
for verification and acceptance limits.

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
running either. Both import paths share the complete 16-column parser, including expansion/category
ranks. CSV refreshes retain XML-enriched artwork, player-count pairs, durations and their timestamps;
those fields are not supplied by the rankings CSV. The manual workflow selects Preview/Production,
verifies matching credentials and a non-CI target, and preserves resumable chunk windows. It does
not perform bulk provider enrichment. BGG account validation/synchronization uses the API's `BGG_TOKEN`.

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

One [branch/PR pipeline](.github/workflows/pr-ci.yml) runs quality/unit/integration checks before a
PR exists; open PRs use one full pipeline without duplicate push checks. Common quality gates
feed independent Internal and Development lanes. `PR ready` requires Internal and CI cleanup;
Development APK/web/API draft publication and Telegram do not wait for them. PR browser/native E2E
remain explicitly disabled, not accepted. Main E2E gates and the manual mobile-E2E workflow are
removed by operator request; retained suites remain available locally. Follow the
[controller and required-check rollout](docs/organizations-events-operations.md#unified-branchpr-ci-rollout)
before treating feature-branch workflow edits as active policy. Main CI requires quality/tests,
unit and integration Codecov uploads, verification builds, a pinned production APK and API/web
smoke checks before release publication and Telegram. Manual mobile builds select Preview or
Production and publish environment-labeled run artifacts, not APKs on an unrelated release. Vercel builds uploaded source
with app-specific build commands; deployment-local overrides preserve database isolation.

`main` is protected. Use signed Conventional Commits; open a PR only on explicit request.
See [AGENTS.md](AGENTS.md) and the current [workflow files](.github/workflows) for operational rules.

## Domain and operational references

- [Unified Groups / Events / Tables](docs/groups-events-refactor.md)
- [Retired organization/event contract](docs/organizations-events.md)
- [Moderation, deadline workers, Infisical and deployment isolation](docs/organizations-events-operations.md)
- [Implementation evidence and incomplete acceptance](docs/implementation-progress.md)

These documents hold the detailed specifications and procedures; this README does not duplicate them.

## License

MIT is the declared license; a standalone `LICENSE` file is not currently included.
