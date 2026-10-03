# AGENTS.md

Instructions for coding agents working on **Board Game Organizer**.

## 1. Source of truth

Read this file before changing code. Then inspect the files touched by the task and every caller of
shared code being changed. Prefer current code and workflow files over historical notes.

Core rules:

- Keep changes small, complete, and tested.
- Keep user-facing feature behavior in parity across web and mobile unless a platform exception is explicit.
- Internationalize every user-facing string and update both English and Italian catalogs.
- Fix root causes in shared code instead of patching each caller.
- Do not add speculative abstractions, dependencies, or scaffolding.
- Within each app, reuse components when screens share a real layout or interaction pattern. Prefer small composable pieces that remove duplication; do not force different users, games, and dates into one component with many conditional branches. Keep web and mobile UI components platform-specific.
- Never weaken validation, authentication, authorization, accessibility, or data-safety checks.
- Never commit credentials or `.env*` files.
- Use **Biome**, not ESLint or Prettier.
- Use `import type` for type-only imports.
- Open a pull request only when the user explicitly asks.

## 2. Product and current scope

Board Game Organizer is a TypeScript monorepo for organizing board-game contacts and matches across
web and native mobile clients.

Implemented product areas:

- Clerk authentication on web and mobile.
- Profile display and logout.
- Social graph: follows, friend requests, friendships, blocks, user search, presence, and contact-based
  suggestions.
- Shareable invites with seven-day expiry and authenticated claim flow.
- Match creation, listing, detail, and invitation lifecycle, including date slots, player limits,
  friend invitations, board-game selection, and immutable result registration with standings.
- Durable notification inboxes, unread state, and optional FCM/APNs push delivery.
- BoardGameGeek catalog import, MongoDB-backed game search, and user collection synchronization.
- English and Italian localization.
- Web Playwright and mobile Maestro end-to-end coverage.

Groups support friend-only invitations, accepted membership, public/private visibility metadata,
admin editing and archival, optional attachment to planning matches, and per-game member leaderboards.
Public discovery and admin-approved join requests are future work. Organizations, session logging,
venues, and marketplace features are not implemented.

## 3. Repository structure

pnpm workspaces and Turborepo manage ten workspace projects.

```text
apps/
  api/      Next.js route handlers, Clerk server auth, MongoDB repositories, zod validation
  web/      Next.js App Router, React, HeroUI, Tailwind CSS, Clerk
  mobile/   Expo Router native app, React Native, Clerk, Sentry, heroui-native, Uniwind
packages/
  query/              TanStack Query client and provider
  schemas/            Shared MongoDB models and zod DTOs
  shared/             Shared API helpers, types, and TanStack Query hooks
  store/              Zustand UI and draft-form state
  biome-config/       Shared Biome configuration only
  typescript-config/  Shared TypeScript configuration only
messages/              Shared Lingui catalogs and compiled messages
scripts/release/       Release versioning, changelog, and Telegram helpers
.github/actions/       Local composite CI actions
.github/workflows/     Branch, PR, release, mobile, and catalog-import workflows
```

Current dependency baselines:

- Node.js 26 in CI.
- pnpm 11.25.
- Next.js 16 and React 19.
- Expo SDK 57 and React Native 0.86.
- TypeScript 7 for non-mobile workspaces; Expo-compatible TypeScript 6 for `apps/mobile`.
- Vitest 3.2 (latest compatible baseline; Vitest 5 currently breaks existing JSX transforms and class mocks).

Workspace packages export source files directly; there is no package build step. App alias `@/*`
resolves to each app's `src/*`.

Expo web is not a supported product target. Do not implement or maintain it even though Expo-related
packages may expose web support transitively.

## 4. Commands

Run commands from repository root unless noted.

```bash
pnpm install                         # frozen in CI
pnpm dev                             # all development tasks through Turbo
pnpm build                           # all builds
pnpm lint                            # biome check through Turbo
pnpm typecheck                       # tsc --noEmit through Turbo
pnpm format                          # biome format --write .
pnpm clean                           # Turbo clean
pnpm i18n:extract
pnpm i18n:compile
pnpm release                         # semantic-release; main only

pnpm --filter web dev                # http://localhost:3000
pnpm --filter api dev                # http://localhost:4000
pnpm --filter mobile dev             # Expo development client
pnpm --filter <app> test
pnpm --filter <app> test:coverage
pnpm --filter api test:integration
pnpm --filter api migrate
pnpm --filter api backfill:users
```

No root `test` script exists. Run app/package tests with filters.

### Dependency updates

Use pnpm, keep `pnpm-lock.yaml` synchronized, and install the graph rather than editing only the
lockfile.

