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
- Only that creator may permanently delete the Group, after an explicit destructive confirmation
  acknowledging deletion of its Events. The versioned DELETE runs one transaction under the same
  Group lock used by membership and Event writers. All unified Events, including CONFIRMED and
  TERMINATED Events, Tables, removed Tables, registrations, votes, results, Group memberships,
  exclusions, claimed logos, Group rating snapshots and related inbox history are removed atomically.
  There is no archived Group or retained Event/results history. Personal GLOBAL skill snapshots
  remain unchanged: deleting Group-owned records does not reset personal skill or rerate other
  Groups. Rating-event history for the deleted Tables is removed in both scopes. Unrelated Groups,
  standalone Events, Contacts, users, favorites, catalog and legacy documents remain untouched.
  Failure or a stale Group version rolls back the entire cascade; a large cascade exceeding
  MongoDB transaction limits fails visibly, never as a partially completed deletion.
- PRIVATE requires a name; logo and verified venue are optional. It is never discoverable.
  PUBLIC requires name, owned logo and verified venue, with freshly authorized BGO moderation
  before public operation. Clerk Organizations have no BGO domain authority.
- Invitations are friend-only and require individual acceptance. Public membership requests require
  administrator approval. Pending invitees/requesters can read permitted group information and
  accepted members, but not group events, rankings or group-scoped social actions. Approved PUBLIC
  Groups also expose the accepted roster before a membership request, without social state/actions;
  private, unapproved and actively excluded access remains protected. Request and pending-request
  explanation/cancellation appear centered after Overview information, with cancellation beneath
  its explanation. Administrator request-response dialogs use explicit Approve/Reject icons.
  Global Contacts remain independent. Invitation pickers source-page eligible friends only, excluding accepted or
  pending memberships, global blocks and active Group bans before pagination/search. Received
  invitations use a centered Accept/Decline card after Group information; accepted non-admin
  members leave through the danger header action with explicit confirmation, never above tabs.
- Ban/exclusion may target a nonmember, permanently or until a server-validated future instant.
  Revocation/expiry never restores membership, invitations or bookings. It is not global blocking.
- Exclusion cancels affected active registrations and reopens affected confirmed events. Refuse the
  entire ban if the target has frozen participation/demonstrator duties in a CONFIRMED PUBLIC event
  after its cutoff. TERMINATED history and results remain immutable under membership operations;
  explicit whole-Group deletion above is the only Group-level deletion exception.
- Group game search and member rankings are paginated at source; the ranking selector and rows use
  the same horizontal page insets as other Group destinations on both clients. Only enabled physical tables with
  at least two scoring finishers contribute games, wins, withdrawals and rating statistics.

## Events and Tables

- An event may be standalone or belong to a group. Only the group creator/admin creates grouped
  events. Standalone invitations are friend-only; grouped participants must be accepted members.
  Successful grouped creation returns to that Group's Events tab; standalone creation returns to
  main Events and edits retain their Event detail destination. Creation selects an optional Group
  inline through the platform HeroUI Select, with searchable source-paged Group items and explicit
  No group; no separate Group search screen. Launching from a Group presets and locks that selection;
  existing Event Group identity remains immutable.
- Main Tables source-pages the viewer's accepted seated/waiting registrations and pending invitations
  in planning, confirmed and terminated Events, retaining confirmed organizer/demonstrator duties.
  Declined/left registrations do not qualify. Existing Group visibility checks remain authoritative.
- PLANNING / CONFIRMED / TERMINATED. There is no persisted server draft or event cancellation.
  The organizer plays only through explicit table registration, never an automatic seat.
- Standalone and PUBLIC Group Events have exactly one date/time and one verified location.
  PRIVATE Group Events may propose up to 20 distinct date/time options and 20 verified locations;
  accepted players vote independently on those option IDs. Different times on the same day are
  distinct proposals. Web and native editors use a combined date/time field and retain an empty
  add row beneath private proposals until the limit; standalone add rows disappear after
  selection. PUBLIC start is one editable, non-removable combined field, initially tomorrow for a
  new draft; its verified Location starts empty, never copied automatically from the Group. End Date
  and Time and the combined Booking Cutoff field precede Location, which is last. Nothing is written
  before final review.
- Date options may store their own `startTime`; historical options without it inherit the Event's
  common clock. Times are local to the venue selected by agreement. The API derives IANA zones from
  verified coordinates and rejects clocks invalid at any proposed venue, never guessing a zone from
  the device. Confirmation freezes the chosen clock in the chosen venue's zone. Clock edits require
  fresh option IDs; unchanged explicit private clocks retain their votes when venue-zone metadata
  changes. Old implicit clocks retain their existing conservative identity checks. Historical
  records and immutable snapshots are not rewritten.
