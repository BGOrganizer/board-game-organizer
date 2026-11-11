# API instructions

Read the [root instructions](../../AGENTS.md) first. These rules apply to `apps/api`.

API routes live under `apps/api/src/app/api`. Keep route handlers thin. Put data access in
repository classes under `apps/api/src/app/lib` and shared validation in `packages/schemas`.

Handlers under `src/app/api` and shared DTOs are the source of truth for methods and request shapes.
Current domains include profiles/social/invites, Groups, Events/Tables/registrations/results,
locations/favorites, BGG and notifications/push. Match/Organization writers are retired compatibility paths. Read their service and repository authorization, not only the route wrapper.

Admin CI/import routes require their existing server-secret authentication and target guards.
`/api/inngest` verifies provider execution requests through the SDK, not ordinary user authorization. See
[operational gates](../../docs/organizations-events-operations.md) before worker/deployment changes.
Most application routes expose `OPTIONS` through centralized `lib/cors.ts`; preserve CORS handling.

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
sync paths preserve the same field when present. Contact discovery derives a 7-15 digit lookup key,
normalizes `00` and `+` international prefixes without country inference, and ignores ambiguous
numbers claimed by multiple accounts.

`GET /api/profiles` uses `enrichSingleUser` from `lib/clerk.ts`; do not duplicate direct Clerk
calls.

Relationship list enrichment uses local users through `lib/enrichUsers.ts`.

### Collections

`COLLECTIONS` in `lib/db.ts` is the authoritative collection registry; do not maintain a second
partial list here. Models/DTOs live in `packages/schemas`, and indexes in `lib/migrate.ts`.

`pnpm --filter api migrate` creates social, group, rating, favorite-location, organization,
asset/chunk, event/table/booking and deadline-outbox indexes, and drops legacy `relationships`.
Run migrations against the intended replica set before deploying writes.

The current `RelationshipRepository` writes only `follows`, `friendRequests`, and `blocks`.

### Relationship invariants

- Follow is a directed edge in `follows`.
- Friendship is derived from accepted friend-request records in both directions.
- Block is a directed edge in `blocks`.
- Blocking removes only blocker-to-target follow, preserves target-to-blocker follow, and clears
  pending friend requests. This deliberately prevents blocked users from detecting the block through
  their own follow state.
- Blocked users are hidden from normal lists and search.
- Connections shows friends, following,
  followers, then blocked users in one list with a connection-type badge on each avatar; blocked
  users remain visible there so unblock is possible. Requests shows received then sent in one list,
  with type badges on avatars and no section header.
- MongoDB operations sharing one session must run sequentially. Never use `Promise.all` on
  operations using the same transaction session.
- DELETE relationship requests include `targetUserId`. Parse DELETE bodies defensively with
  `request.text()` plus guarded JSON parsing so a missing body returns 400, not 500.

### Invites

Invite tokens are 128-bit base64url values with seven-day expiry. Creation links always use `new
URL(request.url).origin`; preview APIs create preview links and production creates production links.
Claim UI is hosted by the API at `/invite/[token]`, uses Clerk modal sign-in, and claims with a
Bearer token. Successful claim connects both users.

## BoardGameGeek

Search uses MongoDB `boardGames` and excludes expansions from playable selection. Import and
XML enrichment rules live in [catalog development](../../docs/development.md#boardgamegeek-catalog).
Collection synchronization requests `own=1` for base games and expansions and accepts only explicit
owned rows. Stage complete partitions before publishing; failed sync retains the last published snapshot.
Unlink removes private snapshots, not catalog or Event history. Keep Powered by BGG attribution in Profiles.
Use the API `BGG_TOKEN`; persist the validated cover as `image`, not a new `thumbnail` field.
Successful timestamps advance only for complete valid provider facts; preserve previous verified values.
Use the shared quota/backoff for lazy metadata and the bounded top-200 import enrichment.

## Checks

From the root: `pnpm --filter api test`, `pnpm --filter api test:coverage`,
`pnpm --filter api typecheck`, `pnpm --filter api lint`.
Integration uses `pnpm --filter api test:integration` with a disposable Testcontainers replica set.
Do not run application migrations, imports or provider mutations merely to validate a documentation change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
