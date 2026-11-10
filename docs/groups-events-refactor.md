# Unified Groups, Events and Tables

This is the approved contract implemented on `feat/social-api-refactor` (existing PR #22).
It describes the current source, not a deployed or E2E-accepted release. Verification and remaining
runtime limitations are recorded in [implementation progress](implementation-progress.md).
The [old contract](organizations-events.md) is retained as a historical deployment reference only.
The [Community extension](community.md) and approved Event-access extension below separate Event
visibility from immutable Group type. PUBLIC Events permit explicit voluntary enrollment without
Group membership; approved private final-result sharing grants only Event/Table/result reads, never
Group information. Private activities otherwise remain excluded from both feeds. These explicit
exceptions supersede older membership-only activity/detail statements below.

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
- Group creation begins with Group visibility help and two side-by-side HeroUI radio Cards:
  Private/lock on the left and Public/globe on the right, with a secondary selected surface and
  accent border. Name, logo, existing venue/friend selectors and save FAB follow. Visibility remains
  immutable after creation. Each actual draft visibility change clears selected friends and discards
  stale picker returns. Public creation keeps the friend action visible but disabled; this is not a
  change to existing authorized post-creation Group invitations.
- Logo selection uses a horizontal HeroUI Card: contained preview/placeholder at left, Upload/Change
  logo and Remove actions at right, with permanent JPEG/PNG/WebP and 5 MB help below the actions.
  Logo has no field-help popover. Removal clears local selection even for Public drafts, but existing
  mandatory logo/verified-venue validation still blocks submission until valid. Upload cancellation,
  permission checks, failure feedback, owner-scoped assets and existing pickers remain unchanged.
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
- Exclusion cancels affected PLANNING registrations and duties, but never reopens or rewrites a
  CONFIRMED Event. In both PRIVATE and PUBLIC Groups, previously authorized frozen players and
  demonstrators retain narrow read-only access to their own confirmed/terminated Event/Table
  snapshots. PRIVATE visibility requires the server-captured accepted-membership access checkpoint;
  effective PUBLIC visibility requires confirmation no later than the ban checkpoint. A ban cannot
  create access to a later or previously unauthorized snapshot. This exception grants no Group,
  member-roster, Group-ranking or management access. Expiry/revocation alone restores none of those
  capabilities. Reopening explicitly reapplies active bans, cancels affected registrations/queues
  and duties, and recalculates agreement atomically. TERMINATED history/results remain immutable;
  explicit whole-Group deletion above is the only Group-level deletion exception.
- Group game search and member rankings are paginated at source; the ranking selector and rows use
  the same horizontal page insets as other Group destinations on both clients. The searchable game
  selector keeps its list and scrollbar inside the bounded popover, including with a native keyboard.
  Ranking identities use @username first and the current Group role below, with the same avatar
  role badge/explanation as Members. Roles come from the creator or same-Group ACCEPTED membership,
  never historical statistics or an incomplete roster cache; former/pending members receive no role
  badge. Older cached responses without role metadata remain unbadged until refreshed. Only enabled
  physical tables with at least two scoring finishers contribute games, wins, withdrawals and rating statistics.

## Events and Tables

- An event may be standalone or belong to a group. Current creator/admin and accepted Group
  moderators create and manage grouped events. Standalone administration remains creator-only.
  Standalone invitations are friend-only. PRIVATE Event participation requires accepted Group
  membership; approved PUBLIC Events also permit explicit outsider SELF enrollment.
  Successful grouped creation returns to that Group's Events tab; standalone creation returns to
  main Events' Available tab and edits retain their Event detail destination. Creation selects an optional Group
  inline through the platform HeroUI Select, with searchable source-paged Group items and explicit
  No group; no separate Group search screen. Launching from a Group presets and locks that selection;
  existing Event Group identity remains immutable.
- Main Events has Registered / Available top tabs (Italian: Iscritti / Disponibili). Registered includes
  active own registrations (accepted, pending invitation or request) at a nonremoved Table, or an
  actual demonstrator duty. Available includes other accessible Events of accepted Group members/
  creators, plus own admin-only standalone Events. Administration alone is not participation. Public
  non-members and pending Group invitations/requests gain no list access merely by reading a public
  source. Explicit accepted PUBLIC Event enrollment, including queue positions, qualifies Registered
  and personal Tables independently of Group membership. Live exclusions still deny access.
  Demonstration counts even for an admin.
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
- PUBLIC Group Events have exactly one date/time and one verified location. Standalone and
  PRIVATE Group Events may propose up to 20 distinct date/time options and 20 verified locations;
  accepted players vote independently on those option IDs. Different times on the same day are
  distinct choices. Both clients retain combined date/time add rows beneath flexible options until
  the limit. PUBLIC Group Events use a date-only field (tomorrow for a new draft), followed by
  side-by-side start/end time-only controls on that same day, then a combined registration deadline
  on an earlier day and the verified Location. New public drafts have no preset venue. Native
  Android time pickers reject out-of-range selections rather than clamping them.
- Creation/edit has four stages: Event, Dates / Locations, Tables, Review. Public/Private radio
  cards always remain visible; Public is available only in an approved PUBLIC Group. Changing Group
  resets visibility to PRIVATE and never publishes implicitly. Switching to a PUBLIC Group requires
  confirmation before retaining only the first date/location and disabling participant proposals.
  Name and Group share a row beneath the cards. Existing Event Group and visibility are immutable,
  enforced by both clients and API. Standalone Events remain PRIVATE with their sole creator/admin.
- Table editors are independently expandable HeroUI accordion items with stable draft identities,
  a Table icon and name or localized numbered fallback. Add Table follows the last item and opens
  it; invalid Tables open on validation. Expansion survives picker selection/cancellation and Back.
  Ranking and optional game-proposal switches follow the games. Nested game/demonstrator lists use
  distinct semantic surfaces. Review uses textual-month dates in the selected locale; PUBLIC Group
  schedules appear on one date · start · end line. The organizer has no automatic playing seat.
  Nothing is written before final confirmation.
- Native location picking preserves map → name → favorites → address-search order. Address focus
  uses the local measured scroll owner and keyboard geometry; it never hides/removes the map/GPS,
  name, favorites or confirmation from layout, touch or accessibility. Map identity, dimensions,
  camera and entered values remain stable. One-tap result selection retains its keyboard/selection
  behavior without a search-only layout mode. Licensed MapTiler/OSM credits remain visible. Existing
  camera/activity guards, iOS navigation-header accommodation, Android resize behavior,
  four-character/300-ms search, verified addresses, canonical favorites and native Back remain.
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
- Event detail has Details / Participants / Tables top tabs. Details owns schedule/location voting
  and the edit FAB; header lifecycle actions retain existing guards. Tables remain source-paged and
  virtualized. Participants source-page distinct users across nonremoved Tables: ACCEPTED registrations
  include queues, and genuine frozen rosters retain historical attendees. Pending/declined/cancelled
  registrations, administration and demonstration alone never create a participant. A user with any
  seated/frozen Table is not labeled waiting solely because another Table queues them. Public read-only
  detail permission never grants this privileged Event roster endpoint. Rows disclose no email or ballots.
- Current managers use the same platform action sheet for Event participants, with removal only:
  no Group-ban action or shortcut. Remove from event requires explicit API/actor/Event-version-pinned
  confirmation while PLANNING, including after a PUBLIC Group participation cutoff. A manager's own
  voluntary departure remains cutoff-restricted. One Group/Event-locked transaction cancels the
  target's PENDING/ACCEPTED registrations, advances the Event version once and recomputes agreement.
  It does not change Group membership, invent consent or promise a later join after cutoff. Group
  exclusions remain exclusively in their authorized Group context, with creator/peer protections. TERMINATED history remains immutable. Menu/tab visibility never
  triggers Group-member dwell or notification acknowledgments. Negative optimistic intent uses owned
  caches only; later epochs/registrations survive, and uncertain outcomes require verification.
- Web and native use HeroUI Card compositions for lists and parent links. Group, Event and Table
  lists share a normal-flow horizontal composition: a contained 96px picture beside text, with
  compact informational controls on the same HeroUI Card surface. Original colored SVG skies and
  uploaded logos remain intact; no separate accent backplate, image cropping or palette override is
  introduced. Generated artwork retains motion clearance and logos retain aspect ratio.
  Background/detail and small picker artwork remain separate presentations.
  Navigation and informational controls remain independent siblings.
  Details start with one HeroUI background-image Card followed immediately by existing top tabs.
  Original background artwork remains fully opaque, without a whole-image dimming scrim. Full
  multiline titles and their identity icon sit at upper left on a semitransparent stock HeroUI dark
  background band with its matching foreground, without text shadows or a fuzzy gradient. Compact
  controls stay in one bottom-right row inside the Card; only that row scrolls horizontally when
  necessary, never wrapping or shrinking touch targets. Titles and controls remain in natural flow
  so long titles cannot overlap or push controls outside the Card. Native confirmation dialogs use
  normal-flow content with intrinsic height, no inner scroll container or percentage height cap,
  and no swipe-to-move gesture. Portal-level keyboard avoidance and first-error focus remain;
  dialog inputs never scroll an underlying screen or sheet. Actual artwork/bitmap corners are rounded;
  uploaded logos retain their original proportions. Platform-owned `RecordIdentityCard` frames reuse the same
  role/state help as list cards. Table headers and lists expose the same participation, state, Rating,
  date/location and game controls; administration/moderation are Event/Group concepts, not Table badges. Event headers keep independent accepted,
  pending and authorized waiting-list facts; Group headers keep role, visibility and public review.
  Stable-ID artwork, uploaded logos, reduced motion and semantic tokens remain; no dependency is added.
  Event Details retains voting-legend help and its precise overview read control. When opened from
  the main Events list (or an unmarked direct link), its separate Group section links the approved
  Group artwork/name; entry from that same Group omits it. Table identity retains Settings/player-limit
  help, Rating and minimum/maximum counts; its Details tab retains the separate parent Event link for
  personal/direct entry, omitted when opened from that Event. Parent-ID URL hints remain presentation
  context only. Group context, Back, FAB/header actions and route parameters are unchanged.
  Voting help still explains accepted-only voting, pending reserved places and explicit Table consent.
- Group detail labels are Details / Members / Events / Ranking; Table detail starts with Details.
  Existing internal tab keys and all permission/state guards remain unchanged. Group member,
  Event participant and Table participant rows prefer one `@username`; missing handles retain a
  known fallback rather than inventing usernames or fetching another profile. A one-line primary
  subtitle and compact avatar badge summarize real facts; a plus opens every applicable role/status
  without concatenating or wrapping the subtitle. Group labels distinguish accepted membership,
  pending request and pending invitation. Event labels distinguish accepted participation, pending
  invitation, waiting and demonstration from current administration/moderation. Table labels are
  confirmed player, pending invitation, waiting player and demonstrator, never manager authority.
  Primary priority is Table demonstrator/invitation/waiting/confirmed; Event admin/moderator/
  demonstrator/invitation/waiting/accepted; Group admin/moderator/request-or-invitation/accepted.
  Card toolbars remain cumulative. Current Group authority, not historical authorship, supplies
  management metadata; absent metadata never invents authority. Existing cached self identity
  supplies only that actor's missing handle; no new profile request or persisted copy is introduced.
  Event participants source-union accepted/frozen attendance, pending invitations and assigned
  demonstrators before deduplication/paging. Duty and management never imply attendance or a seat.
  Current-manager `review` and ordinary `member` queries have distinct owner-scoped keys. Ordinary
  viewers see only their own pending invitation identities; authority loss revokes privileged RAM/
  encrypted-disk pages without removing unrelated or ordinary authorized data.
- Main Tables and parent Event lists use one platform-owned horizontal HeroUI Table Card. Its
  stable-ID animated DiceBear Planets artwork occupies a contained normal-flow left frame. The right side
  shows Table name/Dices, localized **accepted seats / maximum capacity**, then Group/people (when
  present), a dot divider and Event/calendar. Both contexts retain those parent identities; only the
  existing Back hint changes. Pending reservations and accepted/pending waiting places do not inflate
  the accepted-seat numerator. Confirmed/terminated counts retain their immutable frozen roster.
  A bottom-right informational toolbar uses 16px icons in 28px semantic frames with at least 44px
  touch targets. Every control stays on one row. It may extend across the artwork; only when the
  whole Card is still too narrow does that row scroll horizontally, never wrap, shrink targets or
  clip actions. Demonstrator duty and actual seat/invitation/queue states coexist; pending queues
  retain both invitation and waiting information. Table controls contain no admin/moderator badge.
  Missing position never fabricates an accepted seat; historical SELF requests are not invitations. Status and enabled/disabled Rating always have
  their own icons and explanations. Status help retains minimum/maximum, accepted-registration total,
  pending total (Unconfirmed players / Giocatori non confermati), queue count, assigned demonstrator
  and all joint winner names when terminated, with counter/duty icons. Content-fit native sizing and
  bounded scrolling replace verbose player-limit prose.
  Separate date/time, location and game icons expose read-only local-data popovers. Location rows
  pair a left MapPin icon with only the formatted verified address, not a repeated venue name or
  IANA continent/city zone.
  The authoritative zone remains available for date formatting and is not changed or removed from data.
  Planning shows
  all approved options; confirmed/terminated Tables show only chosen facts, including their own
  frozen start rather than the parent Event's earlier start. Excluded Tables invent no chosen game
  or date. The additive authorized schedule projection includes complete bounded date/venue options
  and the Event zone; shared-results allowlists never inherit planning options or Group authority.
  Older caches without complete options show partial skeletons until normal reconciliation, with
  no per-card detail request, provider lookup, vote, consent or notification acknowledgment.
  These fields reuse API/user-owned canonical Query/MMKV policy and its existing retention/budget;
  there is no screen-local persisted copy. External cards navigate only; invitation decisions remain
  in details. One Table list / Lista Tavoli heading and count legend remain outside the cards.
  Saved/edit/review artwork and draft game previews keep their existing behavior. Event status help
  keeps its planning/confirmation explanation and player counter; separate date/time and location
  popovers show authorized alternatives or selected immutable facts, without extra requests.
  Group/Event/Table titles retain shared typography and leading identity icons. Group list
  invitation/request/admin indicators retain their existing explanatory actions. Accepted members also receive a success check
  with a Group member explanation; pending applicants/invitees and discovery-only viewers never receive
  that member indicator. Compact picker/detail overlays remain unchanged.
  Generated Group Landscape artwork uses the Group ID, never its mutable name. Uploaded logos remain
  untouched; unsaved Table artwork retains its existing local key until a server ID exists.
- Main and Group-context Event lists share the horizontal Card frame: stable-ID Constellation artwork
  sits beside content in normal flow; the right side shows Event name/calendar and Group/people (when present),
  a dot divider and localized `n Table/Tables`. The count is the existing source-authorized `tableCount`,
  not a client scan or a new counting rule. Whole-card navigation, Group Back hints, unread markers,
  failed-draft reopening and uncertain-save verification controls remain unchanged.
  The bottom-right toolbar matches Table controls: 16px glyphs, 28px semantic frames and at least
  44px native/mobile-web touch targets and one horizontally scrollable row when needed. Current administrator or moderator
  management, accepted participation, pending participation and demonstrator duty are independent
  indicators. Complete own registrations can show accepted and pending simultaneously; a priority
  aggregate must not hide another Table's pending work. Accepted here means registration consent or
  an immutable frozen cohort, including accepted queues; its explanation explicitly does not grant
  or infer a seated place. Table cards/detail and Event participant statistics retain their separate
  seated/frozen/queue rules. Declined/cancelled non-frozen records confer no accepted participation.
  Current `managementRole` distinguishes administration/moderation without changing capabilities;
  historical authorship never supplies current authority. Unknown management is not presented as a known role.
  Read-only projections and optimistic drafts show no inferred personal roles. Lists and details
  reuse these same independent consent/queue indicators; unknown positions never invent a seat.
  Accepted Table queues retain their consent indicator separately from the waiting position.
  Status always has its own colored popover
  on saved Cards, retaining its explanation and participant count without extra requests,
  votes, consent or notification acknowledgments. Query/MMKV scope/ownership remains unchanged.
  Table cards in main and Event lists additionally expose one read-only games popover: existing
  canonical approved choices in planning, the existing chosen-game projection after confirmation.
  It reuses game rows with image/name/known year/BGG average/rank, never votes, pending proposals,
  mutations or per-card detail requests. Absent metadata stays absent. Native renders a bounded
  8/6/7 FlatList; web uses eight-row local presentation pages, neither fetching more server data.
- Group lists use the same horizontal frame: complete Landscape/logo at left, Group name/people
  at right, then localized member total/people · authorized Event total/calendar. `memberCount` already
  equals the sole administrator plus accepted memberships, including moderators exactly once; no
  client-side scan or extra admin/moderator increment is allowed. Unavailable Event counts remain
  undisclosed, never invented as zero. Current admin/moderator/member/invitation/request controls
  retain explicit consent and source-complete request attention. Public/Private has its own icon/help;
  only PUBLIC Groups show approval/review status, retaining rejection reasons and the distinction
  between pending changes and an already approved revision. Local drafts do not fabricate server roles.
- Parent Group references in Event detail reuse the actual `GroupCard`; parent Event references in
  personal-entry Table Overview reuse the actual `EventCard`. They consume existing owner-scoped
  detail/cache reads, not per-card network readers. Missing fields keep known identity with partial
  skeletons and explicit retry; authorization loss never retains forbidden metadata. Matching Group/
  Event entry context still omits the redundant parent section; Back, shared-results guards and
  notification ownership remain unchanged. Title/type/count/player-limit explanations remain in
  the corresponding read-only status/visibility help, without adding votes, mutations or reads.
- From the main Events list, creation preloads only the source-filtered first page of creator Groups
  into the same scoped Query cache as the picker. The selector also loads before opening in an
  unlocked wizard, uses compact artwork and a bounded scroll viewport, and paginates/searches at source.
  Opening the native selector dismisses/blurs the active input before displaying options. Locked
  contextual selection starts no other-Group request; errors and explicit no-Group selection remain.
- Editors keep unsaved values locally. Creation/edits happen only on final confirmation. Wizard
  Table previews reuse the horizontal Table-list artwork/body/control composition, not the detail
  background Card. They expose known draft limits, games, Rating and demonstrator information only;
  no navigation, persisted status or attendance is fabricated. Proposal review actions are circular,
  accent, and visually match the vote buttons while retaining native 44px touch envelopes and all
  existing management, verification and pending-action guards. Table edits are partial upserts; explicit `removedTableIds` remove tables. Unloaded pages are never implicitly
  deleted. Versions are pinned; stale drafts require reopening rather than overwriting newer data.
- The creator/admin may delete a PLANNING Event or remove one of its Tables through the far-right
  app-header trash action on both clients, after explicit destructive confirmation. Both DELETE
  bodies contain the current **Event** version. The same Group/Event transaction locks, creator
  authorization, state and version guards as planning edits apply; the participation cutoff does
  not disable authorized Planning management. CONFIRMED/TERMINATED records cannot be deleted directly.
  An unavailable delete/confirm action, or finalization waiting for complete results, itself opens
  its localized reasons, without a separate `?` control or mutation. It retains the available action's
  primary/danger-soft semantic colors and icon at reduced opacity, and stays interactive for help.
  Transient busy/verification and authoritative capability guards remain intact. An available action
  retains its normal version-pinned confirmation flow. A Table removal retains at least one Table, marks the selected Table
  removed, cancels its active registrations and advances the Event version atomically. Deleting
  the Event removes its Tables, registrations, votes and linked inbox history; unrelated records
  and the existing explicit whole-Group cascade remain unchanged. This is product-record deletion,
  not database/collection reset. Confirmation is version-pinned; a newer version requires reopening.
  User confirmation closes/navigates immediately, projects only owned cached rows, and rolls back
  selectively on definite failure. Unknown outcomes cannot be blindly reposted.
- Game pickers exclude games already selected for the current Table. Source-paged picker rows already
  carry catalog metadata (including known durations for collection results), so selection updates
  the local draft and returns immediately without a separate game-detail request. Missing/invalid
  duration uses the automatic BGO 120-minute fallback, never a manual-duration input or invented BGG
  provenance. Valid saved historical durations remain authoritative; final API validation is mandatory.
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
- Accepted members and authenticated outsiders at approved PUBLIC Events can explicitly enroll
  directly; SELF registration is ACCEPTED even when queued, without any Group membership write or
  extra booking-approval workflow. Every voluntary join
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
- All PUBLIC Group Events, including PRIVATE-visibility Events, require an end and exact booking
  cutoff. Their tables have
  fixed starts and catalog-derived duration, with an automatic 120-minute fallback when metadata
  is missing/invalid. No new manual-duration control is exposed; valid historical saved durations
  remain readable and are not recalculated.
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
  After a PUBLIC Group cutoff, SELF enrollment/queue entry and voluntary departure are closed for
  everyone, including managers. Authorized PLANNING management, accepted-player votes and a
  recipient's acceptance/decline of a PENDING invitation remain available. Declining an already
  accepted invitation cannot bypass departure restrictions. Confirmation/reopening remain manual;
  CONFIRMED must reopen before editing and TERMINATED remains immutable.
- Confirmation freezes selected date/location/games and accepted eligible rosters. At least one
  table must agree; others remain present but excluded. Reopening preserves votes, invitations,
  priorities, participation and excluded tables except explicit removals/exclusions; it never
  silently extends the cutoff. TERMINATED events cannot reopen.

### Event access and shared final results

- Missing historical visibility inherits PUBLIC only from PUBLIC Groups; otherwise PRIVATE. No
  migration rewrites historical records. PUBLIC visibility is allowed only in an approved PUBLIC
  Group. Its editor exposes a Public event switch; PRIVATE Events in that Group remain member-only
  and keep all PUBLIC Group scheduling, overlap, cutoff and demonstrator rules. Public-to-private
  edits reject active nonmember enrollments rather than silently cancelling them.
- Public outsiders may read and explicitly self-enroll, but receive no Group membership, management,
  Group-wide ranking or foreign roster-email grant. Pending invitations retain separate acceptance.
  Voluntary Group departure preserves accepted independent PUBLIC Event participation; exclusions,
  blocks and source-deletion guards remain. Only physically frozen players enter confirmed rosters.
- Private grouped Events may opt into `shareResultsWithFriends` only during finalization. Default
  false; no extra participant consent. The flag commits with all final scores/ratings/activities and
  cannot be changed or revoked afterward. PUBLIC and standalone Events cannot request this option.
- Current friends of final frozen Table players, including ND players, may read the finalized Event,
  final Tables and results. Queue-only, pending, demonstrator-only and admin-only users do not extend
  this audience. Followers alone never grant access. Current bilateral blocks, friendship, Group
  exclusions and surviving source existence are rechecked. Friendship/block mutations selectively
  revalidate cached friend-result grants; native retains central canonical-only persistence.
- Shared outsider DTOs use allowlists: no Group ID, name, type, logo, link or Group rating deltas;
  no planning alternatives, ballots, provisional results, registration/queue or private profile data.
  Only the chosen date/venue/game, frozen roster, immutable results and GLOBAL deltas remain. Group,
  participants, seat, proposal and ranking endpoints gain no new authority. Their UI exposes only
  appropriate read-only Details/Tables and Overview/Results destinations.
- Reuse existing per-player played/milestone receipts, not a new Event/admin activity. Both feeds
  authorize private result sources before the visible page/cursor limit, omit their Group identity,
  and never publish private planning/join activity. Existing network epochs remain in force.

### Game sources and player limits

Game selection has independent Collection / Participants' collections chips, never a Search chip.
Neither enabled means local catalog search (four characters); otherwise text filters only the union
of selected published collections. Participant source requires current Table management and includes
all ACCEPTED target-Table registrations, including queue; pending invitations do not qualify. Profile
block/visibility guards still apply. Deduplication and exclusions precede source pagination. Opaque
source epochs/cursors bind actor, current authority, roster and active publications; before/after
checks reject mixed snapshots. Demotion clears only role-owned picker/review data and work. Native
retains its 8/6/7 rendering budget and stable search input. Both clients reveal bounded cached
windows progressively and request further source pages on user scrolling, without a load-more
button. Focus/keyboard/layout changes do not authorize bulk reveal/fetch; duplicate end events,
stale source callbacks, retries and accessible scrolling retain their guards.

Existing bounded BGG metadata hydration supplies verified complete min/max player pairs; no bulk
provider synchronization. Selected games 2–4 and 3–6 permit a 2–6 editor envelope: minimum of known
minima, maximum of known maxima, ignoring missing/invalid pairs. No known pair means no invented
bound; Table minimum remains at least two. Whenever candidate games are added, removed or updated,
both clients immediately clamp only out-of-range unsaved counts into the new envelope and update
the +/- button limits. Counts already within bounds stay unchanged: 3–5 plus a 2–4 game becomes 3–4.
Unknown-only metadata does not reset counts; solo-only choices remain invalid rather than lowering
the Table minimum. No server write or roster change occurs until explicit final submission.
New/edited Table limits obey that envelope. Confirmation
also requires the actual selected game to support the physical roster, never dropping seated players
to fit another game. Historical shapes stay readable.

All top HeroUI tabs use relevant selected-accent Lucide icons; bottom navigation stays unchanged.
Required-field stars follow actual conditional validation. Group name inputs have the localized
Group name placeholder on both clients. Group create/edit reuse the same type Cards; both remain
visible but disabled in edit because type is immutable. Group/Event/Table name fields expose an
explicit dice action using the single supplied EN/IT dictionary source and unique-names-generator;
it changes only the unsaved name in the active locale, never autosaves or regenerates during render.
Table invitations use a normalized handle as primary identity without a secondary line; Group
invitations use real name plus an optional normalized handle, without inventing missing usernames.
Native Group form keyboard avoidance contains only its scrolling form, not the save FAB; its
existing bottom/safe-area anchor stays outside that resizing layer.

Invalid submission validates before writing and reveals the first blocking field in visual order,
including nontext selectors, previous wizard steps and unmounted virtualized rows. Invalidity alone
must not make that submit control unpressable; busy/upload/permission/conflict guards remain.
API/user/source changes and manual navigation cancel stale deferred focus. Local page/list/overlay
owners accommodate the real keyboard/viewport without hiding components or duplicating avoidance.
This does not replace Clerk AuthView or promise an internal-input callback its public SDK lacks.
Native camera logo capture opens the
existing square crop editor; cancellation retains current permission/upload/owner guards.

### Participant option proposals

Standalone and PRIVATE Group Events expose opt-in `allowParticipantDates` / `allowParticipantLocations`, and
Tables expose `allowParticipantGames`. Missing historical flags are off. New submissions require
PLANNING, an enabled category and a current ACCEPTED effective seat: anywhere in the Event for
its date/location, only the target Table for games. Pending reservations, accepted queues and
management/demonstration alone do not qualify. Current Group creators/moderators cannot submit
participant proposals even when seated; they edit/review instead (`PROPOSAL_MANAGER_CANNOT_SUBMIT`).
A demoted historical author is not a current manager. Standalone review/management belongs only
to its creator/admin; no Group moderators or automatic seats are introduced. Either-direction blocks
deny standalone participant reads and actions, including proposals. PUBLIC Group Events cannot enable
these flags, including PRIVATE-visibility Events whose PUBLIC Group scheduling remains fixed.

Authenticated `GET /events/:id/proposals` source-pages `mine` or current-manager-only `review`
scopes by category, with a Table ID required only for games. Private pending/rejected/decision
metadata never enters ordinary Event options, public detail, participant responses or Community.
Own pending date/location duplicates are rejected without exposing another author's submissions.
A participant game picker source-excludes canonical Table games and every game already suggested by
that actor (including rejected history), not other actors' unaccepted suggestions. Current private
planning/seat/category guards also protect these picker reads. Explicit
`POST` submissions carry Event version and request correlation; decisions at
`POST /events/:id/proposals/:proposalId` carry Event/request versions and accept/reject. Manager
review source-groups identical dates/locations by canonical payload and games by game/Table before
paging. Captured pending-set revisions protect collective decisions. One compact review icon opens
choice, explanation and all proposer handles; names are not repeated inside the item. Accept/Reject
commit directly from this dialog without a second prompt. One decision atomically resolves every
pending request for that choice, notifying each proposer; accepted/rejected history is not rewritten. Acceptance revalidates every pending proposer's actual seat. Changed pending sets invalidate
a captured decision, rather than silently including unseen later work. Stable batch receipts support
idempotency and lost-response readback; only current managers can read other authors' batch receipts.
`GET /events/:id/proposals/:proposalId` returns an authorized own/current-manager receipt; bounded
own correlation reads also serialize with writes so lost responses are verified, not replayed.
Group/Event locks serialize submissions, approval, confirmation, role changes and removals.

Approval rechecks current management, proposer membership/seat, target, catalog and configuration,
then reuses the canonical atomic Event edit. Existing IDs/votes remain; no consent, ballot, seat,
result or rating is synthesized. Dates/locations retain their actual 20-option limits; no new game
limit is imposed. A canonical duplicate resolves to its existing option rather than adding another.
Rejection changes only the private request. Disabling a category stops new submissions, not review
of existing pending requests during planning. Outside PLANNING decisions freeze; pending requests
are neither automatically rejected nor confirmation blockers. Removed Tables retain private request
history but cannot receive approvals; Event/Group deletion cascades requests. Notices go to current
managers/the proposer; ordinary configuration notices occur only after canonical approval.

Both clients expose private-only opt-ins in the existing Event/Table editor, and category-local
proposal controls in Event dates/locations and Table games, not another top-level tab. Opening or
cancelling a picker writes nothing. Final date/time confirmation or final game/location selection
explicitly sends one private proposal, without an intermediate editor page. Add rows reuse each
platform's admin date/time, location and game chooser labels/icons. Date/time, location and game
proposal headers are distinct; pending rows omit the Pending label, retain appropriate clock/calendar/
location artwork or the catalog game cover, and keep accepted/rejected and local mutation feedback.
Native dialog generations/owner fences reject cancelled or detached callbacks. Existing failed-draft
recovery and uncertain receipt verification remain explicit; canonical options still require approval.
Managers see the authorized review queue; other participants see only their own proposals. Fixed
five-row source pages bound presentation (five unique choices for manager review), including
inside existing native lists. Picker input identity stays stable through debounced search and cache
updates, while list budgets and stale-callback fences reset without remounting that input. Game artwork
on authorized GET DTOs is enriched only after the authorization transaction, using the existing quota/
negative-cache policy outside transaction locks; failed images retain the semantic game icon. Failed unsent
local drafts remain reviewable; a changed explicit retry gets a fresh correlation rather than replaying
an old write. Current private single/correlated receipt reads verify uncertain outcomes without POST
replay. Existing immutable results, consent, ballots and canonical gameplay statistics remain untouched.

The existing scoped optimistic journal/Event FIFO owns transient intents and selective reconciliation;
only known canonical proposal bases enter central encrypted native MMKV. Verified management loss
clears manager-only pages, observers and review writers even when ordinary membership remains; own
proposals and unrelated/foreign caches survive. Restore alone never enables a review action. Source
failures remain observable, stale confirmations remain cancelable, and no proposal UI reads Group-member
attention. Authenticated web/native runtime acceptance remains incomplete; see
[the implementation checkpoint](implementation-progress.md).

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
  focus, navigation, elapsed visibility and voting never acknowledge Group/Event/Table attention.
  The obsolete presentation high-water store is removed;
  source change metadata, namespaced identities and acknowledgement cutoffs remain unchanged.
  All counts come from complete recipient-scoped aggregates, not loaded inbox pages.
- Pending business decisions are separate from unread state. A recipient's actionable invitation
  keeps its reply indicator until response. Actionable pending invitations stay visible in the
  Alert and unread: informational Alert reads and generic mark-read/mark-all skip them; an outgoing Group request retains
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
  dots are passive and independent of pending request-review glyphs; no timer, observer, app-state or
  focus transition reads them. Inbox/push links open Members. Source-proven historical actor
  membership may identify an accepted member only when current membership and timing agree; otherwise
  historical notices stay generic. Pending membership, discovery and moderation alone never grant
  member-point access. Departed/excluded members retarget to existing Group Overview, not missing rows;
  canonical item identity wins over stale historical section metadata.
- Each selected Group/Event/Table tab shows one platform HeroUI warning Alert immediately below its
  top tabs. It lists bounded, source-paged actual changes and pending invitations, with a suitable
  indicator and a static danger dot after its shrinkable title. Its top-right compact icon-only warning
  action is the sole informational read action in the entity: item dots remain, but item/vote
  controls have no read buttons. Pending invitations are displayed but excluded from this action;
  their accept/decline controls keep their existing consent/capability/version guards. Table
  participation changes and invitations belong only to Participants, never Details. Child Table
  changes do not become parent Event/Group changes.
- A card or notification link navigates without reading resource/item attention. Container entry,
  rendering, focus, scrolling and visibility duration read nothing. Inbox/push links locate the
  correct tab/first unread point; removed options lead to their existing section. The Alert works
  for planning and authorized read-only sections without requiring an impossible vote.
- A successful YES/IF_NEEDED/NO vote never acknowledges notification information, in the API or
  optimistic client projection. The explicit Alert read captures only its displayed informational
  references, exact revisions/effective change times and cutoff. Unshown pages, later arrivals,
  retargeted revisions and unrelated items/tabs/entities survive. Multi-point union effects are
  reconciled once, never summed in a way that double-subtracts bell counts. Brief descriptions use
  persisted kinds/canonical points and current authorized labels; missing historical before/after
  values or deleted names are not reconstructed from translated prose. Successful invitation decisions
  acknowledge that resource's invitation through the captured cutoff without inventing consent.
  Known source read effects update active and inactive navigation/card/bell caches before transport;
  a known decision ACK commits them without waiting for canonical detail refresh. Failures roll back
  only their own effects; unknown outcomes require verification. Later notices and retargeted
  revisions survive old reads. Container entry waits for its scope metadata, never cancelling
  unread-member discovery through an older cached parent count.
- One notice affecting multiple points stays unread until all its points are acknowledged. Reading
  an entity's last point immediately clears its related container/navigation dot, even if another
  affected entity still has unread points. Unrelated points and the bell's single unread notice remain.
  Explicit informational Mark as read/Mark all as read skip actionable pending invitations and never
  vote, accept invitations or change domain state. Existing explicit confirmed deletion keeps its
  separate policy; pending invitation and missing-vote states remain independently visible.
- Contacts retains Connections / Requests / Search. Entering main Contacts reads nothing in bulk;
  explicit inner selection reads only that subsection. Follows and accepted friendship notices
  belong to Connections; incoming friend requests belong to Requests. Contact rows aggregate their
  actor's unread social notices. Contact top tabs additionally reflect source-backed unread markers
  on their loaded rows, including Search results/suggestions and actors present in multiple lists.
  This display fallback does not change subsection read targets or consume another kind of notice.
  Repeated existing follows emit no duplicate notice.
- Counter batches contain at most 50 unique resource targets. Cache-only navigation observers reuse
  the bell watcher: no per-card notification polling or inbox scans. No notification visibility or
  dwell timers remain. Cutoff boundary timers expire only cutoff-bound
  enrollment/departure affordances, never pending invitation responses or Planning management. Owned optimistic reads/deletions coordinate actual owner cards/tabs and bell,
  preserve disjoint writes and roll back selectively. Unknown write
  outcomes require source verification, never automatic write retries; session changes cancel old
  work. Read failures remain observable without user-action toasts. The Alert query reuses the bell
  watcher rather than polling each mounted Alert.

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
- Table detail separates existing seats/waiting UI into Participants. Planning has Details /
  Participants; confirmed and terminated add one Results / Risultati tab, not a separate Ranking.
  The same roster reader stays mounted across Details/Participants; hidden UI never advances paging.
  Exact invitation-attention links start on Participants without accepting or reading invitations.
  Shared final access exposes Details/Results only, with no private roster or GROUP ranking scope.
  Results rows contain avatar, one @username/known fallback and adjacent, nonwrapping ranking icons:
  GLOBAL uses a Globe/accent glyph; authorized GROUP uses UsersRound/success and is absent for
  personal/shared-final access. Each opens only its own scope's complete details. Confirmed rows
  expose current ratings without inventing final standings or scores. Terminated rows preserve immutable classified
  order, shared ties, bottom-right #n avatar badges, unranked ND and exact far-right scores. Popups
  use recorded before/after/delta, semantic direction icons and scope labels, never live replacement.
  Disabled/all-ND/fewer-than-two-finisher outcomes say Ranking not updated; genuinely missing history
  says Historical ranking unavailable. Current authenticated source paging uses genuine frozen-player
  snapshots/statistics; pending players and management-only actors never gain seats. Cache identity
  includes API/user/Event/Table/game and the canonical frozen roster; changed-game/roster responses
  cannot populate another snapshot and retry invalidates only owned Table metadata. Existing cache-
  first navigation, native 8/6/7 rendering, progressive web pages and owner/stale-callback guards remain.
- Planning Table deletion uses the trash action itself for unavailable-action explanations, including
  last-Table, unverified metadata, busy and uncertain-save blockers, without triggering a write.
  The action is absent after confirmation/termination. The last active Table cannot be deleted
  independently; whole-Event deletion retains its separate explicit confirmation and cascade scope.
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