```bash
pnpm outdated -r
pnpm update -r                         # compatible updates within declared ranges
pnpm --filter mobile exec expo install --fix
pnpm dedupe
pnpm peers check
pnpm --filter mobile exec expo install --check
```

Upgrade major versions one package family at a time; do not use a blanket `--latest` update without
running and fixing the full validation suite. Expo owns compatible versions of React Native and native
modules. Do not force npm-latest versions over Expo's compatibility matrix. Keep mobile `react`,
`react-dom`, and other exact Expo-managed versions pinned when a caret would let pnpm dedupe to an
incompatible version. Keep Vitest 3.2 until the web JSX transform and constructor mocks are migrated
for Vitest 5.

After any dependency update, run lint, typecheck, unit tests, builds, and relevant integration tests.
Native dependency changes also require a fresh APK and Maestro coverage in CI.

## 5. Environment configuration

Copy examples; never commit generated environment files.

| App | File | Variables |
| --- | --- | --- |
| web | `apps/web/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` |
| api | `apps/api/.env.local` | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `MONGODB_URI`, `MONGODB_DB_NAME`, `ALLOWED_ORIGINS`, `BGG_TOKEN` |
| mobile | `apps/mobile/.env` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN` |

`MONGODB_URI` is mandatory. Transactions require a replica set.

Mobile reads public variables through `apps/mobile/app.config.js` and
`Constants.expoConfig.extra`. Android FCM builds optionally read `GOOGLE_SERVICES_JSON`: EAS may provide a file secret, while
GitHub Actions expects the JSON document as a repository secret. Never commit `google-services.json`. API push delivery optionally uses Firebase service-account and APNs token credentials; web
push optionally uses `NEXT_PUBLIC_FIREBASE_*` values documented in app env examples. Inbox behavior
must remain functional when push credentials are absent. Web public variables must be read inside
`apps/web` and passed to
workspace helpers: Next.js does not reliably inline `NEXT_PUBLIC_*` reads from workspace package
source.

Production endpoints:

- Web: `https://board-game-organizer.com`
- API: `https://api.board-game-organizer.com`

Preview web builds use the immutable API Preview URL; PR mobile APKs use a verified moving
per-PR alias. No E2E job falls back to a development or production API URL.

Vercel preview protection bypass is a **query parameter**, not a custom header. Use
`withProtectionBypass()` so CORS preflight requests reach the protected deployment.

## 6. Data and state ownership

### TanStack Query

TanStack Query owns all server data: profiles, contacts, relationships, suggestions, matches, games,
notifications, and invite results.

Scope authenticated Query keys by API URL, stable Clerk user ID, and resource parameters, not a
rotating session JWT. Clear/cancel private caches when the user or session changes. Clerk session JWTs
rotate: shared hooks receive `getToken` and resolve a fresh token immediately before every request.
Do not retain a token snapshot for later network calls.

On an ordinary authenticated mobile launch, start loading the profile, first pages of matches,
groups, each social list, and BGO contact suggestions, plus the first local address-book page if
permission was already granted. Never request contacts permission at startup. A deep link prioritizes
its own detail instead; other lists may warm afterward. Keep the existing five-second **total** splash
limit: unfinished requests continue without blocking navigation. Paginate API lists at the source;
fetch subsequent pages on demand, not all records during bootstrap. A partial address-book scan must
never replace the complete server contact snapshot: finish the scan before syncing in the background.
Apply the same bounded, cache-first navigation policy on web without adding a web splash.

Reuse cached data between lists and details when the server-authorized response actually contains
all required fields. Fetch a missing match or group through its individual detail endpoint, prefetch
likely next details with bounded concurrency, and keep cached fields visible while missing fields load.
Keep per-resource stale and retention times deliberate. Revalidate stale data in the background on
navigation, rather than polling every list. Notifications alone watch for unrelated remote events
proactively; presence heartbeat and polling while an explicitly started BGG sync is in progress are
narrow exceptions. Relevant notification events may mark affected data stale without fetching every
inactive query.

Every relationship mutation must mark the `['contacts']` prefix stale; if search is active,
`useContacts` must rerun the last query so action state updates without manual refresh. Match creation
must mark `['matches']` stale. Explicit remote mutations update owned Query caches optimistically when
cached state exists, cancel conflicting requests first, then reconcile from the server response and
refetch only affected active data when necessary. Show an action-specific default toast after the
optimistic update; on failure restore affected cache snapshots and show an action-specific danger toast.
Do not invent server-authoritative results or bypass validation. Notification reads, push-subscription
synchronization, logout, profile completion, and background synchronization do not show user-action
toasts.

