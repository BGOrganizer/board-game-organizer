# Profiles, statistics and activities

Implemented locally on web and native mobile; authenticated/device acceptance remains incomplete.
The [unified domain](groups-events-refactor.md) remains authoritative for source access, consent,
physical results, deletion and OpenSkill. [Community](community.md) reuses these activities and source
visibility with a current-network/time selection; no offline mode is enabled.

## Access and presentation

- The existing owner Profile and social **View profile** action use the same platform-owned UI.
  Web additionally exposes `/profiles/[userId]`; native uses `/user/[userId]`.
- Every profile endpoint requires a fully authenticated viewer. A block in either direction or a
  missing subject returns `404 PROFILE_NOT_FOUND`, including direct profile/activity/rating URLs.
- Other-user responses contain public identity, aggregate counters and GLOBAL ratings only: no
  email, phone, BGO moderation role, Clerk account metadata or private BGG account identity/sync data.
  Published collection snapshot/count metadata and the subject's collection/personal BGG ratings are
  readable by the same authenticated authorized viewers; blocks in either direction still deny access. Mirror email
  fallbacks are not exposed as profile/activity display names.
- The compact identity precedes the owner's BGG synchronization card and Activities / Player tabs.
  The Collection tab appears for an owner or another authorized profile subject only with a published
  active BGG snapshot, including a successfully synchronized empty collection. A pending first sync
  does not qualify; a failed later attempt does not hide the previous successful snapshot. Without a
  published snapshot only Collection is hidden, not the Profile. Other-user profiles never expose BGG
  account identity, synchronization/unlink controls or owner logout. Collection shows three full-snapshot counters before its scoped 300-ms,
  clearable name filter and source-paged virtualized list: unique titles without expansions, unique
  titles including expansions, and wishlist titles including expansions. Counters do not change with
  the filter. New synchronization imports only explicitly owned games (`own=1`); wishlist flags on
  those owned games can overlap either total. Existing snapshots retain their published contents until resynchronized. Rows reuse the game-selection
  identity/cover/catalog layout, replacing selection with the owner's personal BGG rating or `N/A`,
  never the public BGG average or GLOBAL OpenSkill. Games and Expansions chips initially include
  both types (OR). Wishlist independently shows wished games AND expansions regardless of either type
  toggle; it preserves those toggles for when Wishlist is turned off. Name and In common still restrict
  the selected results before source paging. All-off types without Wishlist is empty, never all games.
  Counters retain whole-snapshot totals.
  In common exists on other-user collections: exact BGG IDs in both published snapshots, including
  expansions and wishlist flags within each published snapshot. Newly synchronized snapshots contain
  owned games; the intersection remains based on exact IDs rather than inferred status. It is disabled with a sync hint if the viewer
  has no published snapshot. Both snapshot epochs are pinned/rechecked; no full collection is fetched
  into client memory to calculate an intersection. Canonical Collection cache identity includes viewer,
  subject, both applicable snapshots and every filter.
  Native uses one SectionList without a scrolling parent and bounded eight-item cached chunks; web
  uses the installed HeroUI React Aria Virtualizer with measured variable row sizes. Infinite scroll
  reveals/fetches more; Collection has no visible load-more button (native retains an accessibility
  paging action). Only search/chips stick while identity/counters scroll away. Focus reveals search
  through its measured local keyboard/scroll owner; manual navigation cancels repinning and deferred
  error focus. Empty/few-result lists retain enough range without focus-driven bulk reveal/fetch. Picker/Collection rows
  reuse the same platform game-card component and spacing. Query changes never reset
  the list to the Profile header. Blur/keyboard dismissal preserve text/chips; clear removes text only.
  Within each tab, its counter cards share the largest natural height and align number/label rows,
  including wrapped text. Different tabs may have different counter-row heights. Player labels spell
  out Win percentage / Percentuale di vittorie; values retain their original percentage semantics.
  Tab, game and activity-filter selections belong to scoped local UI state.
  Owner logout appears only below Activities/Player, remains reachable on profile failure and requires
  confirmation; native retains cache-safe signout. Another user's Collection omits its Powered by
  BGG footer. The owner's existing linked Profile attribution and other catalog/provider attribution
  remain unchanged; other-user Collection never exposes private provider account details. Profile, Community and existing main/detail destinations share each
  platform's compact centered/overflowing tab geometry, normal text size and consistent spacing.

## Aggregate and rating rules

