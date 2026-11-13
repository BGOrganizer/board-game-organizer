# Groups and events: operational gates

The [unified domain](groups-events-refactor.md) governs current behavior. These procedures cover
provider/environment isolation, moderation, diagnostics and delivery. Legacy Inngest writers are
unregistered; confirmation is manual. This guide does not authorize provider operations or database resets.
See the [checkpoint](implementation-progress.md) for the limits of recorded verification.

## Database and moderation

- Run `bun run --filter api migrate` against the intended replica-set database before deploying community writes. The migration maintains current Group/Event/Table/registration, social, profile, rating and asset indexes,
  along with retained legacy compatibility indexes; inspect `lib/migrate.ts` for the exact writes. It also drops
  the legacy `relationships` collection.
- Grant global BGO moderation authority only through server-owned Clerk **public** metadata: `bgoRole: "ADMIN"`. Never grant authority through `unsafeMetadata` or a mirrored MongoDB role. Review handlers resolve fresh Clerk authority. Group creators assign accepted Group moderators through the BGO API;
  this separate delegated role is not a Clerk Organization or global BGO moderation grant.
- Pending/rejected changes stay private. Replacing a revision does not discard the approved revision. Referenced logos remain claimed; replaced, unreferenced assets are released for TTL deletion. MongoDB TTL cleanup is asynchronous.

## Preview logo quota and scoped request diagnostics

Only the platform-owned `VERCEL_ENV=preview` skips the five-unclaimed-logo upload quota. Production,
local/missing values and unknown environments retain the guard. `NODE_ENV` and request/client values
never select this exception. Owner locking, authorization, MIME/byte/chunk/image checks, claiming and
24-hour expiry remain unchanged; no existing asset is reset/deleted by this exception.

Group creation/update and logo start/chunk/complete/preview emit `[bgo.group-write]`. Location search
(including reverse lookup) and favorite list/status/save/remove emit `[bgo.location-write]`, including
query/body/DTO rejections before provider lookup. `[bgo.location-verify]` reports candidate counts and
independent address/coordinate match booleans, address-candidate count and canonicalization status.
Verification prefers an exact provider key, otherwise accepts only a unique exact normalized address
and uses that provider's coordinates/timezone. Ambiguous/missing addresses and nearby-only matches
remain rejected. Favorites retain owner-scoped selection/canonical key resolution; no reset/migration
of existing data is required. Logs omit tokens, URLs/query values, identity, names,
addresses, coordinates, images and arbitrary exception messages. Inspect the API Preview baked into
the tested APK, not a different deployment; this instrumentation does not prove the location failure
is fixed. Remove temporary diagnostics after investigation.

### Table invitation conflicts

`POST /api/events/{eventId}/tables/{tableId}/invitations` emits `[bgo.event-write]` with fixed
operation `event.table.invite`. Follow its random `requestId` from `received` through one terminal
result after transaction retries. `status` and normalized `code` preserve the actual response;
no request, Event/Table/user IDs, headers, tokens, URL/query values or arbitrary exceptions are logged.
Candidate GETs and other Event operations remain untraced.

For 409, inspect the JSON response's `error` or the terminal diagnostic code:

- `REGISTRATION_ALREADY_ACTIVE`: the target already has a PENDING/ACCEPTED registration on this Table,
  potentially created after the cached picker loaded or by another concurrent request.
- `TABLE_TIME_CONFLICT`: a PUBLIC Event's target has an overlapping PENDING/ACCEPTED registration or
  demonstrator duty on another Table. Planning uses the longest candidate duration; adjacent bounds
  are allowed. Candidate identity paging excludes same-Table active registrations. Other-Table
  conflicts remain visible with `invitationBlockReason: TABLE_TIME_CONFLICT`; clear candidates return
  null. Web/native disable the invitation action and keep a separate question-mark explanation
  interactive. They reuse the write guard's policy, including non-playing demonstrators. No
  conflicting Table identity is exposed. Cached availability cannot replace fresh transactional
  validation; a concurrent assignment may still cause this 409 after an enabled selection.