### Zustand

Zustand owns local UI state and unsaved form state only:

- theme preference;
- selected tabs and open/closed UI;
- match-wizard draft values;
- transient optimistic flags.

Never mirror Query data into Zustand.

## 7. API architecture

API routes live under `apps/api/src/app/api`. Keep route handlers thin. Put data access in repository
classes under `apps/api/src/app/lib` and shared validation in `packages/schemas`.

Current route surface:

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Health probe |
| `/api/profiles` | GET | Current Clerk profile |
| `/api/relationships` | GET, POST, PATCH, DELETE | Social lists and mutations |
| `/api/users/search` | GET | Registered-user search |
| `/api/users/suggestions` | GET | Persisted contact matches |
| `/api/users/presence` | POST | Presence heartbeat |
| `/api/contacts/sync` | POST | Replace caller's matched address-book contacts |
| `/api/invites` | POST | Create invite |
| `/api/invites/claim` | POST | Claim invite and connect users |
| `/api/groups` | GET, POST | List owned/invited groups or create a group with friend invitations |
| `/api/groups/[groupId]` | GET, PATCH, DELETE | Get/edit group or archive it as admin |
| `/api/groups/[groupId]/membership` | DELETE | Leave an accepted group |
| `/api/groups/[groupId]/leaderboard` | GET | List played games and paginated group rankings for members |
| `/api/group-invitations/[invitationId]` | PATCH | Accept or decline a group invitation |
| `/api/matches` | GET, POST | List accessible matches and create planning matches |
| `/api/matches/[matchId]` | GET, PATCH, DELETE | Get detail, atomically update planning fields/invitations, or delete match as admin |
| `/api/matches/[matchId]/choices` | PATCH | Save caller's choice for a match date or game as admin or accepted invitee while planning |
| `/api/matches/[matchId]/status` | PATCH | Admin confirms a shared date/game or reopens planning |
| `/api/matches/[matchId]/results` | POST | Admin atomically records results and terminates a created match |
| `/api/matches/[matchId]/invitations` | GET, POST | List and create match invitations as admin |
| `/api/matches/[matchId]/invitations/[invitationId]` | DELETE | Remove an invitation or accepted player as admin |
| `/api/match-invitations/[invitationId]` | PATCH, DELETE | Accept or decline an invitation; leave a planning match |
| `/api/notifications` | GET, PATCH | List notifications or mark all read |
| `/api/notifications/[notificationId]` | PATCH | Mark one owned notification read |
| `/api/push-subscriptions` | POST, DELETE | Register, rotate, or remove a device push token |
| `/api/bgg/search` | GET | Search imported board-game catalog |
| `/api/bgg/account` | GET, POST, DELETE | Read, validate/link, or unlink caller's BoardGameGeek account |
| `/api/bgg/account/sync` | POST | Continue or retry caller's staged collection sync |
| `/api/bgg/picker` | GET | Paginated collection-first and catalog game picker |
| `/api/bgg/thing` | GET | Get imported game details |
| `/api/webhooks/clerk` | POST | Mirror Clerk user events |
| `/api/admin/sync-user` | GET, POST | Authenticated CI database attestation and administrative user mirror |
| `/api/admin/ci-db` | POST | Authenticated, name-guarded PR E2E database seed/BGG fixture/cleanup |
| `/api/admin/import-games` | GET, POST | Authenticated import preflight and chunked catalog import |

Most routes expose `OPTIONS` through CORS helpers. Keep CORS handling centralized in
`lib/cors.ts`.

### Authentication and users

Clerk user IDs are application identities; there is no separate local authentication identity.
There **is** a MongoDB `users` mirror used by social search and contact suggestions. Clerk webhook
`user.created`, `user.updated`, and `user.deleted` events maintain it. `backfill:users` mirrors
existing Clerk accounts idempotently.

A Clerk account alone does not make a user searchable. The corresponding document must exist in the
`users` collection.

Web and mobile enforce a post-signup mobile-number step before application access. The value is a
required non-empty string with no phone-format or SMS validation, stored in Clerk `unsafeMetadata`
as `mobileNumber`, and mirrored into MongoDB by `user.updated` webhooks. Backfill and administrative
sync paths preserve the same field when present. Contact discovery derives a 7–15 digit lookup key,
normalizes `00` and `+` international prefixes without country inference, and ignores ambiguous
numbers claimed by multiple accounts.

`GET /api/profiles` uses `enrichSingleUser` from `lib/clerk.ts`; do not duplicate direct Clerk calls.
Relationship list enrichment uses local users through `lib/enrichUsers.ts`.

