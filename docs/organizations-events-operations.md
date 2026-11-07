# Organizations and events: operational gates

> The [unified refactor](groups-events-refactor.md) supersedes the legacy domain/worker sections
> below. Isolation, secrets, moderator authorization and publication safeguards remain applicable.
> Legacy Inngest functions are unregistered; unified event confirmation is manual. This source
> change does not deploy providers, run application migrations or authorize any database reset.

The feature is not production-verified merely because unit tests, replica-set integration tests or a JavaScript export pass. Track current evidence in `implementation-progress.md`.

## Database and moderation

- Run `pnpm --filter api migrate` against the intended replica-set database before deploying community writes. The migration creates organization, membership, logo/chunk, event/table/booking and deadline-outbox indexes, including upload TTL and booking uniqueness.
- Grant moderators only through server-owned Clerk **public** metadata: `bgoRole: "ADMIN"`. Never grant authority through `unsafeMetadata` or a mirrored MongoDB role. Review handlers resolve fresh Clerk authority.
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

## Durable deadlines

Real Inngest configuration/registration/delivery remains excluded from local acceptance. By explicit
operator request, draft saving and publication do not require Inngest. Publication still requires an
approved organization and at least one valid table. Exact-cutoff mutation guards, transactional roster
freezing and the durable outbox remain mandatory.

Without a worker, closure is materialized on the first authorized event/table read after cutoff;
there is no autonomous execution or five-minute recovery. Do not claim background closure or provider
acceptance in this mode. Supply the following server-only configuration for autonomous execution:

| Variable | Purpose |
| --- | --- |
| `INNGEST_EVENT_KEY` | Authenticate event delivery |
| `INNGEST_SIGNING_KEY` | Verify provider execution requests |
| `INNGEST_ENV` | Select the intended Inngest environment |
| `MONGODB_DB_NAME` | Bind delivery IDs and execution to the exact database |

Register the deployed **`/api/inngest`** endpoint with Inngest. It serves GET/POST/PUT through the SDK; application endpoints still require Clerk authentication. Use distinct production and preview environments. Do not enable unsigned development execution on a production deployment.

If Vercel Preview protection is enabled, configure its bypass as a **query parameter** on the registered endpoint URL, not a custom header. Keep the bypass value secret and out of logs/screenshots.

MongoDB stores deadline delivery before committing publication, even when configuration is absent.
Dispatch is a no-op until configured; when configured it happens afterward. Provider event IDs include the database name and event revision, so retries are idempotent. A revision-aware sleeper freezes the roster; five-minute recovery retries persisted deliveries and closes overdue events. Authorized reads also enforce closure if a worker is delayed. These fallbacks are not proof of actual provider delivery.

### Required provider acceptance

Use an isolated database and test Clerk users, never production fixtures:

1. Publish a future event with a short, explicit future cutoff, one sufficiently populated table and one undersubscribed table.
2. Verify registration, persisted outbox delivery and the provider's successful sleep/execution trace.
3. Do **not** read event/detail endpoints to trigger the synchronous fallback. Inspect the isolated database to prove the worker created the eligible fixed match and cancelled the undersubscribed one.
4. Reschedule a second event before cutoff; verify the old revision cannot freeze the new schedule.
5. Exercise retry/recovery and replay: no duplicate matches, rating events or notifications.
6. At exact cutoff, verify requests, invitations, approvals, edits, removals and cancellation fail for both members and administrators, including private drafts. Results remain writable only by the administrator or frozen assigned demonstrator.
7. Delete all isolated fixtures/users after verification, including after failure.

No production-provider success is currently attested. Real registration/credentials and delivery
traces remain an external acceptance gate for autonomous closure, not a publication prerequisite.

## Infisical and deployment isolation

Infisical remains the source of project environment values. The shared deployment action uploads
source and builds on Vercel, where synced Secrets are available; it does not export them with
`vercel pull` or require Secret-to-Config conversions. `NEXT_PUBLIC_*` values remain browser-public
regardless of their Vercel type. Generated per-deployment build configuration explicitly selects
`pnpm --filter api build` or `pnpm --filter web build` and the corresponding app's `.next` output;
API deployments must not build Web with API-only environment values. Project settings are not changed.

Per-deployment overrides never update project variables. For isolated API Previews, build-only
`BGO_CI_DB_NAME=bgo_ci_<run>_<attempt>` first validates that Infisical's base `MONGODB_DB_NAME` equals
its non-CI `CLERK_WEBHOOK_DB_NAME`, then sets the build process's database to the CI name and consumes
the flag before child workers. `--env MONGODB_DB_NAME=...` sets the same isolated runtime database.
Webhook routing stays non-CI. Development API deployments receive no CI override. Authenticated
runtime attestation must pass before seeding; cleanup uses the successful deployment's recorded
DB name, including partial reruns. Web public-key validation runs inside the actual Vercel build.

