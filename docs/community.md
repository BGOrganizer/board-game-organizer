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

All is the union of current accepted mutual friends and users the viewer follows. Friends and
Following use those respective current relations; incoming followers alone never qualify. The viewer
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
`limit=10` and the existing strict instant/UUID cursor. Current network/time predicates, blocks and
receipt deduplication run in MongoDB. Fixed source chunks are then resolved through the same source
visibility code as Profile before ten visible rows and their cursor are emitted. No hidden total or
inaccessible placeholder is returned. Sparse networks/authorization can scan extra indexed chunks;
there is no client download of the graph, per-author Profile fan-out, or duplicated feed collection.

## Public sources and read-only details

PRIVATE Group activities are excluded from both feeds, including the owner's and accepted members'
Profiles. Approved PUBLIC Group activities and their Events/Tables are visible without Group
membership, subject to authentication, both block directions, active exclusions and source existence.
Pending/unapproved public revisions are not published as feed context. A public Group's approved
name, not its unreviewed proposal, is displayed. Standalone activities keep existing source access.

Authenticated non-members can now read approved PUBLIC Group Event details, their Tables, accepted
rosters and frozen Table rankings/results. These reads return explicit `readOnly` metadata and no
participation, vote, invitation, edit, result-registration or finalization capabilities. Pending
rosters and invitation candidates remain privileged. Public projections omit result drafts, private
email and individual vote choices; public display names never reuse mirrored email fallbacks.
Members retain their normal existing capabilities. Write methods still require membership/admin
through the original guards: public read access cannot enter a write path. PRIVATE detail access,
main authorized lists, public discovery, Group member lists and Group-wide ranking permissions are
not widened. Events/Tables from unapproved Groups, active group exclusions, blocked public Event
owners, deleted sources and removed Tables remain denied.

Feeds never acknowledge notifications. Opening an authorized detail retains its existing direct
information-read behavior; Community has no invented unread count, attention dot or polling loop.

## UI, cache and reconciliation

Each app owns its activity renderer and navigation; Profile and Community share that renderer within
that app, using the same GroupedList/GroupedRow structure. Public author and contact/resource names
sit together beneath the activity label, without avatars or nested links. Profile/Community top-tab
icons and labels share one horizontal row, with 44px minimum touch targets and compact labels at
narrow widths. Rows stay compact, with relative time and localized local-calendar day headings. Native uses one
SectionList and safe areas; web uses source-paged progressive loading with browser content visibility
for off-screen sections. Loading, initial/next-page failures and true empty results remain distinct.

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