- Each Table has candidate games, a minimum of at least two players not exceeding its maximum,
  and optional ratings. No independent Match is generated. Creation/review Table cards show a
  dice icon, only the first game and `+n` additional games (no suffix for a single game). The shared
  Rating badge is primary/accent when enabled and secondary/neutral when disabled, retaining its
  state icon and accessible label on both clients.
- Event list/detail and parent links share stable-ID animated DiceBear Constellation artwork.
  Event detail starts with a Details label and voting-legend help above its artwork card:
  name and status first, then the associated Group link when present. Table detail starts with
  Settings and player-limit help above its Planets card: name, shared Rating badge, and minimum/
  maximum counts with their existing icons. Immediately below, Event labels a linked item with the
  parent Event's name and matching stable artwork; it opens that Event detail. Voting help states accepted-only voting, reserved
  pending places until acceptance, and participation through at least one Table.
- Main Tables and parent Event lists use one platform-owned Table card. Animated DiceBear Planets
  artwork uses the persisted Table ID on the left, consistently with saved/edit/review cards. Its
  bottom-right badge shows the viewer's accepted state (success check), pending invitation (warning
  mail), pending request (warning clock), or waiting list (warning ordered-list icon), never body text.
  Right-side rows show bold name/Dices with Rating at far right; Event/calendar and Group/people
  separated by a dot only in Main Tables; then five distinct icon/counts for minimum, maximum,
  accepted registrations, waiting places and pending registrations. Accepted/pending totals include
  queued registrations; existing seat/queue counters retain their meanings. Missing cached metadata
  uses partial skeletons, never guessed counts. Count help is far left outside the navigation link;
  invitation responses stay outside it on the right. Group/Table responses share platform controls,
  dimensions and Check/X icons; requests never expose self-approval. Following rows show first game
  with Dices and localized additional `+n game/games`, optional demonstrator with presentation icon,
  and all joint winner names with trophy only when terminated. Group incoming/outgoing artwork
  keeps its existing warning mail/clock badges and creator crown.
- Editors keep unsaved values locally. Creation/edits happen only on final confirmation. Table edits
  are partial upserts; explicit `removedTableIds` remove tables. Unloaded pages are never implicitly
  deleted. Versions are pinned; stale drafts require reopening rather than overwriting newer data.
- Each invitation has its own accept/decline response. Creation/request time, then server sequence
  and stable ID determine priority, not acceptance time. Pending invitations reserve seat/queue
  priority but **cannot vote, count toward minimums, agreement or the frozen roster**. Voting never
  accepts an invitation. Accepted waiting players may vote.
- Private-group accepted members can enroll directly; no extra booking-approval workflow. The first
  voluntary enrollment opens a platform HeroUI bottom sheet with Dates/Locations tabs. Every current option
  needs YES/IF_NEEDED/NO, with at least one YES/IF_NEEDED in each dimension. Final confirmation sends
  versioned preferences and enrollment together; the API rejects missing/stale/incomplete choices and
  persists both in one transaction. Existing explicit invitation response semantics remain unchanged.
  A player already accepted at another Table of that same Event joins without repeating this sheet
  or replacing stored preferences. Pending/declined/cancelled registrations do not qualify. Owned Event
  participation caches reconcile from the acknowledged registration, not only a later successful fetch.
  Initial choices are editable later from the Event; opening/canceling the sheet writes nothing.
- Both clients show grouped games and places in Table details. Places start at the maximum capacity;
  occupied capacity retains an additional queue entry. Large rosters/placeholder ranges are source-paged
  and rendered progressively. Empty places enroll the viewer; organizers first choose self-enrollment
  (when eligible) or the existing invitation picker. Avatar badges distinguish accepted, pending and
  waiting players. Pending identities remain organizer/recipient-only; other reservations are anonymous.
- Event detail uses one secondary preference button per votable date, location or game. Date/location
  writes offer YES/IF_NEEDED/NO only; UNKNOWN remains a game choice and a readable missing-vote state. Event
  date/location voting requires accepted participation; game voting requires acceptance at that Table.
  An edit must retain at least one YES/IF_NEEDED among current options of its own dimension. YES and
  IF_NEEDED can interchange; NO is disabled when it would remove the final positive choice. The API
  enforces the same condition under the existing transaction lock, including simultaneous changes.
  Date votes cannot substitute for venue votes, removed options do not qualify, and game NO/UNKNOWN
  retain their existing semantics.
  Aggregate detail counts include accepted players only (once per Event for dates/locations), with
  missing preferences counted as UNKNOWN. Pending ballots never contribute or imply consent. Lists
  omit these aggregates; missing detail totals load without replacing available cached content.
