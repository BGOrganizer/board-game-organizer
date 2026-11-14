# Community and public activity visibility

Community sits between Groups and Contacts on web and native mobile. The main Profile remains
separate. Activities and Marketplace use the existing HeroUI platform tabs; Marketplace is only a
localized Coming soon placeholder, without commercial infrastructure.

## Activities and network

Community reuses the seven [Profile activities](profiles.md#durable-activities-and-privacy): played
(with won outcome), friendship, Event join, Table join, Group join, new follower and victory milestone.
There is no Elo algorithm, significant-rating-change activity, Table-creation activity or duplicate
ordinary victory. OpenSkill and physical-result/statistics rules remain unchanged. Provisional Table
scores never publish played/milestone activities.

The visible feed always uses the union of current accepted mutual friends and users the viewer
follows. Its activity-type selector matches Profile: all types or one of the seven kinds. The API
retains All/Friends/Following network scopes for existing callers; no hidden saved network selection
restricts the visible feed. Incoming followers alone never qualify. The viewer
is not an author in their own Community feed. Each activity must occur at or after the corresponding
current relation's start. Friends use the later acceptance timestamp of the reciprocal pair; follows
use the directed edge's creation timestamp; All uses the earliest qualifying active relation. An
unfollow/unfriend followed by a new relation resets that relation's window. Idempotent friendship
claims preserve the accepted epoch. Missing/malformed timestamps fail closed. The individual Profile
retains its permitted existing activity history, not this network-specific cutoff.

Mirrored friendship receipts produce one Community row, chosen deterministically among eligible
network authors. Their partner lookup ignores the page cursor so the other side cannot reappear on
page two. The first simultaneous Event/Table join displays the Table with parent Event context;
the Event receipt remains durable, and becomes a fallback if that Table is removed. Separate users'
physical played results remain separate activities. No backfill or notification reconstruction.

A session-authenticated `GET /api/community/activities` accepts `network=all|friends|following`,
`limit=10`, optional canonical `kind` and the existing strict instant/UUID cursor. Kind filtering runs
before source paging, not over already-loaded rows. Current network/time predicates, blocks and
receipt deduplication run in MongoDB. Fixed source chunks are then resolved through the same source
visibility code as Profile before ten visible rows and their cursor are emitted. No hidden total or
inaccessible placeholder is returned. Sparse networks/authorization can scan extra indexed chunks;
there is no client download of the graph, per-author Profile fan-out, or duplicated feed collection.

## Public sources and read-only details

Private Event activities are excluded from both feeds unless their immutable finalization explicitly
shares results with current friends of final frozen players. Only existing played/milestone activities
are shared, without any Group identity, under the [Event access contract](groups-events-refactor.md#event-access-and-shared-final-results).
This includes private Events in either Group type. Other approved PUBLIC Group activities and PUBLIC
Events/Tables remain visible without Group membership, subject to authentication, both block directions,
active exclusions and source existence.
Pending/unapproved public revisions are not published as feed context. A public Group's approved
name, not its unreviewed proposal, is displayed. Standalone activities keep existing source access.

Authenticated non-members can read approved PUBLIC Event details and their Tables, accepted rosters
and frozen Table rankings/results. These reads alone grant no enrollment, vote, invitation, editing,
result-registration or finalization authority. Explicit voluntary SELF enrollment is allowed and
accepted, including queues, without joining the Group; other participation/consent guards remain. Pending
rosters and invitation candidates remain privileged. Public projections omit result drafts, private
email and individual vote choices; public display names never reuse mirrored email fallbacks.
Members retain normal existing capabilities. Except explicit PUBLIC SELF enrollment, writes retain
their membership/current-management guards; ordinary public reads never imply consent. Accepted public
participation qualifies its own registered Event/Table lists, not Group membership/discovery or
Group-wide rankings. Private shared-result reads are stricter allowlists and grant no Group authority. Events/Tables from unapproved Groups, active group exclusions, blocked public Event
owners, deleted sources and removed Tables remain denied.

Feeds never acknowledge notifications. Opening an authorized detail retains its existing direct
information-read behavior; Community has no invented unread count, attention dot or polling loop.

## UI, cache and reconciliation

Each app owns its activity renderer and navigation; Profile and Community share that renderer within
that app, using the same GroupedList/GroupedRow structure and four-point text spacing. Both surfaces
show complete EN/IT narratives with linked names/resources, not a heading plus separately spaced
identity buttons. Named translation slots receive React text children, so names are never parsed as
translation markup. A follower receipt belongs to the followee: the sentence correctly says that the
other user started following the Profile subject. All seven activity kinds, won outcomes and milestone
plurals retain their real meaning; no new activity types or fabricated counts are introduced.
Viewer IDs, not matching names, select You/Tu and correct verbs/pronouns. Self identities are not
linked; reversed follower ownership still identifies the actual actor and recipient.

Native virtualized cells share contiguous group surfaces, separators and only the first/last outer
corners, through the same GroupedList used by Profile. Day headings remain outside their groups;
paging never nests an unbounded mapped list in the virtualizer. Profile/Community top-tab labels use
the normal HeroUI font size, matching Groups/Events. Icons stay inline; narrow Profile tabs scroll
horizontally rather than shrinking their text. Shared platform tab bars center their intrinsic painted
width when it fits and bound overflow without a trailing empty surface. Native triggers retain 44px
minimum targets; native segmented groups have no per-cell padding/shadow or duplicate separators.
Rows have no avatars or nested links, with relative
time and localized local-calendar day headings. Native uses one
SectionList and safe areas; web uses source-paged progressive loading with browser content visibility
for off-screen sections. Loading, initial/next-page failures and true empty results remain distinct.

Profile activity pages now include the same safe author projection as Community (ID, public name,
username and avatar URL only). Older cached Profile rows use the already-owned Profile query identity
while revalidating; identity is never inferred from the current viewer or duplicated into local state.

TanStack Query owns remote data under the API/viewer Profile activity family, with a separate network
and filter key. Existing fresh-token, cancellation, stale revalidation and encrypted native MMKV
ownership/purge rules apply. Zustand holds only scoped selected tab/filter and clears them on logout.
No offline access/replay is enabled. Community does not add a splash prerequisite or catalog warmup.

Known block/unfollow/unfriend intents cancel conflicting reads and optimistically remove affected
network authors (and blocked social targets), never fabricate historical activities. The canonical
journal restores only a failed intent's changes and reconciles from the server. Existing Profile
invalidations also cover Community; inactive queries become stale without a background fan-out.
Group/source access-loss reconciliation covers network pages too. New `public-v1` feed keys and
selective native snapshot retirement prevent pre-policy PRIVATE activity caches from being restored
or reused, while retaining unrelated cache data.

## Validation and operations

The normal migration includes only necessary activity timestamp/source/join lookup indexes. Apply it
to the intended replica set separately before deployment; this task does not authorize an application
migration/reset, Clerk changes, provisioning, publication or CI policy changes. Real MongoDB tests use
only disposable Testcontainers databases. See [operational gates](organizations-events-operations.md).

Implementation acceptance is incomplete until the real-fixture Playwright and Maestro scenarios run
against an authenticated Development/Preview build. Unit coverage, compilation, syntax/discovery and
isolated browser layout checks are not authenticated/native acceptance. See the implementation
checkpoint for the exact checks executed.