- Social counts derive from current edges, accepted mutual friendships and both block directions.
- Played/won/win-rate use physical unified Tables in TERMINATED Events, including rating-disabled
  results. ND, off-roster entries, removed/unconfirmed Tables and outcomes with fewer than two
  scored roster finishers never enter these aggregates. All rank-one finishers count as winners.
  An empty denominator produces no percentage, not an invented zero-percent record.
- These aggregates and GLOBAL OpenSkill values may incorporate inaccessible private games.
  No private activity detail becomes visible because its aggregate is visible.
- Game selection source-pages GLOBAL personal skill snapshots with positive gamesPlayed. Selection
  starts empty and a separate accessible X action resets it to empty without automatically choosing
  the first game or showing stale history. Profile Player and Group Rankings reuse a presentation-only
  platform selector with covers, bounded options and an X inside the trigger's own control, separate
  from paging controls. Missing metadata does not prevent clearing a retained ID. GLOBAL/GROUP
  queries remain separate; selected metadata never invents a matching search result. A retained snapshot remains selectable after its source
  history is deleted; it does not recreate that history.
- Curves use surviving classified unified Table rating events only, preserving existing OpenSkill
  and ND treatment. Internal ordering uses authoritative after.gamesPlayed, not wall-clock ordering.
  Responses expose ordinal/rating/delta points, never source dates, Event/Table IDs, titles or links.
  Current rating and last-game delta retain their meaning when earlier pages are requested.
  A missing last-game receipt or a receipt not matching the current snapshot's gamesPlayed produces
  no delta, never the change from an older surviving game. Empty/one-point histories do not fabricate a curve. Web/native SVG share only pure geometry.

## Durable activities and privacy

- Recording starts with the new backend writers; there is no historical backfill or notification-copy
  migration. Successful follows, new friendships, accepted Group membership/creation, accepted Table
  participation and CONFIRMED-to-TERMINATED finalization append domain receipts in their source
  transaction. Pending invitations/requests are not participation.
- One played activity contains its outcome; there is no duplicate ordinary victory record. Milestones
  occur at 5, 10, 25, 50, 100, then each multiple of 100. Crossed milestones reference the actual
  physical winning Table, in frozen start/order sequence, and share that source's access requirements.
  Existing per-user transaction locks serialize aggregate threshold crossings across different games
  and rating-disabled Events; locks are acquired in stable order.
- Unique user/source/kind indexes deduplicate receipts. Source Group/Event deletion removes dependent
  activities. Existing terminated records do not generate activities merely when saved again.
