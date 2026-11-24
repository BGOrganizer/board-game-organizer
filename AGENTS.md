# AGENTS.md

Instructions for coding agents working on **Board Game Organizer**.

## 1. Source of truth

Read this file before changing code. Then inspect the files touched by the task and every caller of
shared code being changed. Prefer current code and workflow files over historical notes.

Core rules:

- Keep changes small, complete, and tested.
- Keep user-facing feature behavior in parity across web and mobile unless a platform exception is
  explicit.
- Internationalize every user-facing string and update both English and Italian catalogs.
- Fix root causes in shared code instead of patching each caller.
- Do not add speculative abstractions, dependencies, or scaffolding.
- Never weaken validation, authentication, authorization, accessibility, or data-safety checks.
- Never commit credentials, private MCP configuration, or generated environment files. Tracked
  `.env.example` templates may contain names and placeholders only.
- Use **Biome**, not ESLint or Prettier.
- Every runtime UI color must come from HeroUI semantic tokens: no component-local RGB/hex,
  Tailwind palette colors, obsolete v2 shade classes, or parallel palette. Use the installed HeroUI
  default light/dark palettes and foreground/background pairs without app theme-variable overrides.
  Provider artwork keeps its brand colors; required dark artwork uses an existing HeroUI light
  surface scope for contrast, never a literal white backplate.
- Use `import type` for type-only imports.
- Read applicable existing domain/operations documents before changing that area; link them rather
  than duplicating their specifications. This file and README describe current behavior, not a roadmap.

### Task execution and subagents

- Execute simple tasks, small fixes and narrowly scoped changes directly. Do not use subagents for
  routine implementation or review when startup, handoff and coordination would take longer than
  the work itself.
- Use subagents for complex tasks, long refactors and broad investigations. Assign cohesive,
  clearly bounded work; parallelize independent pieces when it reduces total delivery time.
- Keep one writer per working directory/worktree. The parent agent remains responsible for
  integration, verification and the final result; delegation never replaces required checks.
- Honor explicit operator overrides and harness delegation rules. This standing authorization for
  complex tasks does not authorize a workflow engine run without the operator's explicit opt-in.

## 2. Product and required references

This Bun/Turborepo TypeScript monorepo has web and native mobile clients backed by one API.
Board Game Organizer supports **Groups / Events / Tables**, social contacts, game collections,
profiles, notifications and game results.
The [unified contract](docs/groups-events-refactor.md) governs roles, consent, planning modes,
votes, explicit manager confirmation, immutable results and list eligibility.
Legacy writers stay retired; historical database records remain intact and excluded from unified readers.
Never restore automatic organizer seats, server Event drafts or automatic deadline confirmation.
Documentation work authorizes no database reset, migration or provider mutation.

Read the relevant guide before changing its area, including when shared changes affect its callers:

