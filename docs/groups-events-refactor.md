# Unified Groups, Events and Tables

This is the approved contract implemented on `feat/social-api-refactor` (existing PR #22).
It describes the current source, not a deployed or E2E-accepted release. Verification and remaining
runtime limitations are recorded in [implementation progress](implementation-progress.md).
The [old contract](organizations-events.md) is retained as a historical deployment reference only.
The subsequently approved [Community extension](community.md) makes approved PUBLIC Group Event/Table
**detail reads** available to authenticated non-members in read-only mode. It does not widen main
lists, participation, writes, private Group details or Group-wide rankings. PRIVATE Group activities
are now excluded from both activity surfaces, even for members; these explicit exceptions supersede
older membership-only activity/detail statements below.

## Delivery and database scope

- Web and native navigation: Tables / Events / Groups / Community / Contacts. Contacts retain their own social
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
- Creator alone may promote/demote accepted members to/from Group moderator, with explicit
  confirmation and the captured membership version. Missing historical membership roles mean
  ordinary members. Group moderators are neither Clerk roles nor global BGO review staff.
  Moderators can edit Group information, manage invitations/requests and exclusions, and fully
  administer its Events/Tables within existing state, cutoff, consent and result guards. Only the
  creator can delete the Group. A moderator cannot remove/ban the creator or another moderator,
  nor promote/demote anybody; creator may remove/ban moderators subject to the same frozen-duty
  protections. Creator identity never transfers on moderator edits.
- Current accepted Group authority governs grouped Event/Table management, not historical Event
  authorship. Demotion, departure or exclusion revokes delegated management even on Events created
  by that user; the creator retains management. Promotion/demotion and Event writers share the
  Group transaction lock. Leaving/removal/ban clears moderator status; reinvitation never restores
  it. Management alone creates no seat, vote, participation statistic or rating.
- Member management uses one accent icon action, opening a bottom sheet with icon-bearing Ban,
  Remove and Make moderator/Demote rows as authorized. Each action requires its own confirmation;
  cancellation performs no mutation. Role changes use ordinary action-specific optimistic feedback
  and selective rollback. Managers receive Group administration/request notices without inventing
  member attention or broadening global moderation.
- Main Groups has Private / Public / Search top tabs (Italian: Privati / Pubblici / Ricerca).
  Private/Public source-filter the viewer's administered Groups, accepted memberships and pending
  invitations by immutable type before pagination; requests, departed members and active exclusions
  do not qualify. Pending invitations grant no member-only capabilities. Approved public discovery remains separate in Search with its four-character minimum.
  Existing notification/detail invitation consent stays available. Query keys and provisional creation
  rows retain the same type split. Startup warms the exact default Private member page without adding
  a splash-gating dataset or changing the five-second total limit.
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
- Venue/favorite verification prefers an exact normalized address/coordinate provider match. If that
  point drifts, exactly one provider result with the same full normalized address may supply canonical
  address, coordinates and derived timezone; client coordinates/timezone never become authoritative.
  Missing or ambiguous address matches remain rejected, without a distance/nearby-match tolerance.
  Favorites retain an opaque selection key while storing canonical location fields, so both the
  original selection and verified point support owner-scoped status/removal. Existing rows stay readable.
- Invitations are friend-only and require individual acceptance. Public membership requests require
  creator/moderator approval. Invitations use the inviting manager's own eligible friends.
  Pending invitees/requesters can read permitted group information and
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

- An event may be standalone or belong to a group. Current creator/admin and accepted Group
  moderators create and manage grouped events. Standalone administration remains creator-only.
  Standalone invitations are friend-only; grouped participants must be accepted members.
  Successful grouped creation returns to that Group's Events tab; standalone creation returns to
  main Events' Available tab and edits retain their Event detail destination. Creation selects an optional Group
  inline through the platform HeroUI Select, with searchable source-paged Group items and explicit
  No group; no separate Group search screen. Launching from a Group presets and locks that selection;
  existing Event Group identity remains immutable.
- Main Events has Registered / Available top tabs (Italian: Iscritti / Disponibili). Registered includes
  active own registrations (accepted, pending invitation or request) at a nonremoved Table, or an
  actual demonstrator duty. Available includes other accessible Events of accepted Group members/
  creators, plus own admin-only standalone Events. Administration alone is not participation. Public
  non-members, pending Group invitations/requests and live exclusions grant neither section access;
  existing membership/detail/write guards remain unchanged. Demonstration counts even for an admin.
- Main Tables has one combined source-paged list, without inner tabs: explicit active participation,
  seated/frozen players, demonstrators, invitations awaiting response, historical pending requests
  and accepted queued players. Admin-only Tables never qualify, including confirmed/terminated ones;
  declined/left rows and excluded frozen-event Tables do not qualify. Missing cached position metadata
  neither hides an explicit active registration nor proves a seat. Canonical agreement/reservation/
  frozen-roster projections still determine positions. The API walks bounded authorized source chunks
  before emitting a page; it never concatenates independently paginated client sections. Optional
  legacy mine/waiting requests remain supported, with their canonical position checks and distinct
  cache identities; the combined list never borrows a cached seat-only first page.
- Main Event sections and combined Tables, owned Private/Public Group tabs and Group-context Events retain chips,
  clear input and help but use Filter / Filtra, named placeholders and brief filtering help, with no
  character minimum. Queries debounce 300 ms and filter escaped names inside that authorized scope
  before response pagination. Group Search remains separate discovery with its four-character minimum.
  Group-context Events remain one contextual list, not another copy of the main section tabs.
  Main Tables and main/Group-context Events replace date-period chips with Confirmed / Planning /
  Terminated lifecycle chips (Confermati / In pianificazione / Terminati), initially all enabled.
  Enabled states are combined with OR and the escaped name query with AND before source pagination;
  disabling every state returns an empty list. Table state comes from its parent Event, never the
  registration or a guessed date. Legacy API period parameters remain supported independently.
  Main Event/Group tab strips and Group detail contents use compact platform-owned spacing; Group
  destinations share the same content inset without nesting virtualized lists in scrolling parents.
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
- Native location picking preserves map → name → favorites → address-search order. Address focus
  enters search-only mode: map/GPS, name, favorites and confirmation hide from view, touch and
  accessibility; their state is retained. The same non-collapsable map container keeps its 240-point
  height and full width: hidden mode changes opacity/flow placement, never map bounds, style, zoom
  or component identity. Search moves to the top of the same virtualized header after controls leave
  flow; post-layout scrolling uses no timer or guessed offset. One-tap result selection dismisses
  the keyboard and restores the full picker. Blur alone does not move a row before its selection;
  keyboard dismissal also leaves search-only mode. Licensed MapTiler/OSM credits remain visible
  independently while the map is hidden. Existing camera/activity guards, iOS navigation-header
  keyboard avoidance, Android resize behavior, four-character/300-ms search, verified addresses,
  canonical favorites and native Back remain unchanged.
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
  name and status first. When opened from the main Events list (or an unmarked direct link), a separate
  Group section immediately below Details links the approved Group artwork/name; it is not nested in
  the Event identity card. Opening from that same Group omits this redundant parent item. Table detail
  starts with Settings and player-limit help above its Planets card: name, shared Rating badge, and
  minimum/maximum counts with their existing icons. Immediately below, Event labels a linked item
  with the parent Event's name and matching stable artwork when opened from Main Tables or an unmarked
  direct link; entry from that same Event omits it. Explicit scalar parent-ID URL hints carry only
  presentation context, never authority or shared global navigation state. Group context survives
  Event edits; ordinary back navigation retains its existing stack behavior. Voting help states accepted-only voting, reserved
  pending places until acceptance, and participation through at least one Table.
- Main Tables and parent Event lists use one platform-owned Table card. Animated DiceBear Planets
  artwork uses the persisted Table ID on the left, consistently with saved/edit/review cards. Its
  centered action below the 64px artwork shows the viewer's seated/frozen accepted state (success
  check), pending invitation (warning mail), pending request (warning clock), or waiting list (warning
  ordered-list icon). Its accessible popover explains that state. The trigger is a sibling of the
  navigation link/pressable, never an interactive child of it; opening it does not navigate, accept
  consent or acknowledge notification attention.
  Group/Event/Table cards share title typography and leading identity icons. Group visibility,
  venue and member/Event counts use the same body typography as Event/Table metadata.
  Right-side Table rows show bold name/Dices with Rating at far right. Only Main Tables shows
  separate labeled Event/calendar and Group/people rows, then the parent Event's localized,
  human-readable date/time and verified venue; Event-context cards omit those redundant parent
  rows and schedule. Event cards likewise label their associated Group and show their own schedule.
  Planning previews retain the first proposed date/time/venue and the existing total-proposals `+n`
  convention; confirmed/terminated cards use the chosen date/time/venue only. Every `+n`, including
  additional games, uses the same stock HeroUI accent foreground. Missing old cached schedule fields
  remain partial skeletons until reconciliation, never guessed dates/venues or per-card parent reads.
  Following rows retain five distinct icon/counts for minimum, maximum,
  accepted registrations, waiting places and pending registrations. Accepted/pending totals include
  queued registrations; existing seat/queue counters retain their meanings. Missing cached metadata
  uses partial skeletons, never guessed counts. One Table list / Lista Tavoli heading and count-legend
  popover precede the list in both Main Tables and Event detail; count help is not repeated per card.
  External Group/Table cards navigate only: invitation acceptance/decline lives in their details;
  requests never expose self-approval. Following rows show first game
  with Dices and localized additional `+n game/games`, optional demonstrator with presentation icon,
  and all joint winner names with trophy only when terminated. Group list invitation/request/admin
  indicators use the same centered explanatory action. Accepted members also receive a success check
  with a Group member explanation; pending applicants/invitees and discovery-only viewers never receive
  that member indicator. Compact picker/detail overlays remain unchanged.
  Generated Group Landscape artwork uses the Group ID, never its mutable name. Uploaded logos remain
  untouched; unsaved Table artwork retains its existing local key until a server ID exists.