- Stored receipts contain source identifiers, not display names or reusable public authorization.
  Each feed read resolves current source access. Private activities remain omitted except explicitly
  shared immutable final played/milestone results, authorized through current friends of final frozen
  players (including ND), with no Group identity. See [Event access and sharing](groups-events-refactor.md#event-access-and-shared-final-results).
  Approved PUBLIC Group/PUBLIC Event reads remain authenticated and block/ban/source-aware. Reading
  never implies consent or Group membership; explicit PUBLIC SELF enrollment is separate. Standalone
  sources retain existing access. See the [Community visibility contract](community.md).
- Profile and Community use the same localized full-sentence narratives, linked public identities,
  compact text spacing and GroupedList rows. Follow receipts describe the other user following the
  Profile subject, not the reverse. Safe author projections accompany current pages; cached older
  Profile rows use the subject's existing query identity. Viewer IDs select You/Tu, correct actor/
  recipient grammar and unlinked self names, including reverse-owned follower receipts. Names
  render as React text, never markup. Preview, history and Community retain continuous grouped rows.
- Authorization precedes the visible page limit: latest five, full pages of ten, seven type filters,
  descending instant/UUID cursors. Bounded source chunks may be scanned to fill an authorized page;
  cursors refer only to returned visible rows. No browsing action acknowledges source notifications.

## State, BGG and deployment

TanStack Query owns server data, scoped by API/viewer/subject. Existing encrypted native MMKV
persistence backs its canonical cache; it is not another Zustand data store. Social counters and
known access loss use the existing optimistic journal and selective rollback. Fresh child-read
permission denials quarantine the subject's cached profile scopes; another actor/API/subject is not
purged. Confirmed Group access loss removes only that Group's activity rows. Notification changes
invalidate affected authenticated profile caches without fetching inactive queries.

BGG uses the existing real server link/sync/unlink endpoints. The client requests a username, never
a BGG password or application token. Last-success metadata is distinct from the latest attempt;
failed publication preserves a previous active snapshot. Explicit synchronization fetches complete
owned (`own=1`) base-game and expansion partitions before publishing either, because BGG can label expansions as
`boardgame` in a combined collection. The parser also rejects items without explicit `own="1"`;
wishlist status is retained only for owned games, including owned wishlist entries. Snapshot publication stores personal ratings/wishlist and
full-snapshot counters atomically with the active identity. Expansions remain unavailable in the
playable game selector and are never imported as base games. Historical snapshots have no complete
expansion/wishlist totals: the UI reports `N/A` and offers an explicit new sync, not invented zeros
or an automatic resync/backfill. Collection API responses never expose stored XML/comments. Cursors
and Query keys include the active snapshot; stale reads revalidate account metadata rather than mix
snapshots. Native encrypted MMKV includes owned canonical Collection queries within existing
retention/budget rules; authoritative unlink purges that scope, while optimistic unlink retains its
rollback base until acknowledgment/verification. Viewer-owned encrypted persistence also covers
shared Collection pages under the existing budgets/retention policy. Known Profile denial/block clears
only that subject's Profile/Collection scopes, cancels late reads and purges their canonical disk data;
optimistic blocks use the existing journal/selective rollback. Unlinking the viewer removes own/common
pages, not independent other-subject collections. Verified subject snapshot loss/replacement purges
obsolete pages. Restore never grants authorization or enables account controls.
Mutation errors are reset for a subsequent explicit
action. Existing linked Powered by BGG artwork uses a HeroUI light surface scope.

Run the normal API migration against the intended replica set **before enabling these writers**:
new profileActivities receipt/paging/source indexes and a per-player Table-outcome index are required.
No application database migration, deletion/reset, provider provisioning or real BGG operation was
performed. Integration validation migrated and mutated only ephemeral Testcontainers databases.
Existing deployment isolation and operational gates apply.

## Acceptance

Unit checks cover API privacy, strict queries/Preview bypass, ND/roster rules, receipt deduplication,
ordinal history, milestones, selective cache behavior, localization and owner/other UI paths.
`test/integration/profile.test.ts` requires a real isolated MongoDB replica-set container. The current
six profile/network cases pass with zero skips, including kind-filtered source paging, privacy,
deduplication, partial stored outcomes and concurrent unrated milestone crossings. The preceding
moderator checkpoint passed all 123 API integrations in four files; the current full rerun exceeded its
local deadline and is not a new full-suite pass. This is not authenticated UI/provider or native-device
acceptance.

Explicit real-fixture web run: `pnpm --filter web exec playwright test --config e2e/profile.config.ts`.
Set PROFILE_LOCALE=en|it, PROFILE_THEME=light|dark, PROFILE_API_URL (local/Preview origin), E2E_EMAIL,
PROFILE_OWNER_NAME, PROFILE_TARGET_ID/NAME, PROFILE_EMPTY_ID/NAME, PROFILE_BLOCKED_BY_ME_ID,
PROFILE_BLOCKED_ME_ID, PROFILE_GAME_ID/NAME and PROFILE_PUBLIC_ACTIVITY_TEXT/PRIVATE_ACTIVITY_TEXT.
The target has at least two surviving rated outcomes; the empty subject has no history/activity;
block fixtures represent both directions. The public text must appear within the first authorized
five rows; private text must belong to a source the viewer cannot access.

The real BGG/logout test additionally requires PROFILE_BGG_USERNAME (canonical real public username),
PROFILE_BGG_INVALID_USERNAME (valid syntax but nonexistent) and
PROFILE_MUTABLE_BGG_FIXTURE_ACK=owned-unlinked-development-account. It mutates only that explicitly
owned test account through normal UI/API actions. Run separately from the read-only scenarios when
sharing a fixture. Development Clerk keys and local/Preview targets are mandatory; no response mocks.

Native manual flows 17/18 use the same named fixtures in an already authenticated Development/Preview
build and selected EN/IT locale. Flow 17 needs the profile fixtures except API_URL/THEME/GAME_ID;
flow 18 needs LOCALE/OWNER_NAME and the BGG inputs/acknowledgment above. Run both themes and locales.
See the [Maestro guide](../apps/mobile/.maestro/README.md). Syntax/discovery, isolated browser layouts
and compilation do not prove authenticated, provider or native-device acceptance.
