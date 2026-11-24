# Groups and events: operational gates

The [unified domain](groups-events-refactor.md) governs current behavior. These procedures cover
provider/environment isolation, moderation, diagnostics and delivery. Legacy Inngest writers are
unregistered; confirmation is manual. This guide does not authorize provider operations or database resets.
Use the [verification requirements](implementation-progress.md) to assess source, CI and runtime evidence.

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
the tested APK, not a different deployment; instrumentation alone does not establish a successful
runtime fix. Remove temporary diagnostics after investigation.

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

GitHub jobs select `development` or `production` for their environment-scoped secrets:

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

Credential consumers must select their GitHub environment; never rely on repository-scoped credential
duplicates or a `CLERK_SECRET_KEY_PRODUCTION` fallback. Inspect the active workflow definition and
live configuration when diagnosing access; branch source alone does not attest remote settings.
Environment-scoped public Variables use `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN`.
Development Clerk keys use the test instance and Production keys use the live instance; no
`_PRODUCTION`-suffixed variable or cross-environment fallback remains. Production URLs use the
canonical custom domains. Development URL variables record the last published Development preview;
they are reference defaults, not moving aliases. PR builds/deploys retain their own verified
run-specific URLs instead of falling back to these defaults. `EXPO_PUBLIC_WEB_ORIGIN` is
configuration only and has no runtime consumer. Public `EXPO_PUBLIC_MAPTILER_API_KEY` and
`EXPO_PUBLIC_SENTRY_DSN` may be shared at repository scope; they are not server credentials.

## Unified branch/PR CI

`pr-ci.yml` owns non-main push and main-targeting PR events. A push without an open PR runs
quality-only checks; with an open PR it routes without duplicating the PR pipeline. Push routing
and PR execution use different concurrency keys; PR execution retains `pr-<number>` so a new commit
also cancels runs created by the previous workflow definition. Lookup failure is an error, not a
reason to skip checks. Fork PRs do not enter secret-consuming lanes.

Common quality gates feed two independent lanes:

Coverage uses the same workspace Vitest configurations locally and in Branch, PR and Main
jobs, with a 90% minimum for lines, functions, branches and statements. A quality-only branch
push runs `test:coverage` as well; routing-only pushes for an open PR still avoid duplicate jobs.
The API command combines unit tests and isolated MongoDB integration in one report and requires
Docker. Repository unit tests exercise the real classes with the MongoDB boundary mocked;
the replica-set tests verify real query and transaction behavior.
Native CLI/flow syntax checks remain required. Reassure measurements are paused by explicit
operator request: complete web/mobile job definitions are retained but disabled, and active
quality, publication, readiness and watchdog dependencies exclude those jobs. Ordinary tests of
the comparator/helper remain active. All five workspaces still enforce 90% coverage across the
same runtime source ownership; real MongoDB integration, lint, typecheck, builds, native tooling,
release verification and cleanup gates remain active. A skipped or interrupted benchmark is not
performance acceptance evidence.