- Public events additionally require an end and exact booking cutoff. Their tables have
  fixed starts and BGG-derived duration; missing metadata requires explicit administrator duration.
  Table editors fix the date to the Event day and expose only a start-time field, strictly after
  Event start and before Event end, with the entire duration fitting by Event end. API rejects
  invalid intervals before writes. Demonstrators use the existing grouped player identity pattern.
  Public detail uses matching Start Date and Time, End Date and Time and Booking Cutoff Date and
  Time information items.
  Planning uses the longest candidate duration; confirmation snapshots the selected game duration.
  New/edited public ends must be strictly later on the start's local calendar day, enforced in UI
  bounds and by API venue-zone validation. Booking cutoff compares the combined date/time instant
  with the start, not independent day/clock components: same-day earlier cutoffs and prior-day later
  clocks are valid. A new cutoff must still be in the future. Older overnight/multiday records remain
  readable and are not migrated; an explicit planning edit must satisfy current rules. Player and
  demonstrator duties cannot overlap; half-open boundaries permit adjacent tables. Other modes do
  not restrict overlaps.
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
explicit edit. The time-zone change never migrates or deletes historical documents.

## Exact agreement

A/B/C is evaluated per table, against one common event date/time and location:

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

- Confirm/reopen-planning dialog actions have semantic icons. In confirmed Events the organizer's
  icon-only result-registration action lives in the app header; reopen planning is a bottom-right,
  secondary icon-only FAB. Existing capabilities, busy/version guards and exact cutoffs remain.
- Confirmed Table detail has Overview and Ranking top tabs. Terminated detail additionally has
  Results, with immutable standings/ND and GLOBAL/GROUP deltas only when ratings were enabled.
  Current ranking is always available for the selected frozen game and every frozen player, including
  unrated players and rating-disabled Tables. Grouped Tables use GROUP scope; standalone uses GLOBAL.
  The source-paged authenticated Table leaderboard reads current snapshots and genuine physical-Table
  statistics, never legacy Match statistics, pending players or an automatic organizer seat. Player
  cards show avatar/full name/username on both tabs. Results have two matching statistic rows:
  position, GROUP-before rating, Global ranking and Group ranking; then exact score/ND, Global
  rating change and Group rating change. Both scope changes use signed semantic-color icons and immutable
  after snapshots, not current rating or an Elo calculation. Missing/disabled scopes stay unavailable;
  standalone GLOBAL values never masquerade as GROUP values. Ranking starts
  with Selected game and its normal game row, then Ranking and current player cards. Its game
  cannot be overridden by a query parameter. Navigation revalidates cache-first; a changed-game response
  never populates the wrong cache key and retry refreshes only the owned Table metadata.
- Result registration keeps per-Table unsaved drafts within one Event workflow. The list header is
  Register Tables Results; each Table editor uses Register Table Result. Cards reuse stable artwork,
  identity and frozen player counts; completed drafts show a success check at artwork bottom-right.
  Tables list help explains all-table completion, irreversible finalization and all-ND non-contribution.
  Finalization and its confirmation share a terminal-state icon. Back belongs only to the app header
  (and native hardware Back), not a duplicate editor/body button. Selected-editor Back returns to the
  list without discarding other Table drafts; web list Back uses ordinary route history. No server Event drafts
  or independent per-Table result writes are introduced.
- Finalization is one atomic operation over every included table's complete frozen roster. Exact
  signed decimal scores, ND, lower-wins and explicit tie-break ordering retain their existing
  semantics. Results/profiles and immutable GLOBAL/GROUP deltas are available on table detail.
- Each enabled physical table with at least two finishers updates GLOBAL and, when grouped, GROUP
  from that outcome's pre-rating snapshots. An all-ND/fewer-than-two-finishers table changes no
  ratings, games played, wins or withdrawals. Group initialization, provisional state and OpenSkill
  uncertainty remain as specified in the rating engine; no historical backfill occurs.
- Personal tables expose explicit invitations and relevant table participation. CONFIRMED/TERMINATED
  Tables without a frozen confirmation snapshot are excluded at source before cursors/limits and
  suppressed from old personal-list caches. Their records remain in the parent Event's paged list
  and detail; reopening planning restores ordinary planning visibility. Past/Future uses the chosen
  local day; unchosen dates appear in both.
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
