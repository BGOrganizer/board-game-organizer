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
- By explicit operator request, the PR Maestro and Playwright jobs are retained but disabled with `if: ${{ false }}`. Their suites and report validation remain intact; main E2E and manual mobile E2E pipelines remain enabled. PR publication permits only these intentional E2E skips: every other gate and cleanup must succeed. Cleanup waits for fixture mirroring and CI API consumers even when both tests are skipped. A green PR run does not establish web or native E2E acceptance.
- When re-enabled, PR Maestro attempts all 13 ordered flows after an earlier flow failure when native preparation succeeded and the run is not cancelled. Each failed step remains failed; final report verification still runs and rejects failed, skipped or missing reports. Shared-session failures may cascade into later flows, so inspect their actual traces before treating each failure as an independent defect.
- Maestro uses the rendering-enabled Android 34 `google_apis;x86_64` image for Expo Location's Google Play Services provider, selected explicitly even if a cached AOSP or ATD image is present. [ATD images disable hardware rendering](https://developer.android.com/studio/test/managed-devices#use-atds) and remove GUI services; a headless emulator window must not imply a non-rendering Android guest. Keep actual screenshots/video and animated portal assertions; do not substitute longer waits or disable animations to hide missing UI.
- GitHub native acceptance requires Linux KVM: trigger the job-local device rule with `udevadm trigger --name-match=kvm --settle` before checking read/write permissions and running `emulator -accel-check`. The ordinary trigger is asynchronous; immediate permission checks race rule application. Missing devices or denied permissions fail explicitly with device/runner diagnostics. Keep `-accel on`, never software-CPU fallback. Windows WHPX and shell simulations are not Linux KVM acceptance; verify the real runner before claiming native success.