The retained [render benchmark policy](render-performance.md#paired-statistical-ci-checks) defines
same-runner sequential approved-baseline/current measurements, provenance and failure artifacts
for explicit resumption. Only the documented initial no-harness main may bootstrap without old
samples; later missing/corrupt baselines fail, and no historical result is fabricated.
These secret-free checks do not execute Playwright or Maestro journeys, provision users or capture
device traces. Test matrices do not cancel their remaining active suites on failure.

- Internal owns the isolated API/database, CI web, CI APK, users, mirroring, optional retained E2E
  and exact-run cleanup. `PR ready` requires every common/Internal/cleanup result. Its job still
  evaluates after failed dependencies, so a skipped prerequisite cannot masquerade as readiness.
- Development owns a non-CI API, dedicated web using that immutable API, and an APK embedding its
  stable per-PR API alias. Publication verifies artifact checksum, source head, current PR, active
  run/attempt and newer same-head runs. Draft release/Telegram announce **Development availability**, not a
  successful PR or E2E. They do not wait for Internal or CI cleanup. A Development-only failure
  may leave the overall workflow red while `PR ready` is green; the failure remains visible.

`BGO_PR_E2E_ENABLED` is an explicit workflow policy, currently `'false'`. Only the two matching E2E
skips are permitted by the aggregate gate. Setting it to `'true'` requires actual success of both
retained suites. No skips or script/VM tests establish authenticated browser/native acceptance.
The public Site adds coverage and a build to Branch and PR gates. Trusted PRs publish a separate
Site Preview after Development Web so sign-in uses the current run's Web URL.
This deployment does not wait for the APK. See the [Site setup](../apps/site/README.md#vercel-and-github-actions).

Main delivery and manual operations follow the explicit operator-approved policy below; these
PR changes alone do not establish live default-branch activation.

### Workflow names and required checks

Workflow names and script ownership are indexed in [GitHub automation](../.github/WORKFLOWS.md).
The aggregate checks are `PR ready` for PR execution and `Branch checks` for quality-only pushes.
Controller subscriptions and artifact lookup preserve compatible historical workflow/job labels.

Required-check settings must match the actual current-head GitHub Actions check context and app.
Inspect live branch protection rather than treating documentation or a YAML rename as proof of those
settings. Changing required checks is a separately authorized repository operation that preserves
reviews, unrelated protections and rollback evidence; use the procedure below.

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

### Trusted controllers and activation

`pr-ci-fail-fast.yml` and `pr-ci-cleanup.yml` execute trusted **default-branch** definitions, not
PR versions. Inspect their actual deployed definitions before relying on cancellation recovery or
lane independence. A feature-branch push neither activates an absent controller nor updates an
older watchdog. Source-contract tests do not establish live controller behavior.

Controller changes use the protected-main review/merge process within explicit operator scope;
never push directly to `main`, disable the watchdog or bypass branch protection. The watchdog
recognizes compatible workflow/job names and waits for every mandatory non-E2E test job to finish
before cancelling remaining work after shared routing/quality/API-web build failures.
Trusted cancellation/failure cleanup uses exact run/attempt evidence and never targets
Development resources. Observe actual trusted runs after a controller change and coordinate
rollback with its pipeline and required checks.

The workflow/controller scripts and regression commands are indexed in
[GitHub automation](../.github/WORKFLOWS.md). Validate source, shell syntax and workflows before
delivery; no branch edit alone attests active controller coverage or provider cleanup.

### Migrate required checks without an unguarded merge window

1. Snapshot `main`'s current `required_status_checks` response. Preserve its `strict` value, app
   association and all other branch-protection settings. Do not disable enforcement temporarily.
2. Observe a real `pull_request` run of `pr-ci.yml` for
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
The distributed Development workflow reuses a fresh-build artifact from the same trusted PR.
It compares the original build merge tree with the current merge, including base-branch changes,
and checks the original producer head, APK checksum, API URL, channel and configuration digest.
When there is no eligible artifact, the workflow builds a fresh APK. The release records the
original APK commit when it differs from the current preview commit.

OTA-enabled APKs also bind a validated channel to the binary: isolated `ci-pr-N`, distributed
`development` shared by all PRs, or `production`. The channel participates in the configuration
digest and is recorded in `update-channel.txt`. Keep `internal.channel` absent in EAS configuration so it cannot
override the app's dynamic native header. Expo runtime compatibility uses its own fingerprint,
not this provenance digest. Development publication and pinned Main release publication export
and publish Android Hermes updates after their quality/deployment/smoke checks. The shared publisher
verifies the APK checksum, build source, embedded project/channel and configuration digest, then
compares the SDK runtime and Hermes bytecode versions before uploading. A reused Development
binary must have equivalent mobile inputs, and the OTA export uses the current verified source.
A fresh PR/current-main
check follows export. OTA errors remain blocking; the EAS build-registration quota exception does
not apply. EAS environment configuration must remain unchanged during the publication step: the
public CLI rereads it after the local preflight. See [OTA configuration](development.md#mobile-ota-updates).

Development publication is serialized across PRs without one PR cancelling another's active publisher. The last
published compatible update on `development` is offered regardless of which PR built the installed
APK; PR releases keep their own tags/assets. Current-PR/source checks still run before publication.
Public APK links use the final release tag and verified filename; temporary draft upload URLs are
not reused after publication. Anonymous page/download checks precede removal of earlier owned APKs.
Only `extra.apiUrl` in the Development variant on that channel is omitted from the native
fingerprint, so an accepted OTA can supply another PR's Preview endpoint without a new binary.
The exact URL remains in the APK provenance digest and must match the verified publication APK.
Production and isolated CI fingerprints keep the API URL; all other native inputs remain covered.
Migrating an installed `development-pr-N` APK requires one manual install of the shared-channel base.

CI web uses the immutable isolated API URL; E2E APKs use the verified per-PR alias. Development web
uses its attested immutable non-CI API URL, so it remains usable before or after a failed APK
publication. Development APKs use a stable-within-PR `api-development-pr-N` Preview alias, distinct
from the CI `api-pr-N` alias. The deploy job only computes its URL; the publication job assigns it
after smoke, non-CI database attestation and current-PR checks, then verifies the exact ready
deployment target.
Immutable deployment URLs remain the source of deployment attestation. Development producers and
publisher use the same pinned merge SHA for current code. `source-head.txt` records the actual APK
build checkout, including on reuse. The PR-head guard independently rejects stale/closed/untrusted PRs.
Never redirect E2E
at Development or Production. Preview protection bypass remains a secret query parameter.
There is no cross-PR API alias: each published OTA manifest carries that PR's verified API URL.

## Main delivery and manual environment selection

By explicit operator request, Main delivery has no browser/native E2E gates or their Preview APK,
API/web deployments, Clerk fixtures or application CI database/cleanup. Biome/typecheck/CI-script
checks, five workspace coverage suites, an independent replica-set API integration check and API/web verification
builds run in parallel on every merge. Codecov signing verification and both unit/integration uploads
are blocking. Only the latest verified merge prepares the version/changelog/tag. APK, production
API/web deployment, read-only smoke, private release staging, verified APK upload and final release
publication use the pinned release SHA. Verified APK assets and links are staged privately before
Production OTA; the GitHub release becomes public only after OTA succeeds. Telegram follows
successful publication/deploys and a current-main check. The existing narrow exhausted-EAS-quota exception remains. No app-store
submission, provisioning, secret synchronization or database migration is introduced.

The Site build and coverage run on Main. A separate Site job deploys and promotes the verified
source on Vercel with the production Web subdomain as its sign-in target. It does not wait for APK,
OTA or the app version and rechecks Main before promotion.

The release-note preset is an explicit root development dependency, compatible with the installed
semantic-release writer independently of Commitlint's own preset. CI executes the actual configured
notes generator and commit analyzer; a passing PR-note renderer alone does not validate Main notes.
The PR title must also be Conventional Commit syntax when choosing squash, because the single
squash commit determines the release level. A normal merge retains the original analyzed commits.

New Development and Production publications share English titles, metadata, downloads and
Conventional Commit sections with linked commit hashes. PR notes use only `base..head`; Production
notes retain the interval since the prior stable release. The same installed notes generator owns
both formats without changing version analysis. Existing releases, messages and historical changelog
entries are not reformatted. See [release helpers](../scripts/release/README.md).

Telegram sends one bounded English excerpt with the same categories and commit references. Its
links target the PR, verified direct APK download, Web app and complete release; API and optional
EAS links appear only in the GitHub release. Production links only the merged PR associated with the
original workflow-triggering merge SHA, not every PR since the preceding version. A direct Main
push without such an association omits the PR link. Notification metadata comes from verified
publication receipts, and notes come from the pinned release commit rather than the full release body.

The removed `mobile-e2e.yml` is not a remaining manual GitHub gate. Maestro/Playwright suites and
retained disabled PR hooks still exist for explicitly owned local acceptance. Losing automatic E2E
means that green coverage, builds and smoke **do not attest** native startup, keyboard, permissions,
authenticated UI or full user journeys. A failed prepared release can leave a tag/draft; resume
only the verified state described below. Other orphans require explicit recovery, never silent
tag deletion or a claim of successful publication.

Main verification has no workflow-wide concurrency group: every merge is checked. Release
preparation is serialized; publication is serialized per release SHA. A newer merge supersedes an
older delivery without skipping its verification. Release commits use `[skip ci]` to avoid recursion.
Release preparation verifies the existing `RELEASE_PAT` has repository-admin permission and uses
it both for the Git remote and semantic-release's `GITHUB_TOKEN`. Authentication retries must retain
that release identity; the privileged token stays scoped to the validated preparation steps.
A rerun can resume only the current direct release-bump child of its original validated merge:
all three manifests may change only version, Expo config only its version, and the changelog must
prepend exactly the commit's release notes. The stable version must increase and its remote tag
must resolve to that child. Other files, unrelated/stale commits, missing/moved tags or inconsistent
versions fail closed or skip superseded delivery; they never trigger automatic tag deletion.

Private staging reuses only the managed release for that exact version/SHA, validates APK digest
and size, and repairs only its own draft attachment. Matching already-public releases are verified
without republishing OTA. Interrupted staging/publication can be retried without duplicate GitHub
releases or another version bump. Expo and GitHub are separate services: an interruption after OTA
but before GitHub publication can repeat the compatible OTA on retry. Unrecognized historical
orphans still require explicit release-recovery scope; semantic-release treats existing tags as
published history. Never remove tags or restore versions as an incidental documentation change.

Preview/test and Production both use environment-scoped `CLERK_SECRET_KEY` and matching
publishable keys. Never mix instances: their tokens are not interchangeable.

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
- [The managed HeroUI Native patch](../patches/heroui-native@1.0.9.patch) gives the default animated popover wrapper absolute-fill bounds in both source and distributed modules so visible help remains measurable and accessible. Preserve mounting, positioning, touch pass-through and animations; source checks do not replace native acceptance.
- By explicit operator request, PR Maestro and Playwright remain retained but disabled through `BGO_PR_E2E_ENABLED: 'false'`. Their suites and report validation remain intact; Main E2E gates and the manual mobile-E2E workflow are removed by explicit operator request. `PR ready` permits only these policy-matching intentional skips; other common/Internal gates and cleanup must succeed. Development publication is independent of Internal/E2E/CI cleanup. Cleanup still waits for fixture mirroring and CI API consumers when tests are skipped. A green gate does not establish web/native E2E acceptance.
- When re-enabled, PR Maestro attempts all 13 ordered flows after an earlier flow failure when native preparation succeeded and the run is not cancelled. Each failed step remains failed; final report verification still runs and rejects failed, skipped or missing reports. Shared-session failures may cascade into later flows, so inspect their actual traces before treating each failure as an independent defect.
- Maestro uses the rendering-enabled Android 34 `google_apis;x86_64` image for Expo Location's Google Play Services provider, selected explicitly even if a cached AOSP or ATD image is present. [ATD images disable hardware rendering](https://developer.android.com/studio/test/managed-devices#use-atds) and remove GUI services; a headless emulator window must not imply a non-rendering Android guest. Keep actual screenshots/video and animated portal assertions; do not substitute longer waits or disable animations to hide missing UI.
- GitHub native acceptance requires Linux KVM: trigger the job-local device rule with `udevadm trigger --name-match=kvm --settle` before checking read/write permissions and running `emulator -accel-check`. The ordinary trigger is asynchronous; immediate permission checks race rule application. Missing devices or denied permissions fail explicitly with device/runner diagnostics. Keep `-accel on`, never software-CPU fallback. Windows WHPX and shell simulations are not Linux KVM acceptance; verify the real runner before claiming native success.

### Invitation links and native routing

Android invitation App Links use the stable public `api.board-game-organizer.com` domain with
separate native path filters: Production `/invite/`, Development `/development/invite/`.
The Production `/.well-known/assetlinks.json` contains both existing public APK signing-certificate
SHA-256 identities; Preview associations contain Development only. Key rotation or Google Play App
Signing requires updating the fingerprint from the actual distributed signing certificate.
The domain association must return HTTP 200 JSON without authentication or redirects. Installing
these native filters requires a fresh APK; OTA cannot add them. Install after the public association
is deployed so Android can verify it.

Development APIs keep their changing per-PR endpoints. Canonical invite links still point at the
API that created them. Only an owned non-CI Development alias on a Preview server may additionally advertise a stable
`appLink`, after credential-free, bounded public checks verify the association's Development
package/fingerprint and the managed publication below. Creation caches the publication proof for
300 seconds. Local, CI, immutable and Production origins make no such probe.
Until that public deployment is ready, generation returns the original working Preview link.
Existing Preview links retain their explicit app action; newly generated links can use automatic
native routing once the association and fresh APK are installed.

The public Development route redirects browsers only to an exact `/invite/<same token>` on an
published `api-development-pr-N-board-game-organizers-projects.vercel.app` HTTPS origin, without
credentials, ports, query strings or fragments. No token is claimed by that route. Native URL
rewriting discards all incoming parameters and uses the installed app's configured API/session;
it never forwards Development authentication to Production or switches API from the link.
The web invitation page retains **Open in app** via Android `bgo-dev` / `bgo` and iOS `bgo` when a
browser or OS preference retains the HTTPS link. Preview browser pages retain their existing
Vercel protection. iOS universal links require Apple team/domain association configuration.
Native authentication/profile completion retain only the validated invitation token.

The Vercel alias suffix is a naming convention, not an ownership guarantee. Before browser redirects,
fresh credential-free requests to fixed endpoints in the public `BGOrganizer/board-game-organizer`
GitHub repository must verify an open or merged same-repository PR targeting `main` and the managed
public `development-pr-N` prerelease. Its target commit must equal that PR's current head, its body
must contain the managed PR marker and exact API link. The publisher's authenticated alias check
before publication is the ownership receipt's trust root. Missing, revoked, mismatched or unavailable
proof returns 503 with `Retry-After`; malformed gateway URLs return 400. Neither invitation tokens
nor client authentication, cookies or Preview bypass are sent to GitHub. Public GitHub rate limits
apply (60 anonymous requests/hour per originating IP); installed Android App Links bypass this
browser gateway, while creation reuses the bounded public cache.

Never release, transfer or delete a Development alias while its managed release is public. Withdraw
the publication first, close an unmerged PR as appropriate, and allow at least 300 seconds plus
outstanding request lifetimes before any alias reassignment. Current cleanup does not delete these
aliases; Vercel retention protects currently aliased deployments. Merged PR publications remain
eligible so links can activate when the Production gateway is first deployed after merge.

## Parallel Netlify deployment

Netlify runs in separate PR and Main jobs alongside Vercel. The PR job is limited to trusted,
current PRs after quality and build checks. Main deploys from the verified merge or the
associated release commit when a version was prepared. Neither lane consumes Vercel deployment
outputs. APK, OTA, GitHub release publication and the existing PR readiness gate retain their
own dependencies.

The `board-game-organizer` Netlify team owns eight unlinked projects, one each for API, Web,
Site and MCP in Development and Production. Provision them as `bgo-<api|web|site|mcp>-<development|production>`.
For API and Web, use Infisical Netlify Secret Sync with the matching source, site and context.
Specify the site so the sync applies only to that project. The context names below match the
Netlify CLI build contexts. The first Development deploy must also pass runtime attestation.

| Infisical source | Netlify destination | Context |
| --- | --- | --- |
| `staging /api` | `bgo-api-development` | `BranchDeploy` |
| `staging /web` | `bgo-web-development` | `BranchDeploy` |
| `prod /api` | `bgo-api-production` | `Production` |
| `prod /web` | `bgo-web-production` | `Production` |

Use the usual matching Clerk values and leave Vercel-specific bypass values on Vercel. Netlify's
CLI builds API, Web and Site with the existing Bun workspace commands and the Next.js adapter.
Sensitive runtime values are configured on their respective project. Site and gateway do not
need API or database credentials. In each GitHub environment, set:

- `NETLIFY_AUTH_TOKEN` through Infisical's `/github` sync.
- `BGO_NETLIFY_ENABLED=true` once the matching Netlify syncs are in place.
- In Development, `BGO_NETLIFY_MCP_GATEWAY_PR_NUMBER` selects the PR authorized to publish the
  stable Netlify gateway. Vercel uses its own PR selector.

Netlify classifies CLI deployments with aliases as branch deploys. They use one alias per PR, run and
attempt. The deploy API reports the alias as `deploy_ssl_url`; the CI derives the immutable permalink
from the verified deploy ID and project name. The Web build points to that API and the Site
points to that Web deployment. The API allows that exact Web origin in addition to the existing
environment configuration. The Main Site sign-in and Production widget links use the canonical
Web domain for Clerk Production. Browser smoke at `netlify.app` is unauthenticated. Authenticated
Production acceptance requires a verified BGO subdomain configured for the matching Clerk instance.
The separate MCP URL is `https://bgo-mcp-<development|production>.netlify.app/mcp`; register that
exact audience in the matching Clerk instance before using it. The endpoint exposes only MCP
transport and OAuth discovery and forwards to its own Netlify API without provider bypass.

Netlify's visitor access settings control reachability independently of Clerk. Public preview
access on the dedicated Development API, Web and Site projects lets GitHub Actions and testers
reach those deployments. The Development MCP gateway's published URL requires public published
deploy access for external MCP clients. BGO authorization remains enforced by the application.

The Netlify projects use provider hostnames until an operator changes DNS. The existing
production domains, Clerk webhook URLs and Inngest registration continue to route through
Vercel. No duplicate webhook or worker registration is created. Check custom-domain auth,
webhooks, job delivery, and Web Push before a cutover.

The API Vitest suite with a Testcontainers MongoDB replica set runs independently of either host.
Netlify drafts are ordinary Development deployments with an authenticated configuration check
and read-only smoke. The isolated E2E fixture and cleanup lane uses Vercel under its existing
enablement controls.
