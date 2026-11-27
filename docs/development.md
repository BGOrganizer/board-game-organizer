# Development reference

This guide holds implementation details linked from the [README](../README.md).
Read [AGENTS.md](../AGENTS.md) before changing code and the relevant domain contract before changing behavior.

## Client responsiveness defaults

Apply these best practices to every new or touched client flow; they are not optional optimizations
reserved for the game picker. Existing ownership, privacy and authorization rules in
[AGENTS.md](../AGENTS.md#6-data-and-state-ownership) remain authoritative.

- **Bound presentation independently from cache.** Keep source paging and virtualized rendering.
  On entry/reentry, expose a bounded cached page/window and reveal more cached pages before fetching.
  Derive only that window, not a full-cache flatten followed by a slice. Preserve cached pages,
  stable row keys/callbacks, accessibility and loading/error states. Web windowed lists retain the
  latest viewport and commit a viewport-driven render when the visible row range changes.
  Reset-to-top is acceptable when
  the flow allows it. The mobile game picker exposes eight source items initially, retaining six-row
  render batches and its seven-screen window. It reveals cached chunks on scroll or an accessible
  load-more action, not on an automatic initial `onEndReached`. These are picker-specific budgets,
  not universal constants or fixed-height assumptions.
- **Compact filter controls.** The shared `FilterChips` component in each client gives Group and Event
  roles, collection and game picker filters a 28 px visible face. Web coarse pointers and native screens
  retain a 44 px touch target. Filter groups wrap to fit the available width and expose selection
  and disabled state through their HeroUI buttons. Group and Event ordering uses the shared platform
  `ListOrdering` control beneath the filters.
- **Optimistic feedback for explicit remote actions.** Use the shared scoped journal/intent layer
  on web and native: cancel conflicting reads, project owned cached state or pending intent,
  reconcile the real acknowledgment and roll back only the failed operation. Do not invent consent,
  capabilities, server IDs, frozen results or records for a cold cache. Unknown outcomes require
  verification, not blind replay. Reads, unsaved local edits and background/authentication workflows
  retain their existing behavior; they do not acquire user-action toasts merely to look optimistic.
- **Central encrypted MMKV persistence for eligible native Query data.** Reuse the account/API-owned
  adapter described in [Native cache and builds](#native-cache-and-builds), reviewing each query family's privacy and retention/budget eligibility.
  Persist canonical bases only; never optimistic overlays, credentials, raw contacts or transient
  provider searches. Restore does not grant authentication or permissions. Preserve logout/session
  purge safeguards. No separate feature cache, duplicated Query state or web MMKV adapter.
- **Measure both directions.** Faster list opening does not prove faster Back or selection return.
  Cached data can still require rebuilding an editor's native controls; cache snapshots can still
  require serialization. Profile JS work, React/native mount/commit and storage separately on a
  current native build. Do not hide costs with arbitrary delays, disabled animations or unbounded
  hidden lists. Unit/source checks and desktop timings are not device-frame acceptance.

### Native render profiling

Resource cards keep notification-context reads in a small wrapper and pass the scalar count to
a memoized body. Artwork and Group/Event/Table indicators have their own memo boundaries, shared
by list and detail cards. Row verification callbacks are stable and background fetching changes
only the verifying optimistic rows' busy state. These boundaries preserve real resource, language,
theme, identity and visibility updates; they cannot prevent a subtree from mounting after a tab
switch replaces its scroll owner.

The installed React Native tooling includes **React Native DevTools**; no additional profiling
library is required. Use its React Profiler to record commits and why components rendered, and its
Performance panel to separate JavaScript work from network activity. See the
[React Native guide](https://reactnative.dev/docs/0.86/react-native-devtools) and
[Expo debugging tools](https://docs.expo.dev/debugging/tools/).

Both CI APK lanes use the `internal` EAS profile and release mode, including the APK named
Development. That APK does not expose the development Profiler. Use the existing `development`
profile for a diagnostic native build, connect it to Metro (`bun run dev --max-workers 1` from
`apps/mobile` with the existing Development configuration), then open DevTools with `j` on the
developer workstation. On the Raspberry keep the DevTools browser/device on another host and
honor the [resource limit](../AGENTS.md#raspberry-resource-limits).

The [Android debug APK workflow](../.github/workflows/mobile-debug.yml) uses that existing
`development` profile, verifies the `.dev` package and Android's `debuggable` flag, then uploads
`apk-debug-<source SHA>` as a seven-day Actions artifact. It resolves only an open, same-repository
Development PR and rejects Production Clerk keys. It does not publish an OTA, release or Telegram
message. Its branch-scoped push trigger bootstraps the workflow before default-branch registration;
manual dispatch still follows GitHub's default-branch availability rules. JavaScript-only edits
are served by Metro and do not trigger another diagnostic native build.

The diagnostic workflow temporarily selects React Native's `debugOptimized` variant: native C++
libraries use release optimizations while Metro, Hermes inspection and React profiling remain
available. It restores the exact original `eas.json` bytes after the build, including failures;
the tracked normal profiles stay unchanged because Expo fingerprints the whole file. Artifact
provenance records `debug-optimized` and the effective EAS configuration digest; this is still a
development client, not a standalone release APK. Use it to avoid attributing unoptimized native
debug overhead to product behavior, then calibrate final frame timings against a standalone release build.

Record first entry, cached reentry, subtab changes, opening/closing a popover, background refetch,
and Back navigation for Groups, Events and Tables; include Contacts as a comparison. Save the
trace with the source SHA, build mode, device, dataset size and cache state. Distinguish rerenders
from remounts. Native component tests use React Native Testing Library with the installed React
Native and HeroUI implementations. Isolated unit tests control application dependencies; component
integration tests also exercise real hooks, Query and cache. Native IO adapters and fixture layout
events cover boundaries unavailable in Node. Separate Reassure suites measure React commits;
Maestro and device profiling verify complete user journeys, native layout, gesture latency and FPS.
See [rendering verification and its limits](render-performance.md); JavaScript timings are not
screen-load acceptance.

The native runner registers the actual Metro-compiled Uniwind stylesheet and delegates external
CommonJS React Native imports to the app's installed Uniwind Metro resolver. Its importer checks
preserve raw React Native/Uniwind internals and public SDK identities. The test-only
[interop adapter](../apps/mobile/performance/uniwind-native-interop.ts) temporarily wraps Node's private
CommonJS loader and supplies the native export condition on Node.js 26; it restores the loader after
RNTL cleanup. Run `NativeUniwindInterop.native.test.tsx` when updating that toolchain. This adapter
does not rewrite external ESM absolute facades or dependencies already embedded in the native
registry, and its styling assertions do not establish native pixel/layout or frame-timing acceptance.
The [horizontal scroll adapter](../apps/mobile/performance/horizontal-scroll-interop.ts) maps only
Android's horizontal native binding to the runner's existing scroll host so RNTL can deliver events.
It preserves React Native/HeroUI JavaScript, horizontal props, public refs and command axes; it does
not alter the device binding. Run `NativeHorizontalScrollAdapter.native.test.tsx` after tool updates.

## Native cache and builds

- Native cache-first restart: authoritative TanStack Query data persists in account/API-scoped,
  AES-256 MMKV with random device-only SecureStore keys. Restore waits for Clerk identity; it is not
  offline authentication. Snapshots retain up to 24 hours, 200 queries and an 8 MiB conservative
  serialized budget; older entries are evicted. Native infinite refreshes restart at page one.
  History is first in the three-worker priority warmup described in the
  [state/cache contract](state-and-cache.md); four first datasets gate splash, never beyond five total
  seconds. Cached content stays visible during refresh.
  Logout/account or session changes purge owned disk/key and cancel RAM work. No optimistic intents,
  raw address-book scans, credentials or offline write replay persist. Storage failures retain usable
  RAM/network behavior and show a nonblocking localized warning.

Native MapLibre and MMKV/Nitro require a native build, not Expo Go or a JavaScript-only update.
Use the mobile package's `android` or `ios` script for local builds with the appropriate native toolchain.
Assess native performance and runtime acceptance with the [verification requirements](verification-and-acceptance.md).

## BoardGameGeek catalog

Local setup uses the rankings CSV described in [scripts/mongodb/README.md](../scripts/mongodb/README.md).
The Compose importer stages and validates CSV rows, then merges them into `boardGames` by BGG ID;
missing catalog games and XML-enriched fields remain intact. It does not replace the catalog.
Every container start repeats the import before becoming healthy. `docker compose down` preserves the volume.

Remote imports use [the import CLI](../apps/api/scripts/import-boardgames.mjs). The direct database alternative is
[import-boardgames-direct.ts](../apps/api/scripts/import-boardgames-direct.ts).
These are operator tasks with explicit environment/credential checks, not application startup steps.
Both remote and direct import use the complete rankings CSV parser.

User synchronization requests owned games (`own=1`) in separate base-game and expansion partitions;
expansions are excluded from playable selection. Linking and synchronization require an API-side `BGG_TOKEN`.

Game metadata comes from BoardGameGeek XML API2 (`thing?stats=1`). Both clients batch requests for
currently visible game rows with missing details. Collection page reads also enrich that page,
including verified collection IDs absent from the catalog. Search, collection and game details share the same limit of one BGG request every five seconds. `categories` records BGG category links.
An empty array means the provider returned the game without categories, and a missing field means
the categories are unavailable. A busy quota or unavailable provider keeps the cached page usable; there is no full-catalog
scan or provider request inside a transaction. HTTP 202/429 retain the shared one-minute backoff.
`metadataAttemptedAt` records parsed metadata attempts and prevents retrying unavailable/partial
metadata for five minutes. `weightCheckedAt` advances only for a finite BGG `averageweight` from 1 to 5; missing/zero
weight remains eligible after the existing retry delay. Weight is stored as `averageWeight` on
canonical games and returned by search, detail, collection and picker DTOs.
`durationCheckedAt` and `playerCountsCheckedAt` advance only when BGG
returns the corresponding complete valid pair. Existing verified values survive omitted/invalid
responses. Missing minutes are eligible even with a legacy fresh success timestamp; successful
complete metadata retains the existing seven-day freshness policy. Refresh happens on a subsequent
API read, not by polling or by automatically scanning later pages.

Game rows show an information badge on the cover. The popover shows publication year, BGG rating
and ranking, BGG playing time, Best BGG player counts, difficulty out of five and category chips.
The difficulty icon uses the HeroUI success token through 1.5, warning through 3, accent through 4,
and danger above 4. Missing fields show individual loading placeholders while enrichment runs and
an unavailable state when BGG has no usable value. Table scheduling uses its own effective duration.

BGG player-count recommendations retain the complete `suggested_numplayers` poll as
`suggestedPlayers` (Best/Recommended/Not Recommended counts per exact or open-ended count,
per-row samples, provider total and fetched timestamp). Classification uses a strict unique
plurality; ties, absent rows and zero samples are unknown. These are community preferences,
not replacements for hard min/max players. Game information shows at most the first two ascending
distinct Best counts, with the share of samples for each count (for example `4 (68%)` or `6+ (75%)`). Unknown
recommendations remain absent; do not infer Best from a range or player limit. Omitted/invalid polls
preserve previous verified data and do not acquire a new success timestamp. The existing quota,
retry and HTTP 202/429 backoff apply.

After a complete successful remote CSV import, the import CLI follows with bounded
enrichment of the first 200 base games with positive integer general rank, sorted by rank then ID.
Each API request hydrates at most 20 IDs under the shared quota; orchestration stays in the CLI.
Partial CSV runs do not start enrichment. Fresh records are skipped; incomplete batches report
counts and fail explicitly without rolling back the usable CSV. Rerunning resumes through the
metadata cache; other catalog games remain lazily enriched. No import is performed merely by
installing or testing this code. See [Event planning](groups-events-tables.md#event-planning-settings-and-seat-order).

## Delivery

[Branch/PR CI](../.github/workflows/pr-ci.yml) runs quality, unit and MongoDB integration checks.
Without an open main-targeting PR it stops at branch checks. With one, the PR event owns the full pipeline;
the push run routes without duplicating it. Internal validation and Development publication have distinct dependencies.
Browser and native E2E run as separate acceptance suites. PR and Main delivery currently use source,
build and smoke gates without those suites. See [verification and acceptance](verification-and-acceptance.md).

[Main CI](../.github/workflows/main-ci.yml) and [operational gates](deployment-operations.md) define actual deployment, isolation and release requirements.
Infisical is the deployment configuration source of truth. Keep test/production Clerk instances and runtime databases isolated.
Use signed Conventional Commits; open a PR only when requested.

Workflow display names are **CI**, **Release**, **CI cleanup**, **CI watchdog** and **Test users**.
Job labels use action + target, with CI/Development/Production distinguished for deployment and APKs.
`CI` also handles branch checks. APK reuse compares each candidate's actual inputs and checksum;
there is no separate unused last-green mobile-diff job. Its regression suite remains part of CI contracts.
The README badge keeps the native GitHub workflow URL and displays the short `CI` workflow name.

### Independent CI recovery workflows

Normal per-run user/database cleanup already lives in `pr-ci.yml`. Three separate controllers
provide recovery independently of that run:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `pr-ci-fail-fast.yml` | PR CI `workflow_run: in_progress` | Watch shared quality jobs and cancel the source run after a shared failure; lane-specific failures remain isolated. |
| `pr-ci-cleanup.yml` | PR CI `workflow_run: completed`, unsuccessful same-repository PR runs only | Recover run-scoped test users and the isolated database after failure/cancellation using verified deployment evidence. |
| `e2e-user-cleanup.yml` | Hourly at minute 17 UTC, or manual dispatch | Sweep marked E2E users older than two hours only after GitHub verifies their owning CI run is completed; active or unidentifiable owners stay untouched. |

GitHub emits these events; the main workflow does not call the controllers with `uses`.
The workflow-run controllers use trusted default-branch code. Keeping recovery outside the
source run allows it to execute after that run is cancelled; putting it solely in the cancelled
run would lose that independence. Scheduled orphan cleanup also needs to run when no PR runs.
See [controller activation](deployment-operations.md#trusted-controllers-and-activation)
before treating branch edits as live protection.

## Bun installation and runtime

When switching package managers in an existing checkout, move the old root and workspace
`node_modules` trees into an ignored backup before the first Bun install. A frozen install
does not remove every stale nested package left by a different linker; a fresh checkout
also avoids this problem. Keep the backup until installation and checks have passed.

Use the Bun version declared in the root `packageManager` for installation and script orchestration;
retain Node.js 26 for Next.js, Vitest, Expo and CLI shebangs. `bun.lock` is the only package-manager lockfile, workspace globs,
version overrides and native patches live in the root `package.json`, and `bunfig.toml` explicitly
keeps hoisted installs. The exact Bun version is shared by CI and every EAS profile; local EAS
builds use the runner's installed Bun. Vercel receives exact-version frozen install and build commands without
changing its application runtime to Bun.

The [dependency policy](../scripts/dependencies/README.md) preserves registry-only sources, the
one-day age gate for newly resolved versions and the previous lifecycle-script allowlist.
Bun's automatic env loading is disabled: app/framework loaders and explicit per-app injection
remain responsible for private configuration. Do not use `--bun` to switch the runtime incidentally.
A Bun security scanner hook enforces this policy before installs; it is not a CVE scanner.

## Dependency updates

Use Bun, keep `bun.lock` synchronized, and install the graph rather than editing only the
lockfile.

```bash
bun outdated
bun update --recursive             # compatible updates across all workspaces
bun run --cwd apps/mobile expo install --fix
bun dedupe
bun run --cwd apps/mobile expo install --check
```

Upgrade major versions one package family at a time; do not use a blanket `--latest` update without
running and fixing the full validation suite. Expo owns compatible versions of React Native and
native modules. Do not force npm-latest versions over Expo's compatibility matrix. Keep mobile
`react`, `react-dom`, and other exact Expo-managed versions pinned when a caret would let Bun
dedupe to an incompatible version. Keep Vitest and its coverage provider aligned across tested
workspaces. Major upgrades must migrate JSX transforms, constructor mocks, worker settings and
coverage mapping together; preserve explicit source inclusion and existing coverage thresholds.

After any dependency update, run lint, typecheck, unit tests, builds, and relevant integration
tests.

Native dependency changes also require a fresh APK and applicable Maestro acceptance. CI enablement
follows the workflow files and [operational gates](deployment-operations.md).

## Environment configuration

Copy examples; never commit generated environment files.

| App | File | Variables |
| --- | --- | --- |
| web | `apps/web/.env.local` | Clerk publishable key, API URL, public MapTiler key; optional Firebase web push and Sentry |
| api | `apps/api/.env.local` | Clerk server/webhook keys, MongoDB, server MapTiler key, origins, BGG; deadline-worker and optional push configuration |
| mobile | `apps/mobile/.env` | Clerk publishable key, API URL, public MapTiler key; optional Sentry/FCM |

The tracked per-app `.env.example` files define variable names and placeholders. Infisical is the
configuration source of truth for deployments. Build/runtime database isolation is documented in
[operational gates](deployment-operations.md#infisical-and-deployment-isolation);
never copy private values into documentation, Git, logs, or a different environment.

`MONGODB_URI` is mandatory. Transactions require a replica set.

Location search uses MapTiler forward address/POI geocoding, including venue names; reverse lookup
remains address-only. Persist only server-reverified provider labels/coordinates and location-derived
time zones, never unverified free text. A verified POI need not have a street/civic address. Set `NEXT_PUBLIC_MAPTILER_API_KEY` for web, `EXPO_PUBLIC_MAPTILER_API_KEY` for mobile (and GitHub Actions APK builds), and server-only `MAPTILER_GEOCODING_KEY` for API deployments. Configure the public web key on Vercel web Preview/Production and the geocoding key on Vercel API Preview/Production. Keep MapTiler/OpenStreetMap attribution visible. MapTiler Free terms limit commercial use; review plan and storage terms before production. Native MapLibre requires a development build, not Expo Go. Never commit token values.

Mobile reads public variables through `apps/mobile/app.config.js` and `Constants.expoConfig.extra`.
Android application identity uses `APP_VARIANT=development|production`, independently of the
EAS Gradle profile (both CI APK lanes use `internal`). Local configuration defaults to Development;
the EAS `development` and `production` profiles select their matching variants. For an `internal`
build select `APP_VARIANT` explicitly. Development uses `com.bgo.boardgameorganizer.dev`,
`bgo-dev:` links and a localized Dev launcher name; Production uses `com.bgo.boardgameorganizer`
and `bgo:`. The iOS identifier remains `com.bgo.mobile` with `bgo:` links. Android package changes
require fresh installs: the former `com.bgo.mobile` APK is not upgraded in place. Retained Android
Maestro journeys target the Development package and scheme.

Android FCM builds optionally read `GOOGLE_SERVICES_JSON`: EAS may provide a file secret, while
GitHub Actions expects the JSON document in the selected environment's `GOOGLE_SERVICES_JSON`
secret. Supplied JSON must contain a client matching the selected Android package; invalid files
fail configuration without logging their contents. Use the respective Development/Production
Firebase project and API sender credentials; changing identifiers also requires matching EAS
signing credentials and fresh native authentication/deep-link/push acceptance. Never commit
`google-services.json`. API push delivery optionally uses Firebase service-account and APNs token
credentials; web push optionally uses `NEXT_PUBLIC_FIREBASE_*` values documented in app env
examples. Inbox behavior must remain functional when push credentials are absent. Web public
variables must be read inside `apps/web` and passed to workspace helpers: Next.js does not reliably
inline `NEXT_PUBLIC_*` reads from workspace package source.

For Android variant acceptance, install both fresh APKs on one owned device, check their localized
launcher labels and independent permissions, open each variant's scheme, sign in through the
corresponding Clerk instance and verify each environment's push reaches only its own installation.
Keep test fixtures isolated; the retained Maestro journeys target Development. Config/prebuild and
unit checks do not establish installed-device coexistence or actual push delivery.

Sentry uses separate projects for Web and Mobile: configure the Web project's public DSN as
`NEXT_PUBLIC_SENTRY_DSN` in the Web app's Infisical/Vercel environments, and the Mobile project's
DSN as `EXPO_PUBLIC_SENTRY_DSN` in the Mobile environments. Do not exchange their DSNs.
Web selects `production` only for `VERCEL_ENV=production`; Preview/local builds use `development`.
Mobile selects the environment from `APP_VARIANT` in its Expo configuration, including release-mode
Development APKs. Neither platform derives this label from `NODE_ENV` or `__DEV__`.

Web instruments browser, Node and Edge errors within the Web app; it does not instrument the API.
Without a Web DSN, event delivery is disabled. Web tracing, replay, logs and breadcrumbs are not
enabled, and error events remove structured user/request context. Exception messages/stacks remain:
do not include credentials or private payloads in thrown errors. Web builds do not upload source maps
or create/finalize Sentry releases. Mobile retains its existing monitoring/privacy settings and
release/Fabric safeguards. Unit/build checks do not establish live delivery: verify an owned test
error in the correct project/environment after deployment and after installing each fresh APK.
The opt-in browser envelope check runs with `SENTRY_ACCEPTANCE_WEB_DSN` and an owned local/Preview
`PLAYWRIGHT_BASE_URL`: `bun run --filter web test:e2e --config e2e/sentry.config.ts`.
It intercepts delivery to test Development project/environment routing, removed context and ingest
failure tolerance without publishing test events; it does not prove live Sentry ingestion.

### Mobile OTA updates

`expo-updates` enables native Android/iOS bundle updates after a fresh binary containing this
configuration is installed. Existing APKs without it cannot acquire the capability through OTA.
Expo web is not a product target. Native automatic checks are disabled (`checkAutomatically: NEVER`):
after startup, the app checks without downloading and offers a HeroUI **Update and restart / Later**
dialog on the main read-only lists. Download starts only after acceptance. Later dismisses the
dialog for the current JS session, including background/foreground transitions, until the next full
app start. There is no daily cooldown or persisted dismissal. Editors, confirmation overlays,
pending selections, keyboard, background state and in-flight mutations block prompt/restart.
The navigation guard includes Expo Router 57's generated `__root` navigator and subscribes to
container readiness and state changes. Accepting an update checks the live full stack again,
including editors retained behind another route.
If they appear during download, a new confirmation is required when safe again. Check failures
are reported without blocking startup; download/restart failures offer retry or Later. An accepted
download can also be applied by Expo on the next cold start. Development clients use their
Extensions preview flow instead of this standalone release behavior.

`runtimeVersion` uses Expo's `fingerprint` policy to reject native-incompatible updates. This is
separate from CI's provenance digest. `EXPO_UPDATE_CHANNEL` defaults to `APP_VARIANT`; optional
explicit values are `development` or `ci-pr-N` for Development, or only
`production` for Production. CI selects `ci-pr-N` for isolated test APKs, the shared `development`
channel for every distributed PR APK and `production` on Main. The shared `internal` EAS profile
deliberately has no `channel`: its native header comes from the validated app config. The named `development`
and `production` profiles fix their matching channels. APK artifacts record `update-channel.txt`,
and the configuration digest includes the channel before reuse. Production APK builds and OTA
exports select the documented `internal.environment=production` setting in the same temporary
EAS configuration, restoring the original bytes afterward. Development uses the tracked file
unchanged; Production never implicitly loads Preview variables through the shared profile.

PR Development and Main Production publication automatically publish an Android OTA after their
quality, deployment, smoke and current-source gates. Isolated `ci-pr-N` builds do not publish OTA.
See [operational gates](deployment-operations.md) for artifact/runtime checks and ordering.
For an explicitly authorized manual publication, use the EAS CLI's `update --channel <channel>
--environment <environment> --platform android --message <message>` from `apps/mobile`.
SDK 57 requires the EAS environment flag. Supply the same `APP_VARIANT`, `EXPO_UPDATE_CHANNEL`,
API URL, public keys, Sentry DSN, bypass and Firebase configuration as the verified publication APK;
do not dump them into logs. EAS environment values must agree with the intended Infisical configuration.
`fingerprint.config.js` excludes Expo version/build-number labels and retains the SDK default
Android/iOS script filter. Its SDK `fileHookTransform` excludes only `test` and `test:*` commands
from the package script input in every environment; other scripts, native build hooks and native
dependencies remain covered. Adopting this filter changes the runtime once and requires a new APK
for Development and Production; subsequent test-command edits do not require another native build.
The transform also excludes only `extra.apiUrl` when both variant and
channel are `development`: that JavaScript endpoint comes from the active OTA manifest. The Preview
API URL remains separate per PR; it does not require a global Development domain or a Vercel plan
change. A compatible update from another PR brings its own verified API URL when accepted and
restarted. Production and isolated CI still include their API URL in the fingerprint.
Native dependencies, permissions, Firebase, channel, other app configuration and `eas.json` still
participate: changing these requires a new APK. The per-PR Development alias is bound only after
delivery gates. CI compares the export runtime with the verified APK before uploading.
JavaScript changes must also remain compatible with that API; a native fingerprint does not
validate server contracts.

All PR publications share the `development` channel and a serialized publication job. Its most
recent compatible publication is offered to installed Development builds, including builds from
closed PRs. Concurrent PRs share this testing lane; publishing one changes the offered bundle and
API together. PR prereleases remain separate. A new APK must be installed once to move from the old
`development-pr-N` native header and fingerprint to this shared lane. Native-incompatible changes
still require a new APK; a shared channel never overrides runtime matching.

Install a compatible base binary manually when the installed version lacks this consent policy,
uses another channel/runtime or cannot start its OTA check. An older `ON_LOAD` binary can apply an
update automatically and cannot acquire true download consent through a JavaScript-only popup.
Subsequent compatible JavaScript/asset changes use the automated OTA lane.

Keep `EXPO_TOKEN` server-side. Local EAS setup may read this single value from Infisical staging
`/github` into the process environment; never put it in Expo `extra`, a public variable or Git.
Before Production publication, validate a compatible owned Development update and its recovery
behavior. Manual native acceptance is documented in the [Maestro guide](../apps/mobile/.maestro/README.md#manual-ota-startup).

| Production surface | Origin |
| --- | --- |
| Public Site | `https://board-game-organizer.com` |
| Web application | `https://app.board-game-organizer.com` |
| API and MCP | `https://api.board-game-organizer.com` |

The [Main workflow](../.github/workflows/main-ci.yml) currently uses the public Site URL for its
Web smoke request and Telegram Web link. The Site sign-in action targets the application origin.

Preview web builds use the immutable API Preview URL; PR mobile APKs use a verified moving per-PR
alias. No E2E job falls back to a development or production API URL.

Vercel preview protection bypass is a **query parameter**, not a custom header. Use
`withProtectionBypass()` so CORS preflight requests reach the protected deployment.

## Debugging invariants

- Browser `Failed to fetch` without a response usually means unreachable host, deployment
  protection, or CORS. Capture request URLs as well as responses.
- Confirm frontend API URLs after domain changes; changing a Vercel domain does not update baked
  public environment variables.
- Keep profile E2E assertions specific to API-loaded profile content; header display names can
  create false positives.
- Controlled block dialogs may coexist with a dropdown carrying `role="dialog"`; target the intended
  dialog explicitly in Playwright.
- YAML folded blocks (`>-`) join lines. Use literal blocks (`|`) for multiline environment input.
- GitHub Actions `actions/runs` does not honor `conclusion=success` as a query filter; filter
  returned JSON explicitly and pass `GH_TOKEN` to `gh api`.
- Main APK builds need 180 minutes; clean local EAS builds can exceed 90 minutes.

## Localization

Lingui configuration lives at repository root. Source catalogs are `messages/en.po` and
`messages/it.po`; compiled catalogs are committed.

```bash
bun run i18n:extract
bun run i18n:compile
```

Web uses Lingui macros through `apps/web/babel.config.js`. Mobile uses `useT()` and `translate()`
from `apps/mobile/src/lib/i18n.ts`.

Strings used only by mobile runtime helpers are invisible to Lingui extraction. Add them manually to
both PO files, then compile. Preserve these manually maintained entries when extraction marks them
obsolete; absence from the default extractor does not mean a `useT()` message is unused.

For dynamic web messages, use a descriptor with stable ID and values rather than a runtime template
literal that produces a hashed fallback.
