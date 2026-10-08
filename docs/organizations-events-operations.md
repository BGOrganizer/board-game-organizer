# Organizations and events: operational gates

The feature is not production-verified merely because unit tests, replica-set integration tests or a JavaScript export pass. Track current evidence in `implementation-progress.md`.

## Database and moderation

- Run `pnpm --filter api migrate` against the intended replica-set database before deploying community writes. The migration creates organization, membership, logo/chunk, event/table/booking and deadline-outbox indexes, including upload TTL and booking uniqueness.
- Grant moderators only through server-owned Clerk **public** metadata: `bgoRole: "ADMIN"`. Never grant authority through `unsafeMetadata` or a mirrored MongoDB role. Review handlers resolve fresh Clerk authority.
- Pending/rejected changes stay private. Replacing a revision does not discard the approved revision. Referenced logos remain claimed; replaced, unreferenced assets are released for TTL deletion. MongoDB TTL cleanup is asynchronous.

## Durable deadlines

Real Inngest configuration/registration/delivery is excluded from the current implementation and CI pass by operator request. Keep publication fail-closed until the following server-only configuration is supplied:

| Variable | Purpose |
| --- | --- |
| `INNGEST_EVENT_KEY` | Authenticate event delivery |
| `INNGEST_SIGNING_KEY` | Verify provider execution requests |
| `INNGEST_ENV` | Select the intended Inngest environment |
| `MONGODB_DB_NAME` | Bind delivery IDs and execution to the exact database |

Register the deployed **`/api/inngest`** endpoint with Inngest. It serves GET/POST/PUT through the SDK; application endpoints still require Clerk authentication. Use distinct production and preview environments. Do not enable unsigned development execution on a production deployment.

If Vercel Preview protection is enabled, configure its bypass as a **query parameter** on the registered endpoint URL, not a custom header. Keep the bypass value secret and out of logs/screenshots.

Publishing fails closed when configuration is absent. MongoDB stores the deadline delivery before committing publication; dispatch happens afterward. Provider event IDs include the database name and event revision, so retries are idempotent. A revision-aware sleeper freezes the roster; five-minute recovery retries persisted deliveries and closes overdue events. Authorized reads also enforce closure if a worker is delayed. These fallbacks are not proof of actual provider delivery.

### Required provider acceptance

Use an isolated database and test Clerk users, never production fixtures:

1. Publish a future event with a short, explicit future cutoff, one sufficiently populated table and one undersubscribed table.
2. Verify registration, persisted outbox delivery and the provider's successful sleep/execution trace.
3. Do **not** read event/detail endpoints to trigger the synchronous fallback. Inspect the isolated database to prove the worker created the eligible fixed match and cancelled the undersubscribed one.
4. Reschedule a second event before cutoff; verify the old revision cannot freeze the new schedule.
5. Exercise retry/recovery and replay: no duplicate matches, rating events or notifications.
6. At exact cutoff, verify requests, invitations, approvals, edits, removals and cancellation fail for both members and administrators, including private drafts. Results remain writable only by the administrator or frozen assigned demonstrator.
7. Delete all isolated fixtures/users after verification, including after failure.

No production-provider success is currently attested. Real registration/credentials and delivery traces are an external release gate.

## Location and native gates

- API address verification uses server-only `MAPTILER_GEOCODING_KEY`; web/mobile use their documented public MapTiler keys. Preserve canonical returned addresses/coordinates and attribution.
- BGO is non-commercial. MapTiler Free is compatible within its quotas and terms; no commercial subscription is a prerequisite. Preserve required attribution and comply with geocoding storage terms.
- `expo-image-picker` changes native permissions. A JavaScript export is insufficient: create a fresh native build and exercise camera/library denial, retry, Settings-return refresh, replacement and cancelled picking in Maestro.
- Run the new organization/event acceptance flows on both clients; verify failure/empty/privacy/cutoff paths, not only successful forms. Never silently skip missing authenticated E2E configuration.