- Event list cards have one centered participation indicator. A complete own-registration source
  projection prioritizes any accepted seated/frozen Table, then pending request, pending invitation,
  then waiting list. Organizer identity alone does not grant participation; an organizer with no
  participation retains an admin indicator. Read-only own `position` metadata uses the same agreed
  reservation projection/frozen roster as Table reads and is never persisted as a new status.
  Missing accepted-seat evidence in older caches or raw mutation receipts shows only a partial
  indicator skeleton until canonical reconciliation; clients do not infer an aggregate from a paged
  subset of Tables.
- From the main Events list, creation preloads only the source-filtered first page of creator Groups
  into the same scoped Query cache as the picker. The selector also loads before opening in an
  unlocked wizard, uses compact artwork and a bounded scroll viewport, and paginates/searches at source.
  Opening the native selector dismisses/blurs the active input before displaying options. Locked
  contextual selection starts no other-Group request; errors and explicit no-Group selection remain.
- Editors keep unsaved values locally. Creation/edits happen only on final confirmation. Table edits
  are partial upserts; explicit `removedTableIds` remove tables. Unloaded pages are never implicitly
  deleted. Versions are pinned; stale drafts require reopening rather than overwriting newer data.
- The creator/admin may delete a PLANNING Event or remove one of its Tables through the far-right
  app-header trash action on both clients, after explicit destructive confirmation. Both DELETE
  bodies contain the current **Event** version. The same Group/Event transaction locks, creator
  authorization and public cutoff checks as planning edits apply; CONFIRMED/TERMINATED records
  cannot be deleted directly. A Table removal retains at least one Table, marks the selected Table
  removed, cancels its active registrations and advances the Event version atomically. Deleting
  the Event removes its Tables, registrations, votes and linked inbox history; unrelated records
  and the existing explicit whole-Group cascade remain unchanged. This is product-record deletion,
  not database/collection reset. Confirmation is version-pinned; a newer version requires reopening.
  User confirmation closes/navigates immediately, projects only owned cached rows, and rolls back
  selectively on definite failure. Unknown outcomes cannot be blindly reposted.