- `EVENT_NOT_PLANNING`: the Event is no longer planning.
- `EVENT_BOOKING_CLOSED`: the exact PUBLIC registration cutoff has been reached.

Invitations submit a target user only, not an Event version: `EVENT_CHANGED` is not this POST's
version guard. A status/timing-only platform report cannot distinguish the above causes. Share
only the diagnostic fields or sanitized response body. New logging requires the corresponding API
Preview; an installed APK pointing to an older immutable origin does not switch to a new deployment.
These logs do not relax any consent, membership, transaction, duplicate or overlap guard.

## Retired deadline workers

Legacy automatic cutoff closure, Match creation, sleeper recovery and deadline outbox execution are
retired and must not be registered or restored. `/api/inngest` retains SDK verification but no legacy
writers are registered. Current Events require explicit manager confirmation and exact server cutoff guards.
Historical records remain intact; documentation cleanup does not authorize migration or deletion.

## Infisical and deployment isolation

Infisical remains the source of project environment values. The shared deployment action uploads
source and builds on Vercel, where synced Secrets are available; it does not export them with
`vercel pull` or require Secret-to-Config conversions. `NEXT_PUBLIC_*` values remain browser-public
regardless of their Vercel type. Generated per-deployment build configuration explicitly selects
`bun run --filter api build` or `bun run --filter web build` and the corresponding app's `.next` output;
API deployments must not build Web with API-only environment values. Project settings are not changed.

Per-deployment overrides never update project variables. For isolated API Previews, build-only
`BGO_CI_DB_NAME=bgo_ci_<run>_<attempt>` first validates that Infisical's base `MONGODB_DB_NAME` equals
its non-CI `CLERK_WEBHOOK_DB_NAME`, then sets the build process's database to the CI name and consumes
the flag before child workers. `--env MONGODB_DB_NAME=...` sets the same isolated runtime database.
Webhook routing stays non-CI. Development API deployments receive no CI override. Authenticated
runtime attestation must pass before seeding; cleanup uses the successful deployment's recorded
DB name, including partial reruns. Web public-key validation runs inside the actual Vercel build.

GitHub `development` and `production` each contain the same 12 Secret names:

- Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_API_PROJECT_ID`, `VERCEL_WEB_PROJECT_ID`,
  `VERCEL_PROTECTION_BYPASS`.
- Clerk: `CLERK_SECRET_KEY`, resolved from the job's selected environment.
- Mobile: `EXPO_TOKEN`; `GOOGLE_SERVICES_JSON` for optional push-enabled APKs. In GitHub,
  `GOOGLE_SERVICES_JSON` contains the original JSON document, not Base64 or a file path; the build
  action writes it to a restricted temporary file and passes that path to Expo.
  Both PR APK lanes select `APP_VARIANT=development` (`com.bgo.boardgameorganizer.dev`);
  Main selects `production` (`com.bgo.boardgameorganizer`), including EAS upload configuration.
  This selection is independent of the shared `internal` EAS build profile. The configuration
  digest includes the variant to prevent cross-environment APK reuse. Firebase client JSON and
  API sender credentials must belong to the corresponding environment; these code changes do
  not synchronize credentials, provision signing identities or attest installed-device acceptance.
- Release/reporting: `RELEASE_PAT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. The existing
  `CODECOV_TOKEN` entries are unused: coverage uploads authenticate with GitHub OIDC, using
  `use_oidc: true` and job-scoped `id-token: write`. Upload failures and signature verification
  remain blocking; no static-token fallback is used.

Every custom-secret consumer selects `development` in PR/branch and cleanup workflows, or
`production` in Main delivery, including coverage uploads and release preparation. The workflow
contract tests enforce this. GitHub environment selection does not select an Infisical environment:
the deployed API reads the Vercel value supplied by its existing sync. MongoDB credentials,
webhook secrets and other server-only configuration stay in Infisical/Vercel, not GitHub.