### Collections

`COLLECTIONS` in `lib/db.ts` defines:

- `users`
- `follows`
- `friendRequests`
- `blocks`
- `invites`
- `contactLinks`
- `matches`
- `matchInvitations`
- `groups`
- `groupInvitations`
- `playerRatings`
- `ratingEvents`
- `notifications`
- `pushSubscriptions`
- `boardGames`
- `bggAccounts`
- `bggCollectionGames`
- legacy `relationships`, retained only as a migration constant

`pnpm --filter api migrate` creates indexed social, group, and rating collections and drops legacy `relationships`. Run migrations before deploying routes that write groups or ratings.
The current `RelationshipRepository` writes only `follows`, `friendRequests`, and `blocks`.

### Relationship invariants

- Follow is a directed edge in `follows`.
- Friendship is derived from accepted friend-request records in both directions.
- Block is a directed edge in `blocks`.
- Blocking removes only blocker-to-target follow, preserves target-to-blocker follow, and clears
  pending friend requests. This deliberately prevents blocked users from detecting the block through
  their own follow state.
- Blocked users are hidden from normal lists and search. Connections shows friends, following,
  followers, then blocked users in one list with a connection-type badge on each avatar; blocked
  users remain visible there so unblock is possible. Requests shows received then sent in one list,
  with type badges on avatars and no section header.
- MongoDB operations sharing one session must run sequentially. Never use `Promise.all` on operations
  using the same transaction session.
- DELETE relationship requests include `targetUserId`. Parse DELETE bodies defensively with
  `request.text()` plus guarded JSON parsing so a missing body returns 400, not 500.

### Invites

Invite tokens are 128-bit base64url values with seven-day expiry. Creation links always use
`new URL(request.url).origin`; preview APIs create preview links and production creates production
links. Claim UI is hosted by the API at `/invite/[token]`, uses Clerk modal sign-in, and claims with a
Bearer token. Successful claim connects both users.

### Matches

New matches always start as `PLANNING`. Match creation and initial invitation writes share one MongoDB
transaction. Names, ISO date slots, player limits, game IDs, invitee IDs, friendship, block state, and
catalog existence are validated on the API. `minPlayers` is at least two, `maxPlayers` is not lower,
and at least one date and game are required.

A match may have an optional `groupId`, selected on the first wizard step and editable or removable
only while `PLANNING`; from `CREATED` it is fixed. Ungrouped matches retain the friendship
requirement for invitees. Group match invitees must be accepted members of that group (friendship
is not required), and the admin must also be a member. Revalidate every selected invitee on an
atomic planning edit and every accepted participant before confirmation; never silently remove
incompatible players. Once `CREATED`, an accepted player leaving the group cannot prevent
registering the result or updating both GLOBAL and GROUP ratings. Archiving a group retains its ID
and historical matches and ratings; archived groups cannot be selected or confirmed for new matches.

Match invitations live in `matchInvitations`, not on the match document. Admin counts as one player,
so invitation records cannot exceed `maxPlayers - 1`; declined invitations still occupy their slot
until removed. Only admin can invite, and duplicate invitation records are rejected. While planning, admin can
replace title, dates, games, `minPlayers`, `maxPlayers`, and selected invitees through the same wizard used
for creation. Updated values retain creation constraints. Field changes, new invitations, and invitation
removals are submitted only on the final wizard step and committed in one transaction; `maxPlayers` cannot
drop below `minPlayers` or occupied invitation positions.

Pending invitees can accept or decline while match is planning. Accepted invitees can leave while
planning; leaving deletes invitation so admin can invite them again. Admin can remove pending,
declined, or accepted invitations while planning. Admin alone can delete a match; match and every
invitation are deleted in one transaction. No invitation response, departure, or choice change is allowed after
status becomes `CREATED`. Admin alone may confirm a match once the accepted players plus admin meet
`minPlayers` and every participant has voted `YES` or `IF_NEEDED` for at least one date and game.
Choose the shared option with most `YES` votes; ties prefer an admin `YES`, then original option order.
Confirmation stores selected date/game and hides pending invitees from the created match. Admin may
reopen planning, restoring pending invitees' access and clearing the selected options without erasing
existing choices. Notify accepted invitees only on both transitions.

Match deletion and leaving are destructive actions. Show each action only when current role and
invitation status permit it, require an explicit confirmation dialog, disable repeated submission while
pending, and apply the standard optimistic-cache plus action-specific toast lifecycle. Non-admin match
details expose accepted players only; keep viewer's own pending invitation solely for response actions.