- Game pickers exclude games already selected for the current Table. Source-paged picker rows already
  carry catalog metadata (including known durations for collection results), so selection updates
  the local draft and returns immediately without a separate game-detail request. Missing duration
  retains the existing explicit manual fallback; final server validation remains mandatory.
- Accepting a Table invitation opens the existing availability sheet on both clients, without
  changing participation. Accepting explicitly accepts the current Event and Table configuration.
  Each category with one date, location or game is read-only, has no voting tab/buttons/totals and
  requires no ballot. PRIVATE Group invitations require YES/IF_NEEDED/NO for every option only in
  categories with multiple choices, including when another Table is accepted, with at least one
  YES/IF_NEEDED per such category. PUBLIC/standalone schedules remain read-only; Table game voting
  appears only for multiple games. If every category is singleton, the review has no voting tabs,
  but still requires the explicit Accept action.
  Final confirmation PATCHes the existing registration with its version and `participation`
  (current Event version, game votes and PRIVATE availability). Consent and choices commit in one
  transaction; invalid/stale choices or a storage failure leave the invitation pending. Cancellation
  writes nothing, failure preserves the draft, and decline remains a direct versioned action.
- Each invitation has its own accept/decline response. Creation/request time, then server sequence
  and stable ID determine priority, not acceptance time. Pending invitations reserve seat/queue
  priority but **cannot vote, count toward minimums, agreement or the frozen roster**. Voting never
  accepts an invitation. Accepted waiting players may vote. The organizer-only Table invitation
  candidate endpoint excludes every PENDING/ACCEPTED registration on that same Table, seated or queued,
  before search/cursor/limit paging. Declined/cancelled registrations and participation at other Tables
  do not exclude a candidate. Both clients filter current owned invitation intent on the first render,
  including newly opened search pages; positive receipts remove acknowledged invitees from cached
  candidate pages before intent retires. Reopening never paints an already-invited person while
  waiting for an eligibility refetch. Definite failures restore eligibility selectively. Admin removal
  immediately makes the already-known recipient available as local release intent outside source pages,
  including cold searches. Reinvitation selected during removal waits for its exact successful
  cancellation receipt and never dispatches after rejection or an unverified receipt. Candidate pages
  carry their Event epoch: only complete matching post-receipt exclusions retire release hints across
  searches; stale/partial pages do not. Eligibility remains advisory and server-validated. PUBLIC other-Table overlaps remain visible with
  `invitationBlockReason: TABLE_TIME_CONFLICT`; clear candidates return null. Both clients disable
  invitation/selection while a separate accessible question-mark popover explains pending/accepted
  participation or demonstrator duties. No other Table identity is disclosed. This snapshot is
  advisory: the POST revalidates atomically and may still reject a concurrent change. Existing
  approved Group membership, exclusions and standalone reciprocal friendship/block rules remain
  authoritative. Group candidate responses expose no email/presence.