All 12 repository duplicates were removed at the operator's explicit request, including the seven
still consumed by older default-branch workflows without an environment. Until the operator merges
these workflow changes, those older jobs no longer receive their credentials; a feature-branch edit
does not complete that rollout. The legacy repository `CLERK_SECRET_KEY_PRODUCTION` was also
removed at the operator's request; no repository Secrets remain.
Each environment has four Variables with identical names: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN`.
Development Clerk keys use the test instance and Production keys use the live instance; no
`_PRODUCTION`-suffixed variable or cross-environment fallback remains. Production URLs use the
canonical custom domains. Development URL variables record the last published Development preview;
they are reference defaults, not moving aliases. PR builds/deploys retain their own verified
run-specific URLs instead of falling back to these defaults. `EXPO_PUBLIC_WEB_ORIGIN` is currently
configuration only and has no runtime consumer. Only `EXPO_PUBLIC_MAPTILER_API_KEY` and
`EXPO_PUBLIC_SENTRY_DSN` remain repository-scoped, shared by explicit operator choice.

## Unified branch/PR CI rollout

`pr-ci.yml` owns non-main push and main-targeting PR events. A push without an open PR runs
quality-only checks; with an open PR it routes without duplicating the PR pipeline. Push routing
and PR execution use different concurrency keys; PR execution retains `pr-<number>` so a new commit
also cancels runs created by the previous workflow definition. Lookup failure is an error, not a
reason to skip checks. Fork PRs do not enter secret-consuming lanes.

Common quality gates feed two independent lanes:

- Internal owns the isolated API/database, CI web, CI APK, users, mirroring, optional retained E2E
  and exact-run cleanup. `PR ready` requires every common/Internal/cleanup result. Its job still
  evaluates after failed dependencies, so a skipped prerequisite cannot masquerade as readiness.
- Development owns a non-CI API, dedicated web using that immutable API, and an APK embedding the
  same API URL. Publication verifies artifact checksum, source head, current PR, active run/attempt
  and newer same-head runs. Draft release/Telegram announce **Development availability**, not a
  successful PR or E2E. They do not wait for Internal or CI cleanup. A Development-only failure
  may leave the overall workflow red while `PR ready` is green; the failure remains visible.

`BGO_PR_E2E_ENABLED` is an explicit workflow policy, currently `'false'`. Only the two matching E2E
skips are permitted by the aggregate gate. Setting it to `'true'` requires actual success of both
retained suites. No skips or script/VM tests establish authenticated browser/native acceptance.
Main delivery and manual operations follow the explicit operator-approved policy below; these
PR changes alone do not establish live default-branch activation.

### Workflow names and required checks

The short workflow names are `CI`, `Release`, `CI cleanup`, `CI watchdog` and `Test users`.
Controller subscriptions and APK reuse accept both old and new source labels during rollout;
the watchdog also recognizes old and new shared-quality job names. The final aggregate check
keeps its existing `PR ready` / `Branch checks` labels.

Renaming workflow/job display names requires a coordinated default-branch rollout and review of
GitHub branch-protection required checks. The current remote configuration still lists historical
individual job labels, including retired labels; editing YAML does not migrate these settings.
Do not claim that new check labels satisfy those historical requirements. Changing required checks
is a separate repository-settings operation, not performed by this local workflow refactor.

### CI script ownership and cleanup safety

Deploy composites own their minimal tool setup; native builds own dependency installation unless
APK cache inspection has already installed the same checkout. EAS publication also installs locked
workspace dependencies to resolve Expo config plugins; notification-only helpers need just tooling. Unit/integration/build jobs keep
their locked workspace installation and the two publication lanes remain independent.

Per-run cleanup deletes explicit provisioned IDs and/or the exact run/attempt username namespace;
it never falls through to an age sweep. The scheduled sweep requires a development Clerk key,
E2E metadata, a recognized owner namespace and minimum age, then verifies a completed same-repository
PR CI run through GitHub. Active/queued reruns, unknown legacy owners and unavailable ownership
verification never authorize deletion. Candidate pages are collected before deletion to avoid
shifting Clerk pagination offsets. Production Clerk keys are rejected before requests.

CLI pins, third-party action SHAs, cleanup regression tests and local validation commands are
indexed in [GitHub automation](../.github/WORKFLOWS.md). No remote settings or services are changed by
local tests, and local checks do not establish device/E2E acceptance or measured CI savings.

### PR Development downloads

Each PR has one public Development prerelease, separate from stable releases and never marked
Latest. Telegram uses its stable page URL; the current APK retains revision/run naming and
checksum verification. New previews use `development-pr-<number>`; an existing draft keeps its
tag/page when promoted, avoiding duplicate releases. Only a managed preview tag can advance to
the verified PR head, with an exact Git lease and fresh current-run checks. Stable tags remain untouched.
After uploading and verifying the new asset, the publisher verifies anonymous access to both the
page and APK before retiring captured previous APKs. EAS upload remains attempted first; its link
is omitted only for the existing recognized monthly-quota exception. Publication does not certify E2E acceptance.

### Activate trusted controllers before relying on lane independence

`pr-ci-fail-fast.yml` and `pr-ci-cleanup.yml` execute trusted **default-branch** definitions, not
PR versions. A feature-branch push neither activates absent controllers nor replaces an old
cancel-on-any-failure watchdog. Inspect the actual default branch: absent controllers provide no
cancellation recovery; an older watchdog can still cancel the opposite lane. Do not claim active
controller coverage or verified runtime independence before the coordinated rollout.

Land the compatible watchdog/script and their regression tests through the normal protected-main
review/merge process before activating the full pipeline. The watchdog recognizes both existing
unit-job names and new context/coverage names and cancels only shared routing/quality/API-web build
failures. Keep its existing workflow-name subscription. Do not disable the watchdog or bypass
branch protection as a shortcut. The separate trusted cancellation/failure cleanup remains enabled,
uses exact run/attempt evidence and never targets Development resources. No cleanup-script,
secret/provider configuration or production workflow change is required for this restructuring.

The independently applicable trusted-controller bundle is:

```text
.github/workflows/pr-ci-fail-fast.yml
.github/workflows/pr-ci-cleanup.yml
.github/scripts/ci-fail-fast.mjs
.github/scripts/__tests__/ci-fail-fast.test.mjs
.github/scripts/cleanup-pr-e2e.sh
.github/scripts/cleanup-e2e-clerk-users.sh
```

Use these files from the verified implementation revision on a new branch based on current `main`,
not a cherry-pick that implicitly imports the whole feature branch. Run the standalone watchdog
check (`node --test .github/scripts/__tests__/ci-fail-fast.test.mjs`), shell syntax and workflow validation.
Opening that maintenance PR or merging it still requires the operator's explicit scope; do not
push directly to `main`. Observe actual trusted runs after activation before migrating settings.

### Migrate required checks without an unguarded merge window

1. Snapshot `main`'s current `required_status_checks` response. Preserve its `strict` value, app
   association and all other branch-protection settings. Do not disable enforcement temporarily.
2. After the trusted controller is active, observe a real `pull_request` run of `pr-ci.yml` for
   the current PR head. Verify its run/head/attempt identity and the **successful `PR ready` job**
   and GitHub Actions check-run. A similarly named push job, an old head, a skip or a fabricated
   status is insufficient. If Internal/cleanup failed, fix and rerun instead of migrating early.
3. Atomically replace only the obsolete duplicated Branch/PR check contexts with the exact
   `PR ready` context and its observed GitHub Actions `app_id`, retaining unrelated required
   checks. Use the required-status-checks subresource, not a replacement of whole branch protection.
   Do not append `PR ready` while leaving retired names permanently Expected.
4. Read settings back and inspect the PR merge box. Confirm `PR ready` is required on its current
   head; missing/failed mandatory Internal or cleanup results must block merge. Development-only
   failure must not block Internal or turn the required gate into a false success. Re-enabling E2E
   must require both successes without another protection migration.
5. Retain the snapshot for rollback. If the old workflow is restored, restore its corresponding
   contexts together; do not leave a required name that no longer runs. Controller rollback must
   likewise be coordinated with the pipeline, never by silently dropping cleanup/protection.

Read-only evidence commands (substitute the observed repository/run/head):

```bash
gh api repos/BGOrganizer/board-game-organizer/branches/main/protection/required_status_checks
gh api repos/BGOrganizer/board-game-organizer/actions/runs/RUN_ID
gh api repos/BGOrganizer/board-game-organizer/actions/runs/RUN_ID/jobs --paginate
gh api repos/BGOrganizer/board-game-organizer/commits/HEAD_SHA/check-runs --paginate
```

Local routing, gate, mocked-HTTP and DAG tests plus actionlint validate source behavior only.
They do not change live branch settings, deploy a trusted controller or attest provider/device E2E.
Run the regression suite with `node --test .github/scripts/__tests__/*.test.mjs`.

## APK rebuild and reuse

Mobile change detection compares against the last successful PR workflow run on the branch, not the
PR base. Mobile code, related workspace packages, compiled localization and changes to the mobile
lockfile dependency graph trigger APK rebuilds. Web/API-only, Maestro-only, unit-test-only and
unrelated lockfile changes do not. Compare each reusable artifact's own source commit with the PR
head, and verify its checksum/size and matching API/environment inputs before reuse.

CI web uses the immutable isolated API URL; E2E APKs use the verified per-PR alias. Published
Development web and APK both use the immutable Development API Preview URL. Never redirect E2E
at Development or Production. Preview protection bypass remains a secret query parameter.

## Main delivery and manual environment selection

By explicit operator request, Main delivery has no browser/native E2E gates or their Preview APK,
API/web deployments, Clerk fixtures or application CI database/cleanup. Biome/typecheck/CI-script
checks, five unit coverage suites, replica-set API integration coverage and API/web verification
builds run in parallel on every merge. Codecov signing verification and both unit/integration uploads
are blocking. Only the latest verified merge prepares the version/changelog/tag. APK, production
API/web deployment, read-only smoke, private release staging, verified APK upload and final release
publication use the pinned release SHA. Telegram follows successful publication/deploys and a
current-main check. The existing narrow exhausted-EAS-quota exception remains. No app-store
submission, provisioning, secret synchronization or database migration is introduced.

The removed `mobile-e2e.yml` is not a remaining manual GitHub gate. Maestro/Playwright suites and
retained disabled PR hooks still exist for explicitly owned local acceptance. Losing automatic E2E
means that green coverage, builds and smoke **do not attest** native startup, keyboard, permissions,
authenticated UI or full user journeys. A failed prepared release can leave a tag/draft; apply the
existing explicit orphan/version recovery procedure, never silently delete tags or call it published.

Main verification has no workflow-wide concurrency group: every merge is checked. Only release
preparation is serialized, so a newer merge may supersede a pending release, never its verification.
Release commits use `[skip ci]` to avoid recursion. If preparation leaves an orphan tag without a
published release, coordinate tag removal and version-state restoration under explicit release-recovery
scope before retrying; semantic-release treats existing tags as published history. Do not perform
that recovery as an incidental documentation change.

Preview/test Clerk uses `CLERK_SECRET_KEY`; Production uses `CLERK_SECRET_KEY_PRODUCTION` and
production publishable keys. Never mix instances: their tokens are not interchangeable.

The standalone manual mobile-build and BGG import workflows have been removed. Mobile delivery
uses the PR/main pipelines. Remote catalog imports remain available through
[the import CLI](../apps/api/scripts/import-boardgames.mjs) and the direct database importer.
Operators must verify the intended API/database and Clerk environment before forwarding credentials.

The Node importer
and the direct Preview-only MongoDB importer share `parseBoardGamesCsv`, the strict complete
16-column model and repository upserts by BGG ID. BOM, quoted/reordered columns, expansion flags,
zero ranks/averages and nullable category ranks are preserved. Missing catalog rows/history are not
deleted. Reimports do not overwrite XML-derived `image`, complete min/max player pairs, durations
or their cache timestamps; those fields are not present in the rankings CSV. Only legacy `thumbnail`
is removed, including a final cleanup on completed imports. After a complete remote CSV import, bounded enrichment hydrates the top 200 ranked base games under
the existing shared quota. Partial imports do not start enrichment; see [catalog development](development.md#boardgamegeek-catalog).
The protected API must expose import schema version 2 before importing. Resume uses 500-row
chunks from the same CSV and target; empty/out-of-file windows fail before requests. Partial windows
do not perform full-catalog thumbnail cleanup. Preview bypass stays a separate masked secret and is
URL-encoded inside the importer, never interpolated into logged workflow outputs. HTTP redirects
and response-body logging remain disallowed when forwarding credentials.

Source/static/mocked-HTTP checks do not attest configured live values or
perform real catalog imports/deployments. Activation still follows protected-main review/merge.

## EAS registration quota

APK builds still run locally and must pass their existing checks. EAS registration through `eas upload`
can exhaust the account's free monthly local-build quota even after the APK is built successfully.
PR/main workflows skip only that registration when exit 1 or 4 contains the explicit provider quota message;
the verified APK remains attached to GitHub and Telegram omits the unavailable EAS link. Other upload
errors and malformed/non-HTTPS responses fail normally. This exception never substitutes an APK,
reuses stale mobile inputs, skips quality/cleanup gates or changes E2E enablement.

## Location and native gates

- API address verification uses server-only `MAPTILER_GEOCODING_KEY`; web/mobile use their documented public MapTiler keys. Preserve canonical returned addresses/coordinates and attribution.
- BGO is non-commercial. MapTiler Free is compatible within its quotas and terms; no commercial subscription is a prerequisite. Preserve required attribution and comply with geocoding storage terms.
- `expo-image-picker` changes native permissions. A JavaScript export is insufficient: create a fresh native build and exercise camera/library denial, retry, Settings-return refresh, replacement and cancelled picking in Maestro.
- Run the current Group/Event/Table acceptance flows on both clients; verify failure/empty/privacy/cutoff paths, not only successful forms. Never silently skip missing authenticated E2E configuration.
- [The managed HeroUI Native 1.0.9 patch](../patches/heroui-native@1.0.9.patch) gives the default animated popover wrapper absolute-fill bounds in both source and distributed modules. Run `38166070753` showed visible help omitted from the accessibility tree and zero-height containers skipped by Maestro. The patch retains mounting, positioning, touch pass-through and animations; its native acceptance remains subject to the full Maestro gate.
- By explicit operator request, PR Maestro and Playwright remain retained but disabled through `BGO_PR_E2E_ENABLED: 'false'`. Their suites and report validation remain intact; Main E2E gates and the manual mobile-E2E workflow are removed by explicit operator request. `PR ready` permits only these policy-matching intentional skips; other common/Internal gates and cleanup must succeed. Development publication is independent of Internal/E2E/CI cleanup. Cleanup still waits for fixture mirroring and CI API consumers when tests are skipped. A green gate does not establish web/native E2E acceptance.
- When re-enabled, PR Maestro attempts all 13 ordered flows after an earlier flow failure when native preparation succeeded and the run is not cancelled. Each failed step remains failed; final report verification still runs and rejects failed, skipped or missing reports. Shared-session failures may cascade into later flows, so inspect their actual traces before treating each failure as an independent defect.
- Maestro uses the rendering-enabled Android 34 `google_apis;x86_64` image for Expo Location's Google Play Services provider, selected explicitly even if a cached AOSP or ATD image is present. [ATD images disable hardware rendering](https://developer.android.com/studio/test/managed-devices#use-atds) and remove GUI services; a headless emulator window must not imply a non-rendering Android guest. Keep actual screenshots/video and animated portal assertions; do not substitute longer waits or disable animations to hide missing UI.
- GitHub native acceptance requires Linux KVM: trigger the job-local device rule with `udevadm trigger --name-match=kvm --settle` before checking read/write permissions and running `emulator -accel-check`. The ordinary trigger is asynchronous; immediate permission checks race rule application. Missing devices or denied permissions fail explicitly with device/runner diagnostics. Keep `-accel on`, never software-CPU fallback. Windows WHPX and shell simulations are not Linux KVM acceptance; verify the real runner before claiming native success.