An admin alone registers results while a match is `CREATED`. Every accepted invitee plus admin must
be included once; scores are exact signed decimals, or null for `ND` (did not participate). At least
one player must have played even if the actual count falls below `minPlayers`. Highest score wins by
default; admin may choose lowest wins and explicitly rank any group of equal scores. Unresolved ties
share a position; all `ND` participants appear last. Persist final ranks and scores in one atomic
`CREATED` → `TERMINATED` operation. Terminated matches cannot be edited, reopened or deleted. Match detail Overview holds dates and game selection, with one voting legend beside the match title.
Leaderboards show current ratings for the administrator and accepted invitees only (GROUP for group
matches, GLOBAL otherwise); pending/declined invitees cannot open them. Planning matches select from
proposed games with covers; confirmed/terminated matches show only the selected game. Leaderboards
show games played, games won, withdrawals (ND), current rating, and no deltas. Confirmed-match Players
show email instead of ranking. Web and mobile replace the Players tab with read-only Results only in TERMINATED status. Results keep
player avatar, position badge, name, email, score (or ND), and immutable rating deltas; match cards
identify all first-place players, including unresolved shared first place.

### Board-game catalog

Runtime search reads MongoDB `boardGames`; it does not call BoardGameGeek and excludes entries with
`isExpansion: true`. Import all BGG rankings CSV columns through
`apps/api/scripts/import-boardgames.mjs`, `/api/admin/import-games`, or the manual
`import-boardgames.yml` workflow. Imports use idempotent upserts keyed by BGG ID;
missing games remain for existing matches. Linking a BGG username validates it through XML API2; sync stages a complete non-expansion collection before publishing. A failed sync removes its pending item while retaining any previously published snapshot. Collection games are available regardless of ownership/status; unlink removes private snapshots but not catalog games or match history. Keep the supplied Powered by BGG attribution visible above logout on both Profiles. Set `BGG_TOKEN` on API deployments for authenticated XML API2 calls. Store one validated BGG cover URL in `image`, not a
`thumbnail` database field; full remote imports remove any legacy `thumbnail` fields. Re-import a
complete CSV before enabling the search filter on an older catalog without `isExpansion`.

## 8. Web architecture and UI

`apps/web` uses Next.js App Router and server components by default. Add `"use client"` only for
interactive state or browser APIs. Auth middleware leaves `/`, sign-in, and sign-up public and
protects application routes.

The `(tabs)` group exposes Matches, Groups, Organizations, Contacts, and Profile. Do not repeat a page
or section title inside tab content; main navigation already identifies the section.

Use `@heroui/react` and Tailwind CSS. When HeroUI provides an appropriate component, use it
instead of a custom or native substitute. For unsupported components, build a small accessible
custom component matching HeroUI styling.

HeroUI v3 uses React Aria composition:

- Do not use obsolete `startContent`, `endContent`, `flat`, `light`, or `solid` APIs.
- Put item icons inside item children.
- Attach `onAction` to each `Dropdown.Item`; menu-level `onAction` is not reliable here.
- `Dropdown.Trigger` renders an interactive button; do not nest another Button inside it.
- Prefer the existing custom portal dialog for controlled confirmation dialogs; the HeroUI composite
  modal previously left orphaned overlays.
- Check installed `.d.ts` files before introducing a HeroUI component API not already used.

HeroUI dark mode is class-based. `ThemeScript` sets the initial class from system preference.

Use `lucide-react` icons only.

## 9. Mobile architecture and UI

`apps/mobile` is native-only Expo Router. Root provider order is:

```text
Sentry initialization
GestureHandlerRootView
HeroUINativeProvider
I18nProvider
ClerkProvider
QueryProvider
Expo Router Stack
```

Keep `index.tsx` authentication navigation declarative with `<Redirect>`; an effect-driven
`router.replace` raced cold-start navigation.

Use heroui-native components and Uniwind classes. When HeroUI Native provides an appropriate
component, use it instead of a custom or React Native substitute. Use explicit React Native style objects for
structural layout (`flex`, row direction, gaps, dimensions) because generated utility availability is
not reliable at runtime. Use classes for theme-aware visual styling. Every text element needs a
visible theme-aware color or heroui-native's Typography default.

`global.css` must retain `@source "./src"`; otherwise app utility classes are not generated.

`ThemeSync` maps Zustand `system | light | dark` to `Uniwind.setTheme`. Selected mobile chips and tabs
must visibly reflect active state.

Use `lucide-react-native` icons only.