- Accepted members can enroll directly; no extra booking-approval workflow. Every voluntary join
  opens a platform HeroUI review sheet. Joining explicitly accepts the current Event and Table
  configuration; singleton settings are shown read-only without voting tabs. Only multiple PRIVATE
  dates/locations and multiple Table games expose their corresponding tabs. PUBLIC Group Events
  prefer Games initially; other Events prefer Dates without another ACCEPTED Table, otherwise Games.
  If that category has no vote, use the first available voting tab; with none, show only settings.
  Known settings remain visible while missing Table metadata loads, but submission requires complete
  authorized metadata. The default never overrides a later manual selection of an available tab;
  if its category becomes singleton, fall back to an available category. Pending/declined/cancelled
  registrations do not qualify as prior participation. Stored PRIVATE preferences are prefilled and
  editable only for multiple-option categories. Every current votable option needs YES/IF_NEEDED/NO,
  with at least one YES/IF_NEEDED per multiple-option dimension. Final confirmation pins the Event version and saves registration,
  this Table's game ballots and complete PRIVATE Event preferences in one transaction. Missing/stale/
  incomplete/foreign choices fail before writes. Invitation consent stays separate; pending invitations
  never receive manufactured votes. Opening, editing and canceling the sheet write nothing. Owned
  participation/preference caches reconcile from acknowledgment without replacing newer Event votes.
  The caller's cached, API/actor-scoped profile supplies their name during local intent and raw-receipt
  handoff while authorized roster metadata loads; missing self identity uses localized You, never a
  Clerk ID. This cache subscription starts no additional profile request and grants no participation
  or position. Other actors' cached profiles cannot supply self identity.
- Both clients show grouped games and places in Table details. Places start at the maximum capacity;
  occupied capacity retains an additional queue entry. A separate Waiting list section always follows
  Seats list, each with its own explanation popover. While primary places remain available, Waiting list
  shows a centered non-interactive empty state; its existing queue action appears only at full capacity.
  Anonymous/unloaded primary
  reservations precede queued people too, including across render pages. Local saving intent is never
  assigned a seat or queue priority. Large rosters/placeholder ranges are source-paged and rendered
  progressively; native uses one SectionList, never nested same-direction lists. Empty places enroll the viewer; organizers first choose self-enrollment
  (when eligible) or the existing invitation picker. Avatar badges distinguish accepted, pending and
  waiting players. Pending identities remain organizer/recipient-only; other reservations are anonymous.