The current 13 GitHub repository Secrets all remain used:

- Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_API_PROJECT_ID`, `VERCEL_WEB_PROJECT_ID`,
  `VERCEL_PROTECTION_BYPASS`.
- Clerk: `CLERK_SECRET_KEY` for development E2E provisioning/attestation/cleanup/import;
  `CLERK_SECRET_KEY_PRODUCTION` for explicit production catalog import.
- Mobile: `EXPO_TOKEN`; `GOOGLE_SERVICES_JSON` for optional push-enabled APKs. In GitHub,
  `GOOGLE_SERVICES_JSON` contains the original JSON document, not Base64 or a file path; the build
  action writes it to a restricted temporary file and passes that path to Expo.
- Release/reporting: `RELEASE_PAT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CODECOV_TOKEN`.

No GitHub Secret needs deletion for this migration. MongoDB credentials, webhook secrets and other
server-only app configuration stay in Infisical/Vercel, not GitHub. Keep existing public GitHub
Variables used by native builds and E2E; they are not credentials. GitHub `development` contains
an environment-scoped `CLERK_SECRET_KEY`. Every PR job consuming that key must select
`environment: development`, including provisioning, mirroring, browser tests and cleanup;
otherwise GitHub falls back to a potentially different repository Secret. PR APK builds and draft
publication likewise select `development` for Expo, release and Telegram credentials. This GitHub environment
does not select an Infisical environment: the deployed API reads the Vercel Preview value supplied
by its existing sync. No credentials were deleted, rotated or synchronized as part of this code change.

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
Main production delivery, release and manual E2E policies are unchanged.

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
.github/scripts/ci-fail-fast.test.mjs
.github/scripts/cleanup-pr-e2e.sh
.github/scripts/cleanup-e2e-clerk-users.sh
```

Use these files from the verified implementation revision on a new branch based on current `main`,
not a cherry-pick that implicitly imports the whole feature branch. Run the standalone watchdog
check (`node --test .github/scripts/ci-fail-fast.test.mjs`), shell syntax and workflow validation.
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
Run the regression suite with `node --test .github/scripts/*.test.mjs`.

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
- Run the new organization/event acceptance flows on both clients; verify failure/empty/privacy/cutoff paths, not only successful forms. Never silently skip missing authenticated E2E configuration.
- [The managed HeroUI Native 1.0.9 patch](../patches/heroui-native@1.0.9.patch) gives the default animated popover wrapper absolute-fill bounds in both source and distributed modules. Run `38166070753` showed visible help omitted from the accessibility tree and zero-height containers skipped by Maestro. The patch retains mounting, positioning, touch pass-through and animations; its native acceptance remains subject to the full Maestro gate.
- By explicit operator request, PR Maestro and Playwright remain retained but disabled through `BGO_PR_E2E_ENABLED: 'false'`. Their suites and report validation remain intact; main/manual E2E stay enabled. `PR ready` permits only these policy-matching intentional skips; other common/Internal gates and cleanup must succeed. Development publication is independent of Internal/E2E/CI cleanup. Cleanup still waits for fixture mirroring and CI API consumers when tests are skipped. A green gate does not establish web/native E2E acceptance.
- When re-enabled, PR Maestro attempts all 13 ordered flows after an earlier flow failure when native preparation succeeded and the run is not cancelled. Each failed step remains failed; final report verification still runs and rejects failed, skipped or missing reports. Shared-session failures may cascade into later flows, so inspect their actual traces before treating each failure as an independent defect.
- Maestro uses the rendering-enabled Android 34 `google_apis;x86_64` image for Expo Location's Google Play Services provider, selected explicitly even if a cached AOSP or ATD image is present. [ATD images disable hardware rendering](https://developer.android.com/studio/test/managed-devices#use-atds) and remove GUI services; a headless emulator window must not imply a non-rendering Android guest. Keep actual screenshots/video and animated portal assertions; do not substitute longer waits or disable animations to hide missing UI.
- GitHub native acceptance requires Linux KVM: trigger the job-local device rule with `udevadm trigger --name-match=kvm --settle` before checking read/write permissions and running `emulator -accel-check`. The ordinary trigger is asynchronous; immediate permission checks race rule application. Missing devices or denied permissions fail explicitly with device/runner diagnostics. Keep `-accel on`, never software-CPU fallback. Windows WHPX and shell simulations are not Linux KVM acceptance; verify the real runner before claiming native success.