Address-book suggestions require explicit `expo-contacts` permission. Sync emails and phone numbers
to `POST /api/contacts/sync`; persist only unambiguous registered matches in `contactLinks` and discard
unmatched address-book values. Repeated denials lead to
an open-settings path, not silent permission loops. After every native permission action and whenever
the app returns active from system settings, re-read the native permission and refresh permission-gated
UI immediately; never rely on stale local permission state. When mobile notification permission is
askable, pressing the notification bell requests it directly; do not add a second enable button.

HeroUI Native Skeleton has no intrinsic size. Give each skeleton explicit width, height, and border
radius, and keep parent rows stretched to full width.

Do not add a custom mobile Babel configuration. React Native's Babel/runtime combination and
worklets previously caused release builds to crash at launch. Mobile localization intentionally uses
runtime helpers instead of Lingui Babel macros.

## 10. Shared localization

Lingui configuration lives at repository root. Source catalogs are `messages/en.po` and
`messages/it.po`; compiled catalogs are committed.

```bash
pnpm i18n:extract
pnpm i18n:compile
```

Web uses Lingui macros through `apps/web/babel.config.js`. Mobile uses `useT()` and `translate()` from
`apps/mobile/src/lib/i18n.ts`.

Strings used only by mobile runtime helpers are invisible to Lingui extraction. Add them manually to
both PO files, then compile.

For dynamic web messages, use a descriptor with stable ID and values rather than a runtime template
literal that produces a hashed fallback.

## 11. Loading, errors, and accessibility

- Use skeletons, not spinners, only for data not yet available: initial startup, first access to an
  uncached deep link or detail field, next pages, and searches. Never replace usable cached content
  with skeletons during a background refetch; show partial skeletons only for missing detail fields.
- Keep logout available even when profile loading fails.
- Do not convert network failures into empty-list success states; preserve an observable error path.
- Keep buttons, dialogs, dropdowns, and form inputs accessible by role and label.
- Give actions semantic colors matching their intent: primary for confirmation, danger for destructive
  actions, and neutral for cancellation. Do not rely on color alone to convey meaning. Prefer icon-only
  actions in tight spaces when the icon is self-explanatory; otherwise show text. Every icon-only action
  needs an accessible label.
- On native mobile and mobile-width web layouts, repeated list-row action buttons are icon-only and
  must retain an accessible label. Section-level creation actions may keep a compact text label.
- Search runs automatically after 300 ms, requires at least four characters, and has a clear button;
  do not add a submit button.
- For every variable-length list, default to paginated data and virtualized rendering: use `FlatList` or
  `SectionList` on mobile and pagination (plus windowing when large) on web. Load further pages as the
  user scrolls; do not render an entire address book, search result set, or feed with `ScrollView` plus
  `.map()`, and never nest a virtualized list in a same-direction `ScrollView`. Keep short, fixed-size
  lists simple. Preserve loading, empty, error, permission, and accessibility states while paging.

## 12. Tests

Vitest covers web, mobile pure logic, API, and schemas. Each coverage config enforces at least 50% for
lines, functions, branches, and statements.

Mobile component unit tests are not run under Vitest because React Native 0.86 packages include Flow
syntax loaded outside Vite transforms. Keep mobile unit coverage focused on pure logic; Maestro owns
native UI behavior.

API integration tests use Testcontainers with MongoDB configured as a single-node replica set so
transactions behave like production.

Every product feature requires both:

- Playwright coverage for web in `apps/web/e2e`;
- Maestro coverage for mobile in `apps/mobile/.maestro/flows`.

New and changed feature behavior must have 100% acceptance-path coverage across unit, API, and E2E
suites. Add per-file 100% line, function, branch, and statement thresholds for deterministic logic
measured by Vitest. Because Playwright and Maestro do not expose statement metrics, exercise every
user-visible success, empty, failure, and action path on both clients.

Social E2E uses two provisioned users. Wait for Clerk webhook mirroring before searching for the target.
Never allow missing E2E environment variables to silently skip authenticated tests. Inspect JUnit
skip counts when expected flows appear suspiciously fast.

When extending `useContacts`, update every test mock. UI code reads pending state from each mutation;
a missing mutation object crashes tests before assertions.

Useful validation order:

```bash
pnpm lint
pnpm typecheck
pnpm --filter mobile test
pnpm --filter web test
pnpm --filter api test
pnpm --filter schemas test
pnpm --filter shared test
pnpm --filter api test:integration
pnpm build
```

## 13. CI/CD

Every job using a local action must run `actions/checkout` first. GitHub cannot resolve
`./.github/actions/...` before checkout.

### `branch-ci.yml`

Runs on every non-main branch push:

1. commitlint
2. Biome
3. typecheck
4. unit tests for mobile, web, API, schemas, and shared deterministic helpers
5. API integration tests