- Detail preference controls offer only YES/IF_NEEDED/NO for dates, locations and games. UNKNOWN remains
  an internal readable missing/historical state, never a selectable choice, displayed total or legend
  item; an uncast ballot shows a neutral choice prompt, not a fabricated YES/NO. Event date/location
  voting requires accepted participation; game voting requires acceptance at that Table. Singleton
  categories reject direct votes with `FIXED_OPTION`, even from an accepted player. Each edit
  retains at least one YES/IF_NEEDED among current options of its own dimension/Table. Positive states
  can interchange; NO is disabled when it would remove the final positive choice. The API enforces
  the same condition under the Event transaction lock, including concurrent game rejections. Removed
  options and another Table's game votes never qualify. Aggregate totals include accepted players only
  (once per Event for dates/locations), displaying only the three explicit meanings. Pending ballots
  never contribute or imply consent; missing detail totals remain partial skeletons.
- Public events additionally require an end and exact booking cutoff. Their tables have
  fixed starts and BGG-derived duration; missing metadata requires explicit administrator duration.
  Table editors fix the date to the Event day and expose only a start-time field, including Event
  start and the latest start that fits the full duration by Event end. API rejects invalid intervals
  before writes. Native end/deadline/Table clocks use the installed system time picker; Android
  bounds are revalidated after selection because its native clock cannot disable individual times.
  Demonstrators use the existing grouped player identity pattern. Public detail and wizard summary
  use matching grouped Start Date and Time, End Date and Time and Registration Deadline Date and
  Time information items (Italian: `Date e ora Termine iscrizioni`).
  Planning uses the longest candidate duration; confirmation snapshots the selected game duration.
  New/edited public ends must be strictly later on the start's local calendar day, enforced in UI
  bounds and by API venue-zone validation. Registration deadline must be on a local calendar day
  before the event, regardless of clock time; event-day deadlines are rejected even before its start.
  A new deadline must still be in the future. Older overnight/multiday records remain
  readable and are not migrated; an explicit planning edit must satisfy current rules. Player and
  demonstrator duties cannot overlap; half-open boundaries permit adjacent tables. Other modes do
  not restrict overlaps.
- Accepted registration supplies implicit compatibility independently for every singleton category,
  including historical singleton NO/UNKNOWN ballots; those obsolete ballots neither block agreement
  nor contribute invented YES preferences. Pending registrations still reserve capacity only.
  New joins/acceptances store empty maps for singleton categories. Positive singleton payloads from
  older clients remain readable inputs but normalize to empty maps; NO/UNKNOWN/foreign keys are
  rejected. Multiple-option ballots remain complete and explicit. No historical data is rewritten.
  Event/registration versions, authority, exact cutoffs and immutable frozen rosters remain unchanged.
  After cutoff no user, including the administrator, may
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

## Notification attention

- Bell alone retains its numerical unread count and `99+`; navigation retains accessible 8px
  numberless dots. All unread dots use stock HeroUI `danger`, never accent. Card/item dots remain
  inside their own layout, after the shrinkable title/name; precise dots stay outside voting actions.
  No novelty text label, attention border or pulse. Zero/unknown attention has no dot. Rendering,
  focus and navigation alone never acknowledge attention; the accepted-member dwell below is explicit. The obsolete presentation high-water store is removed;
  source change metadata, namespaced identities and acknowledgement cutoffs remain unchanged.
  All counts come from complete recipient-scoped aggregates, not loaded inbox pages.
- Pending business decisions are separate from unread state. A recipient's actionable invitation
  keeps its reply indicator after explicit notification reads; an outgoing Group request retains
  its waiting clock, never an approval action. Group admins get an owner-only complete pending
  REQUEST count excluding active bans; it drives a request-review glyph beside their status and
  on Members, never a numeric unread badge. Other viewers, including unrelated moderators, receive
  no request count. This is derived read metadata, not persisted Group state or a new permission.
  Event reply attention derives from complete own Table invitations; Table reply requires its
  actual canRespond capability, PENDING INVITATION and open cutoff. There is no Event membership
  and no new organizer approval of Table SELF registrations. Details retain existing authorized,
  version-guarded decisions; card help neither navigates nor submits/reads anything.
- Attention belongs only to the actual affected entity. Event/Group ancestry remains authorization
  and routing metadata, never a reason to show an unread dot. Canonical item identities determine
  ownership: an Event date does not highlight every Table, and a Table game/invitation does not
  highlight its Event or Group. A notice with genuine points in multiple entities contributes once
  to each actual owner. Top tabs also signal unread rows inside their authorized category, including
  off-page rows: Registered/Available, Private/Public/discoverable approved Groups, and a Group's
  actual Event cards. These navigation scopes do not make the Group card an owner, and Table-only
  points do not highlight Event-list tabs. Overview combines only generic/direct information and its
  own precise points, never Members points. Tab scopes are count-only, not bulk-read targets; known
  read effects reconcile their active and inactive caches immediately and preserve unrelated scopes.
  Category dots survive an in-panel filter that hides an unread row. Retired/removed
  resources stay inbox history without disclosing inaccessible ancestry.
