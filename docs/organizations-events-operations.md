# Organizations and events: operational gates

The feature is not production-verified merely because unit tests, replica-set integration tests or a JavaScript export pass. Track current evidence in `implementation-progress.md`.

## Database and moderation

- Run `pnpm --filter api migrate` against the intended replica-set database before deploying community writes. The migration creates organization, membership, logo/chunk, event/table/booking and deadline-outbox indexes, including upload TTL and booking uniqueness.
- Grant moderators only through server-owned Clerk **public** metadata: `bgoRole: "ADMIN"`. Never grant authority through `unsafeMetadata` or a mirrored MongoDB role. Review handlers resolve fresh Clerk authority.
- Pending/rejected changes stay private. Replacing a revision does not discard the approved revision. Referenced logos remain claimed; replaced, unreferenced assets are released for TTL deletion. MongoDB TTL cleanup is asynchronous.

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
- Mobile: `EXPO_TOKEN`; `GOOGLE_SERVICES_JSON` for optional push-enabled APKs.
- Release/reporting: `RELEASE_PAT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CODECOV_TOKEN`.

No GitHub Secret needs deletion for this migration. MongoDB credentials, webhook secrets and other
server-only app configuration stay in Infisical/Vercel, not GitHub. Keep existing public GitHub
Variables used by native builds and E2E; they are not credentials. GitHub `development` and
`production` environments currently contain no additional Secrets. No credentials were deleted,
rotated or synchronized as part of this code change.

## Location and native gates

- API address verification uses server-only `MAPTILER_GEOCODING_KEY`; web/mobile use their documented public MapTiler keys. Preserve canonical returned addresses/coordinates and attribution.
- BGO is non-commercial. MapTiler Free is compatible within its quotas and terms; no commercial subscription is a prerequisite. Preserve required attribution and comply with geocoding storage terms.
- `expo-image-picker` changes native permissions. A JavaScript export is insufficient: create a fresh native build and exercise camera/library denial, retry, Settings-return refresh, replacement and cancelled picking in Maestro.
- Run the new organization/event acceptance flows on both clients; verify failure/empty/privacy/cutoff paths, not only successful forms. Never silently skip missing authenticated E2E configuration.