No builds, deployments, or E2E.

### `pr-ci.yml`

Runs full pull-request gates:

1. commitlint, Biome, typecheck, unit coverage/Codecov, API integration tests, API/web builds, and mobile-change detection start in parallel;
2. only after quality gates pass, deploy isolated CI API and non-CI development API Previews in parallel; the development Preview remains deployed even if later E2E fails;
3. build both mobile APKs on separate runners as soon as their respective URLs are available; only the CI APK (or verified reuse) targets the moving per-PR API alias;
4. deploy Preview web against the immutable CI API URL, seed `bgo_ci_<run_id>_<attempt>`, and synchronize two test users;
5. run Maestro and Playwright E2E, then clean up CI users and database even on failure;
6. publish only the development-API APK to the draft prerelease and Telegram after every gate and cleanup passes.

A new PR commit cancels the previous run. A trusted `workflow_run` watchdog polls for job failures and cancels the entire PR run; GitHub marks the run `cancelled`, while the failing job retains its failure. A separate trusted `workflow_run` cleanup removes exact-run CI users and the isolated database after cancellation/failure; ordinary in-run cleanup and the periodic Clerk sweep provide fallback.

Mobile change detection compares against the last successful PR workflow run on the branch, not the
PR base. Mobile code, related workspace packages, compiled localization, and changes to the mobile
lockfile dependency graph trigger APK rebuilds. Web/API-only, Maestro-only, unit-test-only, and unrelated
lockfile changes do not. Compare each reusable artifact's own commit with the PR head before reuse.

Preview web uses the immutable isolated API deployment URL; E2E PR APKs use the per-PR alias. The
published PR APK embeds the immutable development API Preview URL. Never point E2E at the development
API. Protected previews receive `VERCEL_PROTECTION_BYPASS` and clients append it to request URLs.

### `main-ci.yml`

On every merge to main:

1. lint, typecheck, unit coverage (mobile, web, API, schemas, shared), and API integration tests run on the merge SHA;
2. that SHA deploys to isolated API/web Previews using test Clerk and `bgo_ci_<run>_<attempt>`; Maestro uses a separate E2E APK, Playwright uses the Preview web app;
3. test users and the run-scoped CI database are cleaned even when E2E fails; failed gates never deploy to production;
4. only the latest verified merge may run semantic-release; the resulting release SHA is pinned for the production APK and deployments;
5. production API and web deploy only after E2E and APK build pass, then run read-only smoke checks;
6. GitHub release publishes the production APK after the gates; Telegram notification sends release links and changelog.

Main verification has no workflow-wide concurrency group so every merge runs E2E. Release preparation alone is serialized; a newer merge can supersede a pending release, not its verification.

Release commits use `[skip ci]` to avoid recursion. If a failed release leaves a tag without a release,
remove the orphan tag and restore version state before retrying; semantic-release treats existing tags
as published history.

Preview/test Clerk uses `CLERK_SECRET_KEY`. Production uses
`CLERK_SECRET_KEY_PRODUCTION` and production publishable-key variables. Never mix instance keys: tokens
from one Clerk instance return 401 against the other.

### Other workflows

- `mobile-development.yml`: manual development APK from `main`, attached to latest release.
- `mobile-e2e.yml`: manual Maestro iteration deploys an isolated API Preview and cleans its own CI database.
- `import-boardgames.yml`: manual BoardGameGeek CSV import into a chosen API deployment.

## 14. Required GitHub configuration

Repository secrets used by workflows:

- `EXPO_TOKEN`
- `GOOGLE_SERVICES_JSON` (optional; Firebase Android configuration JSON used only for push-enabled APKs)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_WEB_PROJECT_ID`
- `VERCEL_API_PROJECT_ID`
- `VERCEL_PROTECTION_BYPASS`
- `CLERK_SECRET_KEY`
- `CLERK_SECRET_KEY_PRODUCTION`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RELEASE_PAT`
- `CODECOV_TOKEN`