- New Event edits persist structured, recipient-owned references to the actual changed dates,
  locations, table games/settings, or removed-option sections. Item identities include resource
  kind, resource UUID, field and option: equal Group/Event/Table UUIDs cannot collide. Old generic
  notices remain generic; do not infer precise changes from translated descriptions.
- Accepted Group memberships identify the real member and Members section. Members-tab and member-row
  dots are independent of pending request-review glyphs. The actual visible member consumes its captured
  point after five continuous seconds: full intersection plus visible/focused document on web;
  FlatList viewability plus active app/focused screen on native. Hidden/unfocused time never counts;
  later signals restart the window. Inbox/push links open Members. Source-proven historical actor
  membership may identify an accepted member only when current membership and timing agree; otherwise
  historical notices stay generic. Pending membership, discovery and moderation alone never grant
  member-point access. Departed/excluded members retarget to existing Group Overview, not missing rows.
- A card or notification link navigates without reading resource/item attention prematurely.
  A successfully displayed detail consumes only direct, generic informational notices. Group/Table
  invitations and structured points survive container entry. Inbox/push links locate the first
  unread point; removed options lead to their existing section. Confirmed/read-only sections expose
  explicit acknowledgement, so no impossible vote is required.
- A successful YES/IF_NEEDED/NO vote acknowledges only the displayed item through its captured
  source cutoff, in the same Mongo transaction as the vote. Successful invitation decisions
  acknowledge that resource's invitation through the captured cutoff without inventing consent.
  Known source read effects update active and inactive navigation/card/bell caches before transport;
  a known decision ACK commits them without waiting for canonical detail refresh. Failures roll back
  only their own effects; unknown outcomes require verification. Later notices and retargeted
  revisions survive old reads. Container entry waits for its scope metadata, never cancelling
  unread-member discovery through an older cached parent count.
- One notice affecting multiple points stays unread until all its points are acknowledged. Reading
  an entity's last point immediately clears its related container/navigation dot, even if another
  affected entity still has unread points. Unrelated points and the bell's single unread notice remain. Explicit Mark as read/Mark all as read and confirmed deletion may
  clear notifications without voting, accepting invitations or changing domain state. Pending
  invitation and missing-vote states remain independently visible.
- Contacts retains Connections / Requests / Search. Entering main Contacts reads nothing in bulk;
  explicit inner selection reads only that subsection. Follows and accepted friendship notices
  belong to Connections; incoming friend requests belong to Requests. Contact rows aggregate their
  actor's unread social notices. Contact top tabs additionally reflect source-backed unread markers
  on their loaded rows, including Search results/suggestions and actors present in multiple lists.
  This display fallback does not change subsection read targets or consume another kind of notice.
  Repeated existing follows emit no duplicate notice.
- Counter batches contain at most 50 unique resource targets. Cache-only navigation observers reuse
  the bell watcher: no per-card notification polling or inbox scans. The bounded member dwell timer
  is the sole automatic item-read exception; cutoff boundary timers only expire displayed invitation
  affordances. Owned optimistic reads/deletions coordinate actual owner cards/tabs and bell,
  preserve disjoint writes and roll back selectively. Unknown write
  outcomes require source verification, never automatic write retries; session changes cancel old
  work. Read failures remain observable without user-action toasts.

## Exact agreement

A/B/C is evaluated per table, against one common event date/time and location:

1. **A:** seated accepted players have full agreement; do not consult waiters.
2. **B:** seated players reach the date/location minimum but disagree on game; wait for votes or
   administrator edits. Do not replace them merely to obtain another game.
3. **C:** seated players lack date/location agreement; consider accepted waiters in priority order,
   stopping at the earliest prefix enabling full agreement. Preserve higher-priority eligible
   players, capacity and pending reservations; displaced users remain waiting.

The same eligible people must support every multiple-option dimension with YES/IF_NEEDED; UNKNOWN
is not positive there. Accepted registration supplies compatibility for each singleton independently,
without a persisted or counted YES preference. YES preference wins before distinct-person count
(one person across multiple tables counts once),
then original option order. Only considered players' votes count. Bounded exact search fails closed
with `AGREEMENT_COMPLEXITY_LIMIT`, never with an approximate fabricated agreement. Confirmation
rechecks authoritative inputs transactionally. Administrator notifications use semantic deduplication;
there are no repeated identical notifications or player reminders to change votes.