| Area | Required instructions or contract |
| --- | --- |
| API routes, repositories and server authorization | [apps/api/AGENTS.md](apps/api/AGENTS.md) |
| Web components, routing and browser integration | [apps/web/AGENTS.md](apps/web/AGENTS.md) |
| Native components, routing, permissions and builds | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |
| Shared hooks, queries, mutations, cache and startup | [State and cache](docs/state-and-cache.md) |
| Localization and catalogs | [Development localization](docs/development.md#localization) |
| Profiles and BGG collection visibility | [Profiles](docs/profiles.md) |
| Social activities and source visibility | [Community](docs/community.md) |
| Skills for the affected task | [Agent skills](docs/agent-skills.md) |
| Provider isolation, CI, cleanup and releases | [Operational gates](docs/organizations-events-operations.md) |
| Artwork and exports | [Branding](docs/branding.md) |
| Runtime acceptance and verification limits | [Verification requirements](docs/implementation-progress.md) |

Subdirectory instructions specialize the root rules without duplicating them. Explicit operator scope
and repository invariants override generic skill examples. Historical notes never grant permission
for new provider operations or establish production/device acceptance.

## 3. Workspace and commands

`apps/api`, `apps/web` and `apps/mobile` own application entry points and platform adapters.
`packages/shared` owns pure domain logic and reusable hooks; `schemas` owns models/DTOs;
`query` owns Query setup; `store` owns local UI/drafts. Configuration packages remain small.
Current versions come from manifests and `bun.lock`, not copied version lists.
Use Node.js 26 and the Bun version declared in the root `packageManager`, synchronized with CI
and EAS; preserve Expo-managed exact mobile pins.
Keep Vitest and its coverage provider aligned across tested workspaces; major upgrades require
the migration and full verification described in [development](docs/development.md#dependency-updates).

Run from the repository root. Bun installs dependencies; Node.js remains the application/test runtime.

| Task | Command |
| --- | --- |
| Install locked dependencies | `bun install --frozen-lockfile` |
| Lint / typecheck | `bun run lint` / `bun run typecheck` |
| One workspace's tests | `bun run --filter web test` (or `api`, `mobile`, `@board-game-organizer/shared`, `@board-game-organizer/schemas`) |
| Coverage | `bun run --filter web test:coverage` (same tested workspaces; API includes MongoDB integration) |
| Web components / React Testing Library | `bun run --filter web test src/components` |
| Native components / React Native Testing Library | `bun run --filter mobile test:components` |
| React render benchmarks / Reassure | `bun run perf:web` / `bun run perf:mobile` |
| Install / run pinned Maestro | `bun run maestro:install` / `bun run maestro --version` |
| Device UI flow | `bun run maestro --device <serial> test apps/mobile/.maestro/flows/<flow>.yaml` |
| Install / run pinned Perfetto | `bun run perfetto:install` / `bun run perfetto --version` |
| Maestro + native trace | `bun run perfetto:maestro --serial <serial> --flow apps/mobile/.maestro/flows/53-group-tabs-perfetto.yaml --seconds 90` |
| One test file | `bun run --filter web test src/components/events/__tests__/useTableSeatOrder.test.tsx` |
| MongoDB integration | `bun run --filter api test:integration` |
| Web E2E | `bun run --filter web test:e2e` |
| API/web builds | `bun run build` |
| Extract / compile translations | `bun run i18n:extract` / `bun run i18n:compile` |

There is no root test script. `bun run build` does not build native binaries.
See [README setup](README.md#get-started), [dependency updates](docs/development.md#dependency-updates)
and each app's instructions. Do not run imports/migrations merely as ordinary validation.

### Raspberry resource limits

The Raspberry is a shared, resource-constrained host; saturation can make it unreachable over the
network. Run at most one heavy local job at a time across all agents and worktrees, including
dependency installation, coverage, typechecks, builds, browser/device tests and large transfers.
Coordinate ownership before starting another job. Use up to three Node test workers when measured
RAM and CPU headroom allow, with bounded worker heaps; reduce worker count if pressure rises.
Run application builds sequentially; do not run the root parallel build on this host. Keep heavy
browsers and Android emulators on remote runners, and use CI for full suites that exceed the local
budget. Verify that a sandbox uses a different physical host before treating it as remote; containers on the Raspberry
share its CPU, RAM and network budget. Monitor
available RAM, CPU load and network activity; stop owned work if pressure rises, then resume
sequentially. Parallel agents may inspect or edit independent worktrees, but may not launch
concurrent heavy commands. Report interrupted checks as incomplete rather than passing.

Verify Docker's memory-controller support and effective container limits; requested limits alone
do not prove enforcement. If the host lacks memory cgroups, bound worker heaps and database caches
explicitly, monitor host memory, and stop only owned work before pressure exhausts the host.
Report unavailable kernel limits separately from the application limits actually verified.

## 4. Architecture and UI ownership

- Keep Next.js and Expo Router entry files in their apps. Keep DOM/HeroUI web and React Native/
  HeroUI Native structure, layout, navigation, permissions, accessibility, and refs platform-owned.
- Prefer an existing helper, then a pure function, then a shared hook; do not extract speculative reuse.
- Share actual platform-independent behavior via pure functions and hooks. Not every non-JSX hook
  belongs in `shared`: Clerk/environment/feedback/native adapters remain in their respective apps.
- Reuse components within each app when a real layout or interaction pattern is shared. Prefer small
  composable pieces over many conditional branches for unrelated content.
- A headless provider may share one workflow instance across children when a hook alone is insufficient.
  It must not impose a universal page layout, host UI, placeholder slots or duplicated Query/store data.
  Avoid giant contexts and module-level mutable user/request state.
  Preserve narrow Next.js client boundaries; never mark the whole shared package `"use client"`.
- Use `children` for static composition and render props when returning state/actions to children.
  Do not build a universal page renderer with platform flags or `cloneElement` contracts. Share
  behavior such as paging, while keeping web/native rendering and accessibility platform-owned.
- Use installed HeroUI controls where available. Custom controls must cover an unsupported need and
  retain accessibility and the existing semantic styling.
- One public/top-level component per file, named after it. Private components used only in that
  module may remain there, defined at module scope rather than inside render. Framework route
  metadata/configuration exports are allowed. Short local hooks/types/helpers need not each split.
- Components should stay focused and readable. Around **400 implementation lines** warrants a
  responsibility/branching/repeated-markup review, not a hard ceiling or lint/CI gate. Extract
  cohesive pieces when it improves clarity/testing; do not fragment or add indirection just to
  reduce line count. Total file lines including comments/types/private helpers are not complexity.
- Use feature folders inside each app's `src/components`, such as `events`, `groups`, or
  `profile`. Promote to `common/ui` only for proven cross-feature reuse. No empty scaffolding,
  giant barrels, private cross-feature imports, or replacement HeroUI kit.
- Apply conventions to requested new/touched work. Do not rename/refactor the whole repository as
  a side effect. Explicit refactors preserve all callers, EN/IT, coverage paths, and web/native
  acceptance; a static folder test is not runtime behavior evidence.

## 5. Loading, errors, and accessibility

- Use skeletons, not spinners, only for data not yet available: initial startup, first access to an
  uncached deep link or detail field, next pages, and searches. Never replace usable cached content
  with skeletons during a background refetch; show partial skeletons only for missing detail fields.
- Keep logout available even when profile loading fails.
- Do not convert network failures into empty-list success states; preserve an observable error path.
- Keep buttons, dialogs, dropdowns, and form inputs accessible by role and label.
- Application-owned header icons use 20px Lucide glyphs and HeroUI `sm` actions; native touch targets
  remain at least 44px. Reuse each app's `common/layout/headerStyles` and existing header components.
  Back controls keep native navigation dispatch and existing route-removal/inline-picker guards;
  reset merged header options explicitly so inline picker controls never leak into the parent.
- Give actions semantic colors matching their intent: primary for confirmation, danger for
  destructive actions, and neutral for cancellation. Do not rely on color alone to convey meaning.
  Prefer icon-only actions in tight spaces when the icon is self-explanatory; otherwise show text.
  Every icon-only action needs an accessible label.
- On native mobile and mobile-width web layouts, repeated list-row action buttons are icon-only and
  must retain an accessible label. Section-level creation actions may keep a compact text label.
- Discovery/search runs automatically after 300 ms, requires at least four characters, and has a clear
  button; do not add a submit button. Main Events/Tables, owned Private/Public Groups and Group-context
  Events instead use Filter inputs with an accessible name, no visible label or inline help, no
  minimum length, a 300 ms debounce and a clear action. Their escaped name query stays inside the
  selected authorized list before paging. Group Search retains its four-character discovery minimum.
- For every variable-length list, default to paginated data and virtualized rendering: use
  `FlatList` or `SectionList` on mobile and pagination (plus windowing when large) on web. Load
  further pages as the user scrolls; do not render an entire address book, search result set, or
  feed with `ScrollView` plus `.map()`, and never nest a virtualized list in a same-direction
  `ScrollView`. Keep short, fixed-size lists simple. Preserve loading, empty, error, permission, and
  accessibility states while paging.
- Retained infinite-query pages are not the initial render budget. On list/picker entry and reentry,
  derive only a bounded visible page/window, reveal cached pages progressively before requesting
  more, and keep the authoritative Query pages intact. Do not flatten/filter every cached page
  before slicing. Reset local presentation for a changed API/user/query/snapshot; reject stale
  callbacks, coalesce duplicate end events and guard any in-flight fetch. Reuse stable row identities,
  callbacks and memoized derivation; tune virtualization without assuming fixed row heights.
  Reset-to-top is valid when the flow allows it; do not keep a full hidden picker mounted solely
  for speed. Follow [client responsiveness defaults](README.md#client-responsiveness-defaults).
- Profile both entry/reentry and Back/selection-to-form transitions. Query/MMKV cache hits avoid
  data reloads, not React/native subtree mounting, validation, serialization or layout work. Keep
  expensive synchronous work out of navigation handlers; verify the destination as well as list
  teardown. Source/unit measurements are not native frame-timing evidence.

## 6. Data and state ownership

- TanStack Query owns all remote data; Zustand/local state owns UI and unsaved drafts only.
- Scope private keys by API URL, stable user ID and resource parameters, never a rotating JWT.
  Resolve a fresh token with `getToken` immediately before each request; preserve cancellation,
  session-owner isolation and cache purge on logout/account changes.
- Reuse canonical query factories and the scoped optimistic journal/intent layer. Cancel conflicting
  reads first; reconcile authoritative receipts and roll back only the failed operation.
  Never fabricate consent, capabilities, IDs, frozen rosters or final results, including for cold caches.
- Reconcile relationship mutations with Contacts and active search; Event/Table mutations with Events/Groups,
  not retired Match caches. Preserve per-action pending state and default action/error toasts;
  reads, logout, push sync, profile completion and background sync do not acquire action toasts.
- Native eligible canonical data uses the central encrypted account/API-owned persistence policy.
  Do not persist credentials, raw contacts, optimistic overlays, transient searches or mutations.
  Restored data grants no authentication/consent/capability. Purge safeguards include late callbacks.
- Notification reads and pending decisions remain separate: only actual invitation responses grant
  consent and acknowledge those decisions. Container entry, time, focus, scrolling or votes never read notices.
  Source acknowledgments reconcile related indicators immediately, preserving later/unshown information.
- Read [State, cache and startup](docs/state-and-cache.md) for workers, polling exceptions,
  persistence eligibility and mutation behavior; [Notification attention](docs/groups-events-refactor.md#notification-attention)
  owns dots, Alerts and partial-read semantics.

## 7. Verification

Vitest covers web, native React components, API, shared logic and schemas. Include all first-party
application and package runtime sources in coverage, including web and mobile components and
uncovered files. Require **at least 90% lines, functions, branches and statements across the entire project**.
Keep isolated unit tests distinct from component integrations using real hooks, Query and cache.
Testing Library events run in the test renderer; they are not browser/device E2E journeys.
Coverage may combine both layers; Playwright/Maestro acceptance and Reassure measurements stay explicit.
Do not achieve this by omitting components, narrowing the source set, lowering thresholds, adding
unjustified ignore hints, replacing the component under test, or treating source-text checks as
executed behavior. Test-only files, generated output, type declarations and third-party code are
not application runtime sources; keep any such exclusions explicit and justified.

Before committing and pushing, run only new or modified test files locally, after scoped lint and
typechecking. Select the files explicitly with the workspace's test command. Run unchanged test
files and complete workspace coverage in CI on the pushed revision. The 90% coverage gate is
verified by CI against that exact revision, including required API integration coverage.

API integration tests use Testcontainers with MongoDB configured as a single-node replica set so
transactions behave like production.

On Raspberry Pi 4, use the configured **OpenSandbox MCP** runner for real MongoDB tests. Package
the current worktree with `/opt/bgo/snapshot.mjs` (`createSnapshot` accepts a custom worktree and
output directory). Create the sandbox with `sandbox_create`, image `bgo-local/test-runner:1.0`,
entrypoint `["sleep", "infinity"]`, one CPU and 2 GiB RAM. The stack injects
`BGO_TEST_MONGODB_IMAGE` for its installed, verified Pi 4-compatible MongoDB 7 build, along with
the Docker test network and Testcontainers settings.
Use `command_run` to run `node /opt/bgo/run-tests.mjs integration` for the
standard snapshot. For a scoped test or isolated snapshot, keep the runner's sanitized environment,
locked Bun install and single-worker settings. Collect the exit status and report, then always
call `sandbox_kill`. This runner shares the Pi with the coding container and counts toward its
heavy-job limit. See `docker/raspberry/README.md` in the Raspberry's primary checkout (`/workspace`),
which also covers the configuration shared by linked worktrees.

The API's `test:coverage` combines its unit and integration projects into one source-wide report;
Docker is required. Its ordinary `test` command selects the unit project only. Do not treat either
partial API report as the complete 90% gate or replace real repository tests with mock-only coverage.

Component tests use the actual application component implementations: React Testing Library for
web and React Native Testing Library for mobile. Use Vitest for both. Mocks belong at explicit
external-service, provider and device/native-runtime boundaries, never in place of the component
under test. Replace hand-written React Native/HeroUI facsimiles and VM-based UI harnesses with
equivalent actual-component behavior tests before removing their existing assertions.

Use the project-locked `react-native-testing` skill (official Callstack guide), `perf-control`
(Reassure guidance) and `perfetto` (official Perfetto guide) for the corresponding work. Their
files live under `.agents/skills/<name>/SKILL.md`; sources/integrity are in `skills-lock.json`.
The project uses Vitest, so translate generic Jest timer/mock examples to `vi` rather than adding
a second runner. Testing Library has no separate test CLI; use the commands above. Reassure uses
its measurement module with the actual Testing Library renderer; its Jest-oriented CLI is not used.

Every component needs meaningful render/update scenarios with Reassure assertions, including
rerender-count contracts calibrated from repeated observed samples. Record durations and sample
counts; apply timing regression limits only against a stable, host-matched baseline. A passing
finite-duration assertion alone does not establish a performance budget. Coverage-instrumented
runs are not performance measurements. See [React benchmarks](docs/render-performance.md).

For native responsiveness investigations, capture a bounded Perfetto trace around a focused
Maestro flow, then analyze it using the **project-pinned** `bun run perfetto` tool. Verify the
owned Development device, binary/API and fixture prerequisites in
[native profiling](docs/native-performance.md). Keep traces private, inspect trace errors/data loss
and report missing metrics as unavailable. React render time, native frame completion,
input acknowledgment and visible target readiness are different measurements; do not substitute
one for another. Run capture/automation as the Raspberry's single heavy job, with SQL analysis
afterward; never launch Chrome or another build concurrently for profiling.

Every product feature requires both:

- Playwright coverage for web in `apps/web/e2e`;
- Maestro coverage for mobile in `apps/mobile/.maestro/flows`.

New and changed feature behavior must cover every required acceptance path across unit, API, and E2E
suites. Add per-file 90% line, function, branch, and statement thresholds for deterministic logic
measured by Vitest. Because Playwright and Maestro do not expose statement metrics, exercise every
user-visible success, empty, failure, and action path on both clients.

Social E2E uses two provisioned users. Wait for Clerk webhook mirroring before searching for the
target.

When extending `useContacts`, update every test mock. UI code reads pending state from each
mutation; a missing mutation object crashes tests before assertions.

Run scoped lint and typecheck first, then the new or modified tests. Use the
[command table](#3-workspace-and-commands) and app guides for the affected workspaces and any
applicable build or UI acceptance checks.

E2E coverage requirements and CI enablement are separate. Retain/update required Playwright and Maestro
paths and report what was actually executed. Read workflow files and the operational gates for CI
enablement and release checks. Green unit/build/source checks do not prove authenticated browser/native
acceptance. Never silently skip missing authenticated test configuration or fabricate reports. Inspect
JUnit skip counts when expected journeys complete suspiciously quickly.

## 8. Git and delivery

`main` is protected. Never commit or push directly to it.

For each feature, fix, documentation change, dependency update, or CI change:

1. honor the operator's selected branch and local-only/commit/push scope; otherwise start a new branch from current `main`;
2. implement the complete task;
3. run the scoped checks in [Verification](#7-verification);
4. when authorized and the scoped checks pass, commit with a signed Conventional Commit;
5. when authorized, use `git push origin <branch>` so the unified branch/PR CI validates the
   complete suite and coverage gate;
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

Keep the machine's valid SSH public key in `user.signingkey`; use the configured local signing identity.

Verify signatures with:

```bash
git log --show-signature -1
```

Netlify and Vercel deployment jobs remain independent. Use the matching GitHub, Infisical and
provider environments and attest the deployed database before directing traffic. See
[parallel Netlify deployment](docs/organizations-events-operations.md#parallel-netlify-deployment).

Every job using local GitHub actions must checkout first. CI/workflow files and
[operational gates](docs/organizations-events-operations.md) govern actual routing, required checks,
APK provenance, isolated fixture cleanup and publication. Never bypass protection, reuse unverified
artifacts or treat default-branch controllers as activated by a feature-branch edit.

## 9. Security, configuration and external services

- Populate private per-app env files from their `.env.example` templates. Infisical is the deployment
  configuration source of truth. No credential rotation, environment sync, CORS/provider changes,
  provisioning or publication follows merely from skill installation or a code/documentation edit.
- `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` are public client values. Never log/export/commit tokens,
  credentials, raw address-book data or arbitrary request bodies, or bake secrets into images.
- Clerk Organizations are not BGO Groups/Organizations. Application membership, moderation and
  permissions belong to the MongoDB/API domain; never infer tenancy from shared naming.
- Use MapTiler and installed MapLibre APIs, verified canonical provider locations/time zones and attribution.
  Keep public map keys separate from the API geocoding key. BGO is noncommercial; comply with actual
  quotas and storage terms, without inventing a commercial-subscription requirement.
- Sentry guidance does not authorize new PII collection, replay/profiling/logging or sampling changes.
  Preserve release/Fabric safeguards. Existing `sendDefaultPii: true` needs explicit privacy review,
  not incidental modification during unrelated work.
- Preview bypass is a query parameter through `withProtectionBypass()`, never a custom header.
  Preserve exact test/production Clerk and run-scoped database isolation; no E2E fallback to production.
- Preserve [LICENSE](LICENSE) (`AGPL-3.0-only`), copyleft/source-availability obligations,
  third-party notices and attribution. Do not change licensing terms without explicit operator scope.

## 10. Skills

Load the project-locked `ponytail` guide at `.agents/skills/ponytail/SKILL.md` for programming
work across all apps, packages, scripts and workflows. Use its **full** level by default unless
the operator selects another level or disables it. Apply the smallest complete change within
the existing architecture; required callers, EN/IT parity, safeguards and verification remain
part of completion. Its minimum-test guidance never reduces this repository's required coverage.

Read [Agent skills](docs/agent-skills.md) for task selection, inventory, installation scope and
conflict resolution. Guides supplement these instructions; they do not authorize new work,
provider operations, dependencies or changes to project conventions.