Repository variables used by workflows:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_API_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`

## 15. Git workflow

`main` is protected. Never commit or push directly to it.

For each feature, fix, documentation change, dependency update, or CI change:

1. start a new branch from current `main`;
2. implement the complete task;
3. run relevant checks;
4. commit with a signed Conventional Commit;
5. push the branch so `branch-ci.yml` validates it;
6. open a PR only after the user explicitly requests it.

Allowed commit types:

```text
feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert
```

Repository-local signing identity:

```bash
git config user.name "Alessandro Mancini"
git config user.email "alexemancio1985@gmail.com"
git config gpg.format ssh
git config commit.gpgsign true
```

Keep the machine's valid SSH public key in `user.signingkey`. The board-agent container uses
`/root/.ssh/mancioshell_github.pub`; local Windows development uses the configured user key.

Verify signatures with:

```bash
git log --show-signature -1
```

Use `git push origin <branch>`. Do not open a PR proactively.

## 16. Debugging invariants

- Browser `Failed to fetch` without a response usually means unreachable host, deployment protection,
  or CORS. Capture request URLs as well as responses.
- Confirm frontend API URLs after domain changes; changing a Vercel domain does not update baked public
  environment variables.
- Keep profile E2E assertions specific to API-loaded profile content; header display names can create
  false positives.
- Controlled block dialogs may coexist with a dropdown carrying `role="dialog"`; target the intended
  dialog explicitly in Playwright.
- YAML folded blocks (`>-`) join lines. Use literal blocks (`|`) for multiline environment input.
- GitHub Actions `actions/runs` does not honor `conclusion=success` as a query filter; filter returned
  JSON explicitly and pass `GH_TOKEN` to `gh api`.
- Main APK builds need 180 minutes; clean local EAS builds can exceed 90 minutes.

## 17. Board automation

`pi-board-agent` runs separately and uses gitignored `.pi/board-agent.yml`. It manages project-board
refinement, task worktrees, cumulative PRs, CI watchdog behavior, and Telegram notifications.

`/board-agent init-project` creates configured project fields and views. Tokens need repository Issues,
Pull requests, Contents, Actions, and Metadata permissions plus organization Projects read/write.
Never store this token in the repository.


## Groups and ranking domain

A group has one administrator (its creator); administrator counts as a member. Its other members
are accepted invitees. Only friends may be invited into a group, although friendship is not
required later to stay a member or to be invited into a match belonging to that group. Group
creation/editing accepts a name of 5–120 characters, a public/private flag, and zero or more friend
invitations. Public groups are not yet searchable: later, outsiders may request to join, subject
to admin approval. Private groups remain invitation-only. Only the administrator may edit or
archive a group; accepted members may leave. Archival is a soft deletion: it hides the group from
lists and prevents new matches while retaining IDs, created matches, results, and rating history.

Web and mobile group flows mirror match flows: a card opens a dedicated detail screen;
create/edit open a separate screen with header back navigation, and invitation slots open a
friend-picker screen. Use HeroUI switches for visibility and icon-bearing primary actions.

Player ratings use **OpenSkill** (the installed JavaScript implementation of the Weng–Lin
multiplayer model), not Glicko-2 or Elo. Each player is a one-person team, and a whole match's
final ranks (including unresolved ties) are passed to one `rate` call per scope. Withdrawn (`ND`)
players share last place, lose against finishers, and draw against other withdrawn players. If
fewer than two participants have scores, terminate the match but do not change ratings or
`gamesPlayed` for anyone. A rated match adds exactly one to `gamesPlayed` per player and scope,
not one per opponent. Ratings are keyed by `userId + selectedGameId + scope`, where scope is
`GLOBAL` or `GROUP(groupId)`. Group matches update both scopes using **pre-match** snapshots;
ungrouped matches update only GLOBAL. Never use games proposed but not selected.

New OpenSkill state uses its native defaults `mu=25`, `sigma=25/3`; `tau` uses the library's
default. Group ratings are initialized lazily: if a pre-match global rating exists, start from its
`mu`, inflate uncertainty to `min(25/3, max((25/3)*200/350, global.sigma*1.5))`, and start the
**group** `gamesPlayed` at zero. Otherwise use new-player defaults. Thereafter the two scopes
evolve independently. Conservative leaderboard score is `mu - 3*sigma` (OpenSkill `ordinal`).
Provisional means `gamesPlayed < 5` in that game and scope; it disappears after the fifth rated
physical match even if sigma remains high. Group ratings may remain provisional after the global
rating is established. No historical test matches are backfilled.

Persist mutable rating snapshots and immutable before/after/delta events in the *same MongoDB
transaction* as immutable match finalization. Unique indexes prevent duplicate processing;
concurrent matches sharing a player must retry against fresh pre-match snapshots. Keep the
OpenSkill calculation separate from persistence, and store enough immutable match outcomes and
algorithm version to recompute ratings under a future model: OpenSkill and Glicko-2 numbers cannot
be converted directly. Group detail shows member-only game leaderboards including withdrawals and historical members;
no public leaderboard search endpoint is exposed. Cover deterministic rating logic and group authorization
with unit/integration tests; exercise new user-visible flows on web and mobile.