## Results, lists and transport

- Confirm/reopen-planning dialog actions have semantic icons. In confirmed Events the administrator's
  icon-only Finalize event action lives in the app header, top right. It requires saved results for
  every included frozen Table; excluded Tables never require results. Registration lives only in the
  included confirmed Table's detail header and remains administrator-only. Reopen planning stays a
  bottom-right, secondary icon-only FAB. Capabilities, busy/version guards and exact cutoffs remain.
- An included confirmed Table shows a schedule card immediately below Settings, also retained in
  terminated history. Date/time comes from its frozen confirmation snapshot, formatted readably in
  the Event venue's time zone; duration belongs only to the selected game, never the longest proposal
  or an invented zero. Missing duration stays Unknown; missing cached zone stays a partial skeleton
  until the existing Event query resolves. Only PUBLIC Tables with an assigned demonstrator show the
  usual grouped avatar/name user item. Planning and excluded Tables have no finalized schedule card.
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
- Result registration opens one Table editor titled Register result / Registra Risultato. Save result
  persists provisional `resultDraft` scores on that Table, with the complete frozen roster, exact
  decimals/ND, lower-wins and tie-break validation. Only the Event administrator can read/write these
  provisional scores; they never populate immutable `results`, ratings, statistics, activities or
  finalization notifications. Saves remain editable and survive navigation/restart. Event version
  checks serialize saves against concurrent saves, replanning and finalization; stale editors must
  reopen and explicitly review the current roster. Table reads expose their parent Event epoch;
  editors never combine a Table snapshot from one confirmation with another Event version.
  The finalization dialog captures API/user/Event identity and version when opened; changed data
  requires a new explicit review/confirmation. Duplicate submissions and uncertain-outcome replay
  remain blocked without trapping navigation. A new confirmation discards previous provisional
  scores, including those on newly excluded Tables. No server Event planning drafts are introduced.
  Table-detail registration is absent for excluded, planning and terminated Tables and non-admins;
  direct requests enforce the same authorization. Finalization reads saved scores on the server,
  not a client-supplied whole-event score bundle, and commits all included Tables atomically.
  Finalization and its confirmation share a terminal-state icon. Back belongs only to the app header
  (and native hardware Back), not a duplicate editor/body button. Score inputs have a localized
  placeholder on both clients. Native score-input focus first registers the keyboard target, then explicitly
  calls the sheet's public `snapToPosition("80%")` method. A provided 80% snap point and `extend`
  keep keyboard events on that detent instead of `fillParent` forcing full height. `restore` handles
  keyboard dismissal, and the top safe-area inset bounds expansion. Android keeps its existing resize mode. Local drafts and automatic content sizing stay
  intact, without a second keyboard-avoidance layer or manual keyboard listeners.
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
  and detail; reopening planning restores ordinary planning visibility. Legacy API Past/Future
  parameters use the chosen local day; unchosen dates appear in both, but current list chips use state.
- Search/role/state filters run before pagination. Lists, rosters, seats, game selection and group
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
  Shared startup orchestration prioritizes Tables/Groups/Events/Profile with three workers; mobile
  splash waits only for these four or its original five-second budget. Other first-page reads warm
  sequentially after release: favorites, BGG account/linked collection, bell/inbox, social lists and
  suggestions, then up to two linked Events' details/Tables and two listed Groups' permitted
  members/Events. Screen query factories own the keys; inbox readiness includes its active locale
  and 20-item page, never the three-item bell or another actor/locale. Web uses the same plan without
  a splash; routing does not cancel a started queue, and a slow priority read cannot starve background
  work beyond five seconds. Logout/session changes clear private cache and stop queued reads.
  Search terms, further pages, privileged/retired endpoints, geocoding and provider syncs are not
  speculative warmup work; no full-catalog/database download or extra polling is introduced.
- EN/IT source and compiled Lingui catalogs are committed together; native runtime IDs are preserved
  explicitly without adding a mobile Babel configuration.

## Optimistic writes and reconciliation

- One user operation owns its complete optimistic package across existing API/actor-scoped caches.
  A rejected operation removes only its projections; independent pending or acknowledged operations,
  newer entity/registration/membership versions and unrelated profile fields survive. Query remains
  the server-data owner; the transient operation journal is neither a persisted cache nor Zustand data.
