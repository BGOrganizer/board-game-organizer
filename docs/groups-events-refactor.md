# Unified Groups, Events and Tables

This is the approved contract implemented on `feat/social-api-refactor` (existing PR #22).
It describes the current source, not a deployed or E2E-accepted release. Verification and remaining
runtime limitations are recorded in [implementation progress](implementation-progress.md).
The [old contract](organizations-events.md) is retained as a historical deployment reference only.

## Delivery and database scope

- Web and native navigation: Tables / Groups / Events / Contacts. Contacts retain their own social
  workflows. Profile and BGO moderation remain separate destinations.
- No database cancellation, reset, collection deletion, account recreation or provider mutation is
  authorized. Existing legacy documents remain intact. Unified Group/Event readers and locks reject
  legacy shapes; source-level list filters exclude them.
- Legacy Match/Organization/invitation/booking/asset writers return authenticated `410
  LEGACY_DOMAIN_RETIRED` (unauthenticated callers still receive `401`). Old client URLs redirect to
  unified sections without reinterpreting old resource IDs.
- Legacy Inngest automatic writers are unregistered. All event confirmation is manual, with exact
  server cutoff enforcement. No old read path may create table-backed Match rows.
- Older immutable deployments are not revoked by these source changes. Do not describe this as a
  deployed isolation/migration operation. Environment separation still follows
  [operational gates](organizations-events-operations.md#infisical-and-deployment-isolation).
- E2E suites/jobs are retained unchanged by explicit operator instruction. Unit, source-contract,
  build and isolated-Mongo results are not Playwright/Maestro or production acceptance.

## Groups

- One immutable creator/administrator; no transfer, additional administrators, archiving or type
  conversion. PRIVATE/PUBLIC is fixed at creation.
- PRIVATE requires a name; logo and verified venue are optional. It is never discoverable.
  PUBLIC requires name, owned logo and verified venue, with freshly authorized BGO moderation
  before public operation. Clerk Organizations have no BGO domain authority.
- Invitations are friend-only and require individual acceptance. Public membership requests require
  administrator approval. Pending invitees/requesters can read permitted group information and
  accepted members, but not group events, rankings or group-scoped social actions. Global Contacts
  remain independent.
- Ban/exclusion may target a nonmember, permanently or until a server-validated future instant.
  Revocation/expiry never restores membership, invitations or bookings. It is not global blocking.
- Exclusion cancels affected active registrations and reopens affected confirmed events. Refuse the
  entire ban if the target has frozen participation/demonstrator duties in a CONFIRMED PUBLIC event
  after its cutoff. TERMINATED history and results remain immutable.
- Group game search and member rankings are paginated at source. Only enabled physical tables with
  at least two scoring finishers contribute games, wins, withdrawals and rating statistics.

## Events and Tables

- An event may be standalone or belong to a group. Only the group creator/admin creates grouped
  events. Standalone invitations are friend-only; grouped participants must be accepted members.
- PLANNING / CONFIRMED / TERMINATED. There is no persisted server draft or event cancellation.
  The organizer plays only through explicit table registration, never an automatic seat.
- Every new or explicitly edited Event has exactly one calendar day and one verified location,
  whether standalone or in a PRIVATE/PUBLIC Group. Its common start time is local to that location;
  the API derives the IANA time zone from verified coordinates, never a manual field or device zone.
  Each Table has candidate games, a minimum of at least two players strictly below its maximum,
  and optional ratings. No independent Match is generated. Historical records are not rewritten.
- Editors keep unsaved values locally. Creation/edits happen only on final confirmation. Table edits
  are partial upserts; explicit `removedTableIds` remove tables. Unloaded pages are never implicitly
  deleted. Versions are pinned; stale drafts require reopening rather than overwriting newer data.
- Each invitation has its own accept/decline response. Creation/request time, then server sequence
  and stable ID determine priority, not acceptance time. Pending invitations reserve seat/queue
  priority but **cannot vote, count toward minimums, agreement or the frozen roster**. Voting never
  accepts an invitation. Accepted waiting players may vote.
- Private-group accepted members can enroll directly; no extra booking-approval workflow.
- Public events additionally require an end and exact booking cutoff. Their tables have
  fixed starts and BGG-derived duration; missing metadata requires explicit administrator duration.
  Planning uses the longest candidate duration; confirmation snapshots the selected game duration.
  Overnight/multiday ends are ISO instants, not truncated times. Player and demonstrator duties
  cannot overlap; half-open boundaries permit adjacent tables. Other modes do not restrict overlaps.
- Accepting a public fixed-option table expresses availability for those fixed options without
  manufacturing extra preference votes. After cutoff no user, including the administrator, may
  invite, register, vote, respond or leave. Confirmation/reopening remain manual operations.
- Confirmation freezes selected date/location/games and accepted eligible rosters. At least one
  table must agree; others remain present but excluded. Reopening preserves votes, invitations,
  priorities, participation and excluded tables except explicit removals/exclusions; it never
  silently extends the cutoff. TERMINATED events cannot reopen.

## Location time zones

The API uses the offline [geo-tz](https://github.com/evansiroky/node-geo-tz) geographic lookup on
server-verified coordinates; it does not infer offsets from longitude or the device clock.
Its boundaries originate from [timezone-boundary-builder](https://github.com/evansiroky/timezone-boundary-builder)
and OpenStreetMap contributors; see the upstream data licensing and
[OpenStreetMap attribution](https://www.openstreetmap.org/copyright). Existing MapTiler/OSM map
attribution remains visible. No additional geolocation provider or credentials are required.
Ambiguous/unavailable results fail visibly instead of inventing a zone. Event time zones are
mandatory derived metadata; private Groups without a venue retain local-clock timed-ban entry.
Old immutable instants are never reinterpreted, and legacy planning clocks change only through an
explicit edit. Historical documents are not migrated or deleted.

## Exact agreement

A/B/C is evaluated per table, against one common event date/location:

1. **A:** seated accepted players have full agreement; do not consult waiters.
2. **B:** seated players reach the date/location minimum but disagree on game; wait for votes or
   administrator edits. Do not replace them merely to obtain another game.
3. **C:** seated players lack date/location agreement; consider accepted waiters in priority order,
   stopping at the earliest prefix enabling full agreement. Preserve higher-priority eligible
   players, capacity and pending reservations; displaced users remain waiting.

The same eligible people must support all dimensions with YES/IF_NEEDED. UNKNOWN is not positive.
YES preference wins before distinct-person count (one person across multiple tables counts once),
then original option order. Only considered players' votes count. Bounded exact search fails closed
with `AGREEMENT_COMPLEXITY_LIMIT`, never with an approximate fabricated agreement. Confirmation
rechecks authoritative inputs transactionally. Administrator notifications use semantic deduplication;
there are no repeated identical notifications or player reminders to change votes.

## Results, lists and transport

- Finalization is one atomic operation over every included table's complete frozen roster. Exact
  signed decimal scores, ND, lower-wins and explicit tie-break ordering retain their existing
  semantics. Results/profiles and immutable GLOBAL/GROUP deltas are available on table detail.
- Each enabled physical table with at least two finishers updates GLOBAL and, when grouped, GROUP
  from that outcome's pre-rating snapshots. An all-ND/fewer-than-two-finishers table changes no
  ratings, games played, wins or withdrawals. Group initialization, provisional state and OpenSkill
  uncertainty remain as specified in the rating engine; no historical backfill occurs.
- Personal tables expose explicit invitations and relevant table participation, not excluded tables
  pretending to be confirmed. Past/Future uses the chosen local day; unchosen dates appear in both.
- Search/role/period filters run before pagination. Lists, rosters, seats, game selection and group
  ranking selection do not download all records. Native uses virtualized lists and safe-area-aware
  controls. Cached usable fields remain visible while missing detail fields load.
- DTOs: [Groups](../packages/schemas/src/groups/dto/groupRecords.ts) and
  [Events/Tables](../packages/schemas/src/events/dto/eventRecords.ts). New controllers use
  [record-http](../apps/api/src/app/lib/community/record-http.ts) and
  [record-services](../apps/api/src/app/lib/community/record-services.ts): fresh authorization,
  shared Mongo sessions, retry-safe JSON, strict cursors/query fields and notification dispatch only
  after commit. Authenticated responses are private/no-store.
- TanStack Query owns remote data with API/user/resource-scoped keys, fresh tokens per request,
  cancellation and selective rollback that preserves newer versions/profile fields. Zustand owns
  only transient unsaved selections. Platform UI/navigation/auth/permissions remain app-owned.
- EN/IT source and compiled Lingui catalogs are committed together; native runtime IDs are preserved
  explicitly without adding a mobile Babel configuration.