- Contacts lock the target user, favorites their selected/canonical identity, and Groups/Events their
  incompatible versioned writes. Explicit queues project intent immediately and serialize dependent
  dispatch; unrelated Groups, people and notification rows stay usable. Inbox mark-all conflicts with
  row writes; independent row operations reconcile the shared unread counter selectively. Both clients
  confirm single-notification deletion and expose confirmed whole-inbox deletion at the far right of
  the application header. Whole-inbox deletion clears all owned cached pages, cursors and bell counts
  immediately, including other cached locales; the API deletes only the authenticated recipient's
  notifications, including unloaded pages, never other recipients' actor history or push subscriptions.
  Rejection restores owned projections; uncertain responses require readback, not an automatic retry.
  Destructive consent does not transfer between accounts or sessions. BGG writes share the account
  lock. Navigation and local form choices do not wait for HTTP.
- After local validation, explicit actions stage intent/feedback and close their existing dialog or
  return from their editor immediately. Known recipients and enrollment intent may appear in existing
  rows, but do not create canonical invitations, consent, accepted membership, positions or permissions.
  Guaranteed seating, verified provider identity, Event confirmation and immutable results still require
  server acknowledgement. Issued invite credentials and OS permission grants cannot be predicted.
  Registration receipts expose the committed parent Event epoch without storing that transport field
  on registrations; complete capabilities/agreement still require authorized metadata reads.
- Ordinary invalidation/refetch runs in the background and cannot turn a committed write into a failed
  write. Projections and partial acknowledgements preserve the cache's original age and invalidation;
  cancelling a GET must not restore an obsolete fresh flag. Pre-acknowledgement reads are cancelled
  once at the receipt, not again when later metadata recovery finishes: post-receipt roster/list
  refreshes must survive. Table detail seeds use authoritative list snapshots and retain their
  invalidation instead of absorbing an optimistic overlay or reviving stale invitations.
  Where a receipt omits a required version or permission, only that resource remains locked during
  authoritative detail recovery; the acknowledged form can close. A failed recovery retains committed
  participation instead of restoring the pre-write state.
- The existing notification poll reconciles newly received changes into related active Contacts,
  Group and Event/Table queries inside the owning API/user scope; inactive queries are only marked
  stale. An empty inbox establishes a baseline too. Every new kind in the bounded first page counts;
  if its previous watermark fell beyond that page, refresh active affected domains conservatively
  without scanning older pages. Read/delete changes and older rows do not masquerade as remote writes.
  No independent polling is added to domain lists.
- Transport errors, timeouts and 5xx responses are not proof of rejection. Materialized owned caches
  are read back without retrying the write; failed verification keeps the affected resource locked
  until a subsequent authorized read. A cancelled SDK fetch resolving with optimistic cache data is
  not a server receipt. A write 403/404 alone does not prove lost read access; fresh read denials
  revoke private cached access and dependent writers. Logout/session changes abort operations and
  clear private data before another actor can reuse them.
- Readback is not a durable idempotency protocol and cannot rule out a remote commit still in progress.
  Event/Group creation accepts an optional creation-only UUID `clientRequestId` for correlation, never
  resource identity or an automatic retry key. Permissionless local drafts stay in MutationCache,
  outside canonical API pages; authorized receipts/reads deduplicate by resource ID/correlation.
  Definite rejection retains input for explicit recovery; uncertain creations never automatically retry.
  A strictly newer authorized canonical epoch fences an old version-guarded edit/review/finalization:
  it does not claim that write succeeded or failed. A reopened editor then uses canonical data instead
  of replaying uncertain structural Table writes. Already-open drafts remain pinned; changed frozen
  Table result drafts require explicit review at one current Event version before atomic submission.
- Parent dependencies cancel grouped creations without acquiring Group-wide locks. Creation verifies
  current creator access before dispatch. Deletion acknowledgement or a fresh parent read denial
  retires dependent pending intent and aborts queued dispatch; a write denial alone cannot revoke it.
  Known invitation receipts outside loaded roster pages remain visible until authorized paging hands
  them off; later target mutations and current complete pending reads supersede stale receipts.
- Server atomicity is separate from client rollback. Unified domain writes keep their existing
  transactions. Contact-snapshot replacement, including an empty snapshot, now holds the mirrored
  actor lock and replaces all links in one transaction; inbox mark-all-read is transactional too.
  BGG retains its existing valid staged workflow and atomic snapshot publication, not a transaction
  held open across external provider requests. No live migration, reset or backfill is performed.
