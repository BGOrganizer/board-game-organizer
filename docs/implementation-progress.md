# Unified Groups / Events / Tables implementation checkpoint

## Optimistic notification deletion

- Single deletion remains immediate after confirmation. Both clients add a destructive trash action
  at the far right of the application header for confirmed whole-inbox deletion. Confirmation closes
  before HTTP settles; all owned cached pages, pagination cursors, locale variants and bell counts
  clear together. Empty inboxes and conflicting writes disable the action without blocking unrelated
  single-row operations. Confirmation cannot transfer between accounts or sessions.
- Authenticated DELETE `/api/notifications` removes the recipient's complete inbox in a MongoDB
  transaction, including unloaded pages; other recipients' actor history and push subscriptions remain.
  Malformed single-row IDs cannot fall through to the bulk endpoint. Failed writes restore owned
  projections; unknown responses use authorized readback without retrying DELETE. Late old-session
  responses cannot restore or invalidate same-actor replacement caches; post-deletion arrivals survive.
- Local Node 26/pnpm 11.25 evidence: 2,150 unit tests with coverage (web 654, mobile 262, API 742,
  schemas 114, shared 378), notification projection at 100%; 90 real replica-set integration tests;
  typecheck 4/4; Biome across 859 tracked/new source files; API/web production builds and Android
  export (5,591 modules). Final Android export passed a same-command retry after a Windows CLI exit
  `3221225477`; the failed run is retained as evidence, not counted as success. EN/IT add only five
  messages per catalog; prior translations are unchanged. Generated references and seven protected
  hashes remain unchanged. No dependencies, migrations, provider configuration or E2E policy changes.
  Native callback/source checks and export are not physical-device or authenticated Playwright/Maestro
  acceptance; existing intentional suites/jobs remain unchanged.
- Guides used: `bgo-component-architecture`, `vercel-react-best-practices`,
  `vercel-react-native-skills`, `tanstack-query-development`, `expo-overview`, `expo-router`,
  `expo-data-fetching`, `heroui-react`, `heroui-native`, `uniwind`, `lingui-best-practices`,
  `web-design-guidelines`, `context-mode`, `ponytail`.

## Compact creation picker and contextual parent navigation

- Main Events preloads only the creator-filtered first Group page into the same API/actor-scoped
  Query cache used by creation. Unlocked selectors load before opening, with compact 40px artwork,
  bounded option viewports and on-demand search/pages. Native opening dismisses/blurs the currently
  focused input before opening the Select; contextual locked selection starts no other-Group read.
- Primary seats and waiting entries have separate headings/help. Waiting appears only once capacity
  is exhausted; anonymous/unloaded primary reservations precede queued people across render pages.
  Native keeps a single SectionList and preserves empty/loading/error/retry states. Canonical
  positions, priority, consent and counts are unchanged; local intent never receives a queue place.
- Event/Table cards carry explicit scalar matching parent-ID URL hints, not global navigation state
  or authorization. Table entry from its Event omits the redundant Event item; Event entry from its
  Group omits the redundant Group item. Main/unmarked direct entry retains parent navigation. Group
  origin survives Event edits. Group links now have their own section below Details, approved cached
  artwork on the left and name on the right; missing images load independently of known names and
  read failures remain observable without discarding usable cached content.
- Local Node 26/pnpm 11.25 evidence: 2,112 unit tests with coverage (web 633, mobile 253, shared 377,
  API 735, schemas 114), existing gates and deterministic roster/section logic at 100%; typecheck 4/4,
  scoped Biome, API/web production builds and Android export (5,591 modules). EN/IT source/compiled
  catalogs include waiting help and the requested Italian heading. Generated Next references and
  seven protected hashes are unchanged. No API writers, dependencies, migrations, provider changes
  or E2E policy changes. Native callback/source tests and export are not rendered keyboard/portal/
  touch or authenticated Playwright/Maestro acceptance; existing intentional suites/jobs remain.
- Guides used: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `tanstack-query-development`,
  `expo-overview`, `expo-router`, `heroui-react`, `heroui-native`, `uniwind`,
  `lingui-best-practices`, `web-design-guidelines`, `context-mode`, `ponytail`.

## Immediate Table reinvitation after admin removal

- Both confirmation callbacks retain only the already-visible recipient identity in owned MutationCache
  variables, never in request bodies or canonical candidate pages. Shared pickers immediately expose
  this presentation-only release intent, including cold searches. Newer invitation intent suppresses
  it; definite removal failure rolls it back. Actor/API/Table/session boundaries remain intact.
- Reinvitation selected before removal finishes stays immediate in the UI but waits in the existing
  Event FIFO. Dispatch requires the exact successful cancellation receipt (registration/version,
  Event/Table/person and status); rejection, unknown outcomes and unverified receipts cannot send a
  dependent POST. No automatic write retry, consent, seat, priority or capability is invented.
- Authorized candidate pages include the Event epoch. Complete matching post-receipt exclusions retire
  old release hints across searches; pre-ACK/partial pages do not. Canonical identity/conflict reasons,
  source paging, Group email privacy and atomic POST eligibility checks remain authoritative.
- Local Node 26/pnpm 11.25 evidence: 2,082 unit tests (web 614, mobile 245, shared 374, API 735,
  schemas 114); unchanged coverage gates and 100% for the new deterministic selector; typecheck 4/4,
  tracked-source Biome checks, API/web production builds and Android export (5,589 modules). Docker is available for
  this checkpoint: all 88 real replica-set integration tests pass, including removal/reinvitation and
  candidate/receipt epochs. Held-HTTP tests and executed native callbacks are not rendered native or
  authenticated Playwright/Maestro acceptance; existing E2E suites/jobs remain unchanged. Seven protected
  hashes and generated Next references are restored byte-for-byte. No dependencies, migrations,
  provider configuration or localization changes. Full local `pnpm lint` encounters the pre-existing
  untracked `apps/mobile/services/google-services.json` formatting issue; that private file is untouched.
  Tracked app/shared/schema sources plus all new owned files pass Biome.
- Guides used: `bgo-component-architecture`, `tanstack-query-development`,
  `vercel-react-best-practices`, `expo-overview`, `expo-data-fetching`, `context-mode`, `ponytail`.

## Stable self identity and contact rediscovery

- Started only after the preceding signed commit `272cc40` passed Branch CI `41198613019`
  and PR CI `41198617110`, including APKs, cleanup and publication. Existing intentional E2E skips
  remain unchanged; those green jobs are not physical-device/authenticated E2E acceptance.
- Own enrollment intent and the receipt-to-roster gap reuse the canonical API/actor-scoped cached
  profile without starting another profile request or inventing participation/positions. Known roster
  identity wins; foreign profiles are ignored. Missing self metadata uses the existing localized
  You label, never the Clerk ID. Late profile hydration updates the same visible row on both clients.
- Relationship settlement refreshes only owned active search/suggestion queries, even when the action
  came from a different hook or a retained tab. Ordinary loaded relationship lists remain optimistic
  and stale until navigation. A former connection appears in device suggestions only after a real
  authorized eligibility read; failures remain observable and never invent address-book membership.
- Local evidence: 2,051 unit tests (web 599, mobile 243, shared 360, API 735, schemas 114), existing
  coverage gates including 100% roster/intent logic; typecheck 4/4, scoped Biome, API/web production
  builds and Android export (5,588 modules). Held-HTTP tests cover raw enrollment receipts, known/cold/
  foreign profiles, late identity hydration, cross-instance discovery refresh and read failures.
  No new strings/dependencies/API writes/provider changes. Seven protected hashes and generated Next
  references remain unchanged. Local Docker remains stopped; no new local integration acceptance is
  claimed. Rendered native acceptance remains pending.
- Guides used: `tanstack-query-development`, `vercel-react-best-practices`,
  `vercel-react-native-skills`, `expo-overview`, `expo-data-fetching`, `heroui-react`,
  `heroui-native`, `lingui-best-practices`, `context-mode`, `ponytail`.

## Picker handoff and confirmed admin deletion

- Group/Table invitation pickers hide owned pending intent on their first render, including cold
  searches. Positive receipts remove acknowledged invitees from cached candidate pages before
  pending intent retires; definite failures restore only their own eligibility. Actor/API and target
  isolation remain intact. Game pickers exclude current-Table selections and return directly with
  supplied metadata; collection results now include already-known catalog durations. Missing duration
  still requires explicit manual input. No extra provider lookup or dependency was added.
- Both clients place creator-only Event/Table trash actions at the far-right app header. Confirmation
  pins the Event version; changed authority/version closes the dialog instead of rebasing consent.
  Planning/cutoff and last-Table safeguards remain enforced by the transactional API. Confirming
  closes/navigates immediately, hides only affected cached rows and rolls back selectively, retaining
  a later unrelated Event's pending deletion. Unknown outcomes display verification, never automatic
  reposting; another Table's success cannot erase their verification state. Late same-actor/session
  receipts cannot invalidate replacement caches. Whole-Group deletion reuses the same record cascade.
- Local Node 26/pnpm 11.25 evidence: 2,043 unit tests (web 593, mobile 243, shared 358, API 735,
  schemas 114), unchanged coverage gates and 100% for the new deterministic deletion helper;
  typecheck 4/4, scoped Biome, API/web production builds and Android export (5,588 modules).
  EN/IT source/compiled catalogs are synchronized. Seven protected local hashes and generated Next
  references remain unchanged. New replica-set deletion/rollback coverage is committed, but local
  integration startup is blocked by the stopped Docker Desktop daemon: three suite failures and
  88 skipped tests, not integration success. Hosted CI evidence is recorded separately at delivery.
  Physical-device/authenticated Playwright/Maestro acceptance remains unperformed; existing E2E
  suites/jobs and provider/database configuration are unchanged.
- Guides used: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `tanstack-query-development`,
  `expo-overview`, `expo-router`, `expo-data-fetching`, `heroui-react`, `heroui-native`, `uniwind`,
  `lingui-best-practices`, `web-design-guidelines`, `context-mode`, `ponytail`.

## Immediate client intent, existing layouts

- Explicit valid social, Group/Event/Table, ballot, invitation, registration, favorite, inbox and BGG
  actions stage local intent/feedback before HTTP completes. Existing dialogs/editors close or return
  immediately; local choices and unrelated targets remain usable. No stylesheet, layout or design-system
  redesign. Issued invite links, provider identities, assets and OS permissions still require real proof.
- The shared journal uses operation-specific signals, ordered projection and selective rollback. Real
  SDK FIFO/dynamic per-Group queues preserve independent intent and committed state through rejection,
  metadata recovery and owner/API changes. Readback never automatically retries an uncertain write.
- Event/Group creation-only UUID correlation supports permissionless local previews outside API pages,
  receipt deduplication and explicit failed-draft recovery, not idempotency or client resource identity.
  Registration response epochs are captured in the same transaction and are not persisted on rows.
- A newer canonical epoch fences uncertain versioned requests without declaring success/rejection or
  replaying structural Table creation/removal. Reopened editors use canonical data; already-open drafts
  stay pinned. Whole-Event result submission retains exact scores and requires each frozen Table to be
  explicitly reviewed again after an Event version change. No predicted immutable results/deltas.
- Group deletion/fresh parent denial cancels dependent creations and local previews without locking
  unrelated Groups or cancelling the deletion's own reconciliation. Fresh creator access is checked
  before grouped creation dispatch. A write denial alone never proves parent revocation. Acknowledged
  off-page invitations hand over to source paging without disappearance or stale-receipt resurrection.
- Local evidence: 2,008 unit tests (web 571, mobile 243, shared 354, API 726, schemas 114), unchanged
  coverage gates including deterministic 100% thresholds; 87 real replica-set integration tests and
  95 policy tests. Typecheck, scoped Biome, API/web builds and Android export are checked before
  publication. EN/IT source and compiled catalogs updated. Protected local files and generated Next
  references remain byte-identical. No dependencies, provider configuration, migration or E2E policy
  changes. External-provider mocks, SDK/HTTP tests and export are not physical-device/authenticated
  Playwright/Maestro acceptance; those acceptance gaps remain explicit.
- This section supersedes older client-creation/shared-inbox-lock limitations below; the linked
  [reconciliation contract](groups-events-refactor.md#optimistic-writes-and-reconciliation) describes
  current behavior. Existing native map, score-sheet and release safeguards are unchanged.

## Invitation refresh regression and shared cache freshness

- Reproduced a regression after the optimistic-state refactor: a successful invitation starts roster
  refreshes while its required Event metadata read continues; completing that read cancelled the
  roster refresh again. The same deferred-receipt path affected Group memberships. Acknowledgement
  now cancels pre-receipt reads once, preserving post-receipt roster, membership and Table-list reads.
- Local projections and partial/manual publishers no longer make old snapshots freshly fetched or
  clear invalidation, including unchanged unrelated views. Query cancellation also preserves a stale
  flag set after its fetch-start snapshot. Table details inherit invalidated list age and seed from
  the authoritative base, so reopening cannot freeze either a stale invitation or another pending
  operation's overlay into the detail cache.
- Also reproduced missing remote refreshes: the first notification after an empty inbox was ignored,
  only the latest notification kind was inspected, and active domain queries were merely marked
  stale. The existing notification poll now refreshes related active owned queries, leaves inactive
  ones stale, handles batches/page gaps without scanning the inbox, and retains a monotonic
  createdAt/ID watermark across local read/delete changes. API/actor changes establish a new baseline.
  No list polling, write retry, permission prediction or new server-state store was added.
- Regression tests use the real QueryClient/hooks with controlled HTTP responses. They cover invitation
  creation/removal, roster and card counts in both response orders, Group pending members, invalidated
  Table seeds, rollback of newly opened details, first/batched notifications, owner changes and
  unrelated/inactive cache isolation. Existing Contacts, favorites, BGG, result/consent, rollback,
  privacy and concurrency tests still pass.
- Local evidence: 1,897 unit tests pass with unchanged coverage gates (shared 310, web 511, mobile 243,
  API 722, schemas 111); deterministic journal helpers retain 100% coverage. Replica-set integration
  passes 86/86; retained domain/native policy checks pass 52/52. Typecheck 4/4, scoped Biome, API/web
  production builds and Android export pass. Generated Next references and all seven protected local
  files remain byte-for-byte unchanged. No database/provider/configuration/dependency or E2E-policy
  changes. Rendered-device and authenticated Playwright/Maestro acceptance remain unperformed; these
  local SDK/HTTP checks are not a substitute for them.
- Guides used: `tanstack-query-development`, `vercel-react-best-practices`, `expo-overview`,
  `expo-data-fetching`, `context-mode`, `ponytail`.

## Operation-scoped optimistic writes and targeted busy states

- One transient QueryClient journal owns each multi-cache optimistic operation. Its rejection removes
  only its projections; independent commits/pending operations and newer server versions survive.
  Ordinary manual publishers use the same authoritative-base helper. Session changes abort old
  operations before clearing private caches; mutation identity is scoped by API and stable actor.
- Contacts and Group social rows now share one operation per target; favorites lock selected/known
  canonical identities and deduplicate independently acknowledged aliases. Group/Event actions lock
  their own resource, not unrelated screens. Notification writes retain their shared-counter lock;
  account link/sync/unlink retain the BGG account lock. Navigation/scroll are not globally inert.
- Safe cached changes can announce optimistically. Flags alone do not announce successful seating,
  confirmation or finalization. Real registration receipts reconcile consent/votes and nested versions
  without guessing a seat or granting capabilities. Ordinary refetches do not extend mutation pending
  state or roll back a committed write. Required version/permission reads retain only their resource
  lock; confirmed forms may close while that verification continues.
- Uncertain transport/408/5xx outcomes read back materialized owned caches without retrying the write.
  Cancelled SDK fetches resolving cached projections do not count as GET receipts. Partial read
  failures cannot cause a retry storm. Fresh Group read denial purges dependent private Event/Table/
  people/ranking data and cancels their in-flight writers, preventing late ACK resurrection while
  preserving unrelated actors, APIs and authorized public basics.
- Contact snapshot replacement now acquires the mirrored actor lock and replaces every link in one
  Mongo transaction, including empty snapshots. Inbox mark-all-read is transactional. Replica-set
  tests verify rollback after an actual post-delete insert failure, actor-lock rollback, concurrent
  empty-snapshot replacement without a union, bulk-read rollback and owner isolation. No production
  index, database reset, backfill or provider mutation was performed.
- Limits remain explicit in [the domain contract](groups-events-refactor.md#optimistic-writes-and-reconciliation):
  readback is not durable idempotency or proof against a still-running remote commit. Non-idempotent
  creations remain non-optimistic without automatic retries; unverified-outcome copy asks the user
  to check current state before resubmission. BGG keeps staged publication rather than a long-running
  transaction spanning provider calls.
- Local evidence: typecheck 4/4; coverage runs pass shared 303, web 497, mobile 243, API 722 and
  schemas 111 tests (1,876 total), with existing thresholds retained and 100% gates for new deterministic
  helpers. Replica-set integration passes 86/86 and retained CI policy checks pass 95/95. EN/IT source
  and compiled catalogs are synchronized. API/web production builds and Android export pass; generated
  Next reference files were restored byte-for-byte. CI status is recorded at delivery; none of these
  checks establishes rendered-device or authenticated E2E acceptance. Existing
  Playwright/Maestro suites and their operator-selected CI policy are unchanged.
- Guides used: `tanstack-query-development`, `bgo-component-architecture`,
  `vercel-composition-patterns`, `vercel-react-best-practices`, `vercel-react-native-skills`,
  `expo-overview`, `expo-data-fetching`, `heroui-react`, `heroui-native`, `lingui-best-practices`,
  `web-design-guidelines`, `context-mode`, `ponytail`. No dependencies or vendor skills were changed.

## Score sheet — 80% focus expansion

- Operator confirmed the full-height focus-driven expansion works on device, but requested 80%.
  Focus now snaps to `80%`; the provided 80% detent and `extend` keyboard behavior prevent a later
  keyboard event from forcing the sheet back to 100%. Natural content measurement, safe-area
  bounds, native focus/blur handlers, ND and exact decimal drafts remain unchanged.
- Callback, installed-SDK position and CI policy tests cover the 80% target and keyboard behavior
  on both platforms. Mobile 243, shared 226 and CI policy 95 checks pass, alongside typecheck 4/4,
  scoped Biome and Android export. Physical acceptance of the reduced 80% height remains pending.
- Guides: `expo-overview`, `vercel-react-native-skills`, `heroui-native`, `uniwind`.

## Previous full-height focus expansion — operator confirmed

- A device report disproved the earlier offset-only strategy below. In installed Gorhom 5.2.14,
  Android + `adjustResize` bypasses `interactive` positioning and waits for container resize;
  setting that prop did not guarantee that the score input moved above the keyboard.
- Native score focus now registers its target through HeroUI's aware handler, then calls the public
  `useBottomSheet().snapToPosition("100%")` method immediately. `fillParent` keeps subsequent keyboard
  events consistent with expansion; `restore` handles keyboard dismissal and the added top safe-area
  inset bounds expansion. The compact sheet still uses measured content initially, with no fixed detents, keyboard listeners,
  extra avoidance layer, library patch or dependency/global Android setting changes.
- Callback tests require explicit expansion after keyboard-target registration and preserve ND,
  exact decimal drafts and close/reopen behavior. Regression tests execute the installed SDK's
  position evaluator: old Android interactive/resize stays at its compact position; fill-parent
  expands and restores on both platforms. These are logical SDK tests, not rendered-device proof.
- Local checks pass: mobile 241 and shared 226 unit tests with unchanged coverage gates, 95 CI policy
  tests, typecheck 4/4, scoped Biome and Android export. Web score/result smoke tests pass 11/11;
  web rendering, translations and server result semantics are unchanged.
- The operator subsequently confirmed the full-height behavior works on device. No Android device
  is connected locally; exports and CI alone remain insufficient proof of rendered positioning.
- Guides applied: `expo-overview`, `vercel-react-native-skills`, `heroui-native`, `uniwind`;
  installed Gorhom 5.2.14 source/types and public methods/hooks documentation remain authoritative.

## Superseded offset-only strategy — score sheet placeholder and keyboard configuration

- Both score inputs now show the EN/IT "Enter a score" placeholder without replacing their labels.
  Native score entry uses Gorhom `interactive` keyboard positioning, `restore` on blur and
  `adjustResize` matching the existing Android Activity. Bottom-sheet-aware focus/blur handlers,
  automatic content sizing, exact signed decimals, ND and local drafts remain intact. No manual
  keyboard listeners, second avoidance wrapper, global configuration or dependency changes.
- Checks pass: mobile 238, web 487 and shared 226 unit tests with unchanged coverage gates;
  typecheck 4/4, scoped Biome, EN/IT compilation, web production build and Android export. Native
  tests execute actual input/sheet callbacks and draft preservation, not keyboard geometry on a
  rendered device. Device/keyboard and authenticated E2E acceptance remain pending; retained
  Playwright/Maestro suites/jobs are unchanged.
- Guides applied: `expo-overview`, `vercel-react-native-skills`, `heroui-native`, `uniwind`,
  `vercel-react-best-practices`, `heroui-react`, `lingui-best-practices`, `web-design-guidelines`.

## Invitation acceptance — explicit preferences before consent

- Web/native Table invitation Accept now opens the existing availability sheet without accepting
  immediately. PRIVATE invitations require complete current date/location/game choices with a positive
  option in every category, including when the player already accepted another Table. PUBLIC
  invitation sheets show only games; standalone fixed schedules remain read-only. Cancellation
  changes no remote state; decline remains direct and versioned.
- The strict accept DTO carries registration version plus current Event version, game votes and
  PRIVATE availability. Shared participation validation serves joins and acceptance. Acceptance,
  preferences, Event version and notifications commit together, preserving invitation ID/priority;
  stale/invalid choices fail closed. Real replica-set tests inject a voter-storage failure after
  the registration update and verify rollback of participation, preferences, Event and notifications.
- Both clients reuse the shared form and platform sheet. Pending requests keep the sheet mounted and
  dismissal disabled; errors retain choices for retry. Acknowledgments reconcile owned caches with
  existing newer-version safeguards. Missing/foreign/closed invitations cannot submit.
- Checks pass: 1,777 unit tests (schemas 111, shared 226, API 720, web 485, native pure/source 235),
  Mongo integration 83/83, typecheck 4/4, scoped Biome, EN/IT compilation, API/web production builds
  and Android export. Existing 100% gates for participation logic and web sheet remain unchanged
  and pass. Native callback checks and exports are not rendered-device acceptance; authenticated
  Playwright/Maestro acceptance remains unperformed and retained E2E suites/jobs are unchanged.
- Applied project guides: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`,
  `expo-data-fetching`, `tanstack-query-development`, `heroui-react`, `heroui-native`, `uniwind`,
  `lingui-best-practices`, `web-design-guidelines`. No dependency or skill updates.

## Native location search — focus-only visibility, no map resizing

- Operator feedback supersedes the compact-map design below. Normal order is restored to map,
  name, favorites, then address input. Search focus immediately hides map/GPS, name, favorites and
  the confirmation action; search/results use the freed viewport. Selection restores all controls
  and dismisses the keyboard without resetting nickname/favorite draft data on focus.
- The native map remains mounted in a non-collapsable, fixed 240-point/full-width container. Hidden
  mode changes opacity and flow placement only, with touch/accessibility disabled; it never sets
  display:none or changes map bounds. Existing camera/style/readiness/activity guards remain.
  Other controls use visibility containers; their controlled values remain untouched.
- Input stays in the same React tree position. Post-layout scrolling brings it to the top without
  delays/guessed offsets. Blur does not restore layout before an entry press; keyboard hide restores
  normal mode and keyboard reopen respects native input focus. Both platform event lifecycles clean up.
- MapTiler/OSM credits remain in a small independent search-mode footer for licensing, with EN/IT
  copyright text and accessible links. No new dependency, provider/API change or web UI change.
- Local checks pass: 1,753 unit tests (schemas 110, shared 226, API 710, web 476, native pure/source
  231), Mongo integration 82/82, typecheck 4/4, scoped Biome, EN/IT compilation, API/web production
  builds and Android export. Callback/source checks are not native map/keyboard/device acceptance;
  visual device validation remains pending.

## Superseded compact design — native location search

- Native picker now keeps its existing HeroUI search input outside one flexible FlatList, so it
  stays immediately below navigation when the keyboard opens. With search focus + keyboard visibility,
  the same MapLibre map shrinks 240→120 points and name/favorite controls hide without losing values.
  Results remain scrollable with the keyboard open, use accessible 48-point minimum rows and retain
  one-tap selection. Selection dismisses the keyboard and restores the normal form/map.
- iOS keyboard avoidance uses Expo Router's installed header-height context, without stacking automatic
  keyboard insets. Android keeps its existing `adjustResize` behavior; no app-wide configuration,
  dependency or animation changes. Keyboard show/hide listeners clean up, native visibility is read
  with its required method binding, and hide/focus/selection reset only result-list scroll position.
- Map instance, style, frozen initial viewport, loading/activity/camera guards, verified points,
  MapTiler/OSM attribution and GPS action stay intact. Native clipping is disabled for the map header,
  not map rendering; no conditional map recreation or zoom-on-focus. Favorites UI moved into its own
  platform feature component with the same source paging, permissions, retry paths and selected key.
  SearchInput forwards optional native focus/blur handlers; other callers remain unchanged.
- No new localization IDs, API behavior, provider changes or web changes. Three/four visible results
  depends on viewport, keyboard and accessibility font size; no fixed row-height or visibility marker.
  Local coverage passes 1,753 unit tests (schemas 110, shared 226, API 710, web 476, native
  pure/source 231), Mongo integration 82/82, root typecheck 4/4, scoped Biome, API/web production
  builds and Android export. All existing coverage gates remain. Unit/source callback checks are
  not native keyboard/gesture/device acceptance; visual viewport and touch verification remain pending.

## Startup — locale-correct inbox readiness and progressive background reads

- Fixed native `/notifications` splash readiness to use the canonical notification key, including
  active EN/IT locale and 20-item inbox size. Bell, retired locale-free, other-user/API and other-locale
  entries cannot satisfy that gate. Existing total five-second native/animated splash budget remains.
- Shared Query orchestration gives Tables/Groups/Events/Profile three priority workers. Mobile can
  release splash once those four settle, without waiting for social/permissions/background work.
  After release, one worker progressively warms favorites, BGG account/linked collection picker,
  bell/inbox, all six social lists and suggestions. It also warms at most two linked Event details/
  Table pages and two listed Groups' members/Events only when the response grants those capabilities.
- Existing Query factories are shared with actual screens, including favorite, BGG and Group-member
  reads; fresh tokens, existing cursor shapes and cancellation remain. No provider sync mutation,
  invented search, bulk catalog download, eager cursor walk, extra polling or cache mirror is added.
  Search-dependent/context-only reads and subsequent pages remain on demand. Native permission and
  complete-before-sync address-book behavior stay app-owned. No localization strings change.
- Web uses the same plan without a splash. Started warmup survives route changes; its five-second
  fallback starts background work even if a priority request hangs. Auth/session changes clear
  private cache, abort cancellable reads and stop queued work. Locale changes select distinct inboxes.
  Notification first pages become stale after 30 seconds, matching existing polling, so a prewarmed
  inbox revalidates on later navigation without hiding cached content or adding a polling loop.
- Local validation passes 1,745 unit tests (schemas 110, shared 226, API 710, web 476, native
  pure/source 223), Mongo integration 82/82, root typecheck 4/4, scoped Biome, API/web production
  builds and Android export. The new shared scheduler meets 100% line/function/branch/statement
  thresholds; all existing coverage gates remain. Native effect/VM checks are not device or E2E
  acceptance. Dependencies, workflows and private files are unchanged.

## Table invitations — disabled conflicting candidates with contextual help

- The operator confirmed the reported target was a non-playing demonstrator on an overlapping Table;
  the existing transaction guard was correct. Candidate responses now reuse that same PUBLIC timing
  policy and expose only nullable `invitationBlockReason`, without hiding unavailable identities or
  changing source paging/cursors. Existing same-Table exclusions, friend/member/ban guards and
  Group email/presence privacy remain. Non-public candidates stay unaffected; no data migration.
- Web/native keep unavailable candidates visible, disable selection/invitation and provide a separate
  accessible question-mark popover explaining registrations, pending invitations and demonstrator
  duties. Help stays interactive beside the disabled action. Existing platform HelpPopover controls
  and EN/IT catalogs are reused. Native identity presses cannot bypass the disabled invitation.
  Query owns this advisory state; transaction validation remains authoritative for stale-data races.
- Local coverage passes 1,734 tests (schemas 110, shared 222, API 710, web 472, native pure/source 220).
  Existing deterministic 100% gates, Mongo integration 82/82, root typecheck 4/4, scoped Biome,
  API/web production builds and Android export pass. Tests cover visible disabled/help behavior,
  eligible selection, concurrent 409 reconciliation, demonstrator-only conflicts and clearing them
  after Table removal. Native callback/source checks are not device/portal or authenticated E2E
  acceptance. Dependencies, workflows and private files stay unchanged.

## Table invitation 409 — scoped conflict diagnostics

- The supplied platform report contains status/timing but no response body, so it does not identify
  one specific cause. Invitation POSTs carry no Event version: possible domain conflicts are
  `REGISTRATION_ALREADY_ACTIVE`, `TABLE_TIME_CONFLICT`, `EVENT_NOT_PLANNING` and `EVENT_BOOKING_CLOSED`,
  not the voluntary join's `EVENT_CHANGED` check. No duplicate, consent, cutoff or overlap guard is
  weakened, and no speculative retry/idempotency or candidate-filter behavior is introduced.
- This POST alone opts into `[bgo.event-write]` / `event.table.invite` diagnostics. Fixed stages,
  random correlation ID, HTTP status and normalized code identify the actual next failure; terminal
  logging stays outside transaction callbacks so retries cannot report uncommitted success. URLs,
  bypass/auth tokens, headers, payloads, identities and Event/Table IDs are not logged. Candidate
  GETs and unrelated Event routes remain silent. Operational triage is documented in
  [operations](organizations-events-operations.md#table-invitation-conflicts).
- Local checks pass: API coverage 709 tests, existing diagnostic helper 100% gate, root typecheck
  4/4, scoped Biome 4 files, Mongo integration 82/82 and API production build. Tests exercise all
  four 409 codes, 201/401/500, privacy redaction and transaction/body retries. This is instrumentation,
  not proof of a deployed root cause or native/E2E acceptance. The tested APK must target the API
  Preview containing this change; an older immutable origin does not update itself.

## Public Group Events — native clocks and inclusive scheduling

- Native Event end, registration deadline and Table start use the installed system clock picker,
  including bounded fields. Android date/time selection stays staged and cancel writes nothing;
  the native clock cannot disable individual times, so out-of-range choices show validation instead
  of being accepted or silently clamped. The obsolete custom hour/minute picker is removed.
- Registration deadline is restricted to a calendar day before the Event in its verified venue zone;
  creation still requires a future instant. UI bounds, draft validation and API writes agree,
  including cases where a preceding UTC day is already the Event day locally. Existing records stay
  readable; no backfill/reset occurs. Table starts include Event start and the last full-duration
  start ending by Event end; duration and overlap guards remain. New Table defaults use Event start.
- Summary end/deadline values use the same grouped items as Start. Wizard/detail labels share
  `Registration Deadline Date and Time`, translated exactly as `Date e ora Termine iscrizioni`.
  PUBLIC Group joins open Games even on first enrollment; all three tabs remain available and fixed
  date/location values remain read-only. PRIVATE repeat-join preference/consent behavior is unchanged.
- Local coverage passes 1,716 tests: schemas 110, shared 222, API 700, web 470, native pure/source 214.
  Existing 100% deterministic-logic gates pass; Mongo integration 82/82, root typecheck 4/4,
  scoped Biome, EN/IT extraction/compilation, API/web production builds and Android export pass.
  Native callback/source checks are not real device/clock/push or authenticated E2E acceptance.
  Workflows, dependencies, private files and generated Next references are preserved. Operator
  requests signed scoped commits/push, including earlier Back and moderation work; no new PR/merge.

## Group moderation — notification destinations and pending-list parity

- The API already emits `/moderation/{groupId}` for Group review requests. The shared native
  notification adapter now accepts only UUID-shaped review paths, instead of falling back to the
  inbox; bell, inbox and cold/warm push readers all use it. External, traversal, query/fragment and
  unsupported paths remain rejected. Existing review routes and fresh BGO moderator checks are unchanged.
- Both moderation queues reuse their platform-owned Group cards with explicit review destinations,
  artwork, status and metadata, rather than name-only buttons/links. Optional invitation callbacks
  keep membership actions out of review cards. Ordinary Group destinations and consent stay intact.
  Existing list/search frames, source paging, cached content, access-denied filtering, retry and
  loading/empty states remain; mobile stays virtualized. All labels reuse existing EN/IT messages.
- Local checks pass: native pure/source coverage 208 tests, web coverage 469 tests (677 total), root
  typecheck 4/4, scoped Biome 9 files, web production build and Android Metro export. Native URL
  logic retains its existing 100% coverage gate; web GroupCard/GroupModeration also measure 100%.
  Callback/source checks are not native rendering, real push or authenticated E2E acceptance.
  Included in the requested scoped publication; no API, database, dependency, provider or workflow
  mutation. Earlier single-Back
  work and private files are preserved. Detailed local evidence: `.git/moderation-result.json`.

## Location picker — one native Back control

- LocationPicker clears inherited/custom `headerLeft` and explicitly keeps native Back visible;
  the duplicate ArrowLeft button is removed. Native route removal closes an inline picker through
  Expo's supported `usePreventRemove` hook instead of discarding the Group/Event wizard draft.
  Standalone picker navigation remains unguarded. Parent header/icon restoration is preserved.
- Actual option/callback tests cover inherited custom-button clearing, inline/standalone guards and
  Group/Event header restoration. Native pure/source coverage passes 200 tests, root typecheck 4/4,
  scoped Biome 2 files and Android Metro export pass. No native gesture/rendering acceptance is
  claimed. Included in the requested scoped publication; no dependency, localization, API, provider
  or workflow change.

## Verified-address coordinate drift — provider canonicalization and favorite identity

- Supplied runtime logs confirm the shared failure: one returned provider address matches the selected
  address, but its coordinates differ. Exact-coordinate re-search rejected a valid selected address.
- The shared verifier still prefers an exact provider key. Only one result with the same full normalized
  address can supply canonical coordinates/timezone when the selected point drifts. Missing/ambiguous
  addresses stay rejected, including matches split across candidates; no arbitrary distance tolerance
  or trusted client coordinate fallback. Group/Event writes and favorites share this rule.
- Favorite writes persist provider-derived location fields, not stale/forged client coordinates. Opaque
  selection keys remain stable; optional server-derived `canonicalKey` supports bounded, owner-scoped
  status lookups and equivalent-point removal. Old rows remain readable. Removal runs transactionally;
  no database reset, backfill or provider configuration change is performed.
- The shared favorite hook reconciles the acknowledged canonical row, recognizes selection/canonical
  keys, restores affected snapshots on failure and keeps delayed replies in the original actor cache.
  Unrelated favorites and missing/foreign caches stay intact; web/native share the same behavior.
- Local checks: schemas 110, shared 219, API 695, web 462, native pure/source 197 = 1,683 tests; all
  existing 100% gates remain enforced. Root typecheck 4/4, scoped Biome 9 source files, API/web
  production builds and Android Metro export pass. After the operator started Docker, isolated Mongo
  integration passes 82/82, including canonical alias ownership, idempotency, removal and rollback.
  Native gesture/rendering/authenticated E2E acceptance is not claimed. EN/IT, dependencies, workflows,
  private files and generated Next references are preserved. Guides: MapTiler, Expo networking,
  TanStack Query and existing BGO architecture. Operator requests signed scoped commits and push.

## Preview quota, location diagnostics and native wizard header restoration

- Operator authorizes a Preview-only logo quota exception, expanded Group/associated-location API
  diagnostics, scope-separated publication and Preview deployment. Only platform `VERCEL_ENV=preview`
  skips the five-unclaimed check; production/unknown/local environments fail closed. The shared policy
  covers current Group and retained Organization asset services without reviving retired routes.
  Size/MIME/image validation, owner locking/authorization, claiming, TTL and existing assets are intact.
- One request diagnostic helper retains safe Group create/logo logs and adds Group update/logo preview,
  location search/reverse and favorite list/status/save/remove. Invalid query/body/DTO paths are visible;
  arbitrary messages, tokens, URLs, identities and location/image values are not recorded.
- Favorite writes and Group/Event venue verification share the same exact provider-match lookup.
  `[bgo.location-verify]` reports only candidate count and independent address/coordinate match flags.
  Favorite HTTP bodies/statuses, timezone authority and `CHOOSE_VERIFIED_ADDRESS` remain unchanged;
  this is diagnostic coverage, not a claimed fix or weakened verification rule.
- Native Group/Event wizards restore their full `HeaderTitle` renderer (`UsersRound`/`Dices`) after
  inline LocationPicker return. Expo's `Stack.Screen` merges options without unmount cleanup; restoring
  only title/back leaves the picker `MapPin` renderer attached. Actual option callbacks are tested for
  create/edit and confirm/cancel merge paths; navigation/drafts, icons while picking and translations
  remain unchanged. Real native rendering/gesture acceptance is still not claimed.
- Local checks: schemas 110, shared 219, API 690, web 460, native pure/source 197 = 1,676 tests; unchanged
  gates plus 100% policy/diagnostic/verifier gates pass. Root typecheck 4/4, scoped Biome 19 files, isolated
  Mongo integration 81/81, API/web production builds and Android Metro export pass. Generated Next
  references/private files are preserved; no catalogs, dependencies, workflows, providers or live data
  changed. Guides used: BGO architecture, Expo Router/data fetching, native React and MapTiler guides.

## Group creation / logo upload — scoped API diagnostics

- Operator reports that a Group without logo/location can be created, while optional fields fail;
  the logo shows a generic upload error and no API logs were visible. Root cause is not yet verified.
- Four write endpoints now opt into `[bgo.group-write]` diagnostics: `group.create`,
  `group.logo.start`, `group.logo.chunk` and `group.logo.complete`. Entry is logged before auth;
  subsequent stages identify service loading, user synchronization, transaction and final status.
  Per-request random IDs correlate those entries; transaction retries do not duplicate completion.
- Logs exclude request URLs/query strings, headers, identity, names, locations, image/base64 content
  and arbitrary exception messages. Only normalized domain codes or fixed generic codes are emitted.
  Authentication, validation, status/CORS/private-cache behavior and committed-only notifications stay
  unchanged. Read endpoints and other domains do not opt into this logging.
- API coverage passes 668 tests with unchanged 100% HTTP gates; root typecheck 4/4, scoped Biome
  6 files, isolated Mongo integration 81/81 and API/web production builds pass. Generated Next
  references and private files are preserved. Existing clients/catalogs/dependencies are unchanged.
  This diagnostic build is not a claimed fix for the reported optional-field failure; remove scoped
  diagnostics once investigated.
- Operator authorizes commit/push and a fresh build. Published PR APKs target the development API
  Preview, not production; inspect that APK's recorded API origin and filter runtime logs by
  `[bgo.group-write]`. If entry is absent there, the request did not enter these route handlers.

## Join sheet — always three tabs, participation-based initial selection

- Web/native join sheets always expose Dates / Locations / Games. A player with no other ACCEPTED
  Table in that Event starts on Dates; accepted participation elsewhere starts on Games. Pending,
  declined/cancelled registrations do not qualify. Default waits for participation metadata, is chosen
  once per sheet and never overrides a later manual tab change or background refetch.
- PRIVATE Event date/location preferences are prefilled independently of Table loading, remain
  editable on repeat joins and are committed with the new Table's game votes through the existing
  atomic versioned join endpoint. Fixed standalone/PUBLIC schedules remain visible/read-only.
  Cancellation writes nothing; missing/negative/stale choices retain existing validation/error paths.
- Acknowledged preferences reconcile only owned Event detail/list caches and retain newer versions;
  explicit invitation consent, cutoff guards, final-positive rules, cached content and busy close
  safeguards are unchanged. Parent join confirmations no longer promise immutable Event preferences.
- Checks: schemas 110, shared 219, API 657, web 460 and native pure/source 195 tests (1,641 total),
  unchanged 100% gates, root typecheck 4/4 and scoped Biome 12 files. Isolated Mongo integration passes
  81/81, including repeat-join availability update/rollback. API/web production builds and Android
  Metro export pass; existing compiled EN/IT labels pass without catalog/dependency changes.
- Prior native-map/crash edits and private/local files remain byte-preserved. Local/unpublished work;
  no commit/push, device navigation/reset, provider/database mutation or E2E/workflow change. Native
  rendering and authenticated E2E acceptance are not claimed. Guides: `heroui-react`, `heroui-native`,
  `tanstack-query-development`, `bgo-component-architecture`, platform React/Expo guides and final
  `web-design-guidelines` review.
- The operator subsequently authorized signed commits separated into native-map, join-sheet and
  documentation scopes, normal push to the existing branch and exact-SHA branch/PR CI monitoring
  with repairs until enabled gates are green. Local/unpublished statements describe validation stages;
  this authorization does not include merge, new PR, device operations or provider/production changes.

## Native location selection — safe map dispatch; crash attribution pending

- Reported Android SIGSEGV during saved-location selection includes unsymbolicated `base.apk`
  addresses, preceding background/low-memory events and a MapLibre style warning. These breadcrumbs
  do not identify the crashing library or prove an OOM/style failure. Local Sentry CLI preflight is
  Unauthorized, with no project configured; event ID, affected release/dist and symbolicated native
  frames are still required to attribute that specific crash. No provider/auth/privacy setting changed.
- The shared native LocationPicker no longer dispatches camera commands directly from saved-location,
  search or GPS callbacks. Latest target is queued until style loading finishes and the app is active;
  style reload/failure pauses commands. Initial viewport stays stable. Coordinate validation rejects
  invalid cached/API values before native dispatch or confirmation.
- The noninteractive selected-point indicator now uses stable GeoJSON/circle style layers instead of
  reparented native Marker child views during favorite-sheet selection. Camera animation, verified
  addresses/time zones, favorite paging, permission refresh and MapTiler/OSM attribution are retained.
  Event, Group and historical picker callers share the same fix; no dependency/style-family upgrade.
- Local checks: root typecheck 4/4, scoped Biome 4 files, native pure/source coverage 190 tests/30 files,
  coordinate helper 100% gate and Android Metro export pass. Tests execute actual selection/readiness
  callbacks and cover rapid selection, loading, paused/reloading/failed maps and invalid coordinates.
  This is not device rendering or SIGSEGV reproduction/acceptance. Current compiled EN/IT titles do not
  reproduce the pasted uncompiled-message warnings; no catalog fallback suppression was introduced.
- Local/unpublished follow-up on the existing branch. No commit/push, emulator navigation/reset,
  live-data mutation, SDK upgrade, Babel/Sentry instrumentation change or E2E/workflow edit.

## Notification language — application/inbox/device parity

- Authenticated application startup syncs EN/IT preference through strict, bounded, caller-only
  `PATCH /api/profiles`, independently of push credentials/permission. `GET /api/profiles` returns
  the MongoDB preference, not hardcoded Italian. Clerk mirror repair, webhook and administrative
  upserts retain an existing application preference; their language is an insertion default only.
- New inbox records retain immutable formatting inputs alongside original text. Explicit inbox
  locale is validated, scoped into Query keys and used at read time without rewriting records or
  changing resource links, unread counts or paging. Every native reader, including bootstrap, and
  both web readers pass the active locale. Profile synchronization preserves other fields/owners,
  aborts old identities and never seeds partial profiles or emits user-action toasts.
- FCM web/Android and APNs use each installation's locale. Registration refreshes when locale/user
  changes without a new permission prompt; pending old-locale registration cannot overwrite the new
  choice. No provider credentials/settings, permission policy, instrumentation or dependencies changed.
- Historical notifications without formatting inputs keep their original text. No lossy parsing,
  live backfill, document reset or rewrite is authorized/performed; new records support both locales.
- Local coverage passed: schemas 110, shared 219, API 656, web 452 and native pure/source 185 tests
  (1,622 total), including unchanged existing gates plus new 100% gates for the formatter, profile
  controller and shared sync hook. Full isolated Mongo integration passed 81/81 across 3 files.
  Root typecheck passed 4/4 and scoped Biome passed 78 source files; API/web production builds and
  Android Metro export passed. Generated Next references, prior feature edits and private/local files
  are preserved. Native UI/authenticated E2E/live delivery acceptance is not claimed.
- Guides used: `lingui-best-practices`, `tanstack-query-development`, `expo-overview`,
  `expo-data-fetching`, `vercel-react-best-practices`, `vercel-react-native-skills`,
  `bgo-component-architecture`, `vercel-composition-patterns`. No skill/dependency upgrade.
- The operator subsequently authorized scope-separated signed commits, push and CI repair until all
  enabled branch/PR gates are green. This does not authorize merging, a new PR, production/provider
  mutation, emulator operation or changing retained E2E/workflow policy. Earlier local-only statements
  below describe their verification stage, not the current publication instruction.

## Explicit join games and Table-scoped invitation candidates — follow-up

- Voluntary join now collects explicit game preferences in the same transaction as registration and
  any initial PRIVATE date/location preferences. First PRIVATE join has Dates / Locations / Games;
  another Table in the same Event reuses Event preferences and asks only for its own games. Fixed/
  standalone Event schedules likewise retain their existing date/location consent semantics.
- Every current proposed game needs YES / IF_NEEDED / NO and at least one positive option. Event
  versions and exact current game IDs reject stale/foreign ballots before writes. API and UI preserve
  a positive game on subsequent edits, including concurrent NO requests under the same Event lock.
  Fixed PUBLIC game identity stays immutable; explicit ballots are not overwritten by fixed-option
  agreement, while historical/invitation implicit availability remains readable when no ballot exists.
- Unknown is removed from vote totals, choice menus and legends on both clients. Missing/historical
  ballots stay readable internally and show a neutral choice prompt, never a fabricated YES/NO.
  Draft votes remain local, errors retain editable choices, and cancel never writes partial votes.
- Invitation pickers use the organizer-only Table candidate endpoint, not unfiltered contacts/Group
  pages or a partial seat snapshot. Mongo filtering excludes PENDING/ACCEPTED seated and queued users
  before cursor/limit paging; other Tables and declined/cancelled rows do not exclude candidates.
  Existing membership, exclusion and reciprocal friendship/block rules remain authoritative. Group
  candidate replies disclose neither email values nor presence. Optimistic hiding/rollback is scoped
  by API, actor, Event and Table; acknowledged registrations retain newer cached game votes.
- Final local coverage runs passed: schemas 109, shared 219, API 608, web 439 and mobile 182 tests
  (1,557 total); existing per-file 100% gates remain unchanged and pass. Root typecheck passed 4/4,
  scoped Biome passed 44 source files, compiled EN/IT messages and Italian plurals passed. API/web
  production builds and Android Metro export passed; generated Next references were restored.
- Full isolated Mongo integration passed 81/81 across 3 files. A slower final rerun exceeded the
  command wrapper's 600-second window but continued; its actual Vitest process was observed exiting
  0 after all tests passed (998.12 seconds). No test deadline or assertion was weakened.
- Native evidence remains pure/source tests plus Metro export, not device rendering/gesture or
  authenticated Playwright/Maestro acceptance. Whole-root lint is not claimed against unrelated private
  local service JSON; scoped public-source checks pass. Private/local baseline files stay unchanged.
- Applied guides: `bgo-component-architecture`, `tanstack-query-development`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`, `heroui-react`,
  `heroui-native`, `uniwind`, `lingui-best-practices`; final `web-design-guidelines` review.
- Everything remains local/unstaged on the existing branch. Prior publication/CI authorization is
  historical; no commit/push, PR, deployment/provider or live-data mutation, emulator operation,
  dependency/Babel/Sentry change, or E2E/workflow edit.

## Table-card parity and DiceBear identities — scoped publication and CI follow-up

- Main Tables and Event detail now use one Table card per platform; only Main Tables shows the
  inline Event/calendar · Group/people row. Name/Dices and the right-aligned Rating badge lead five
  independent minimum/maximum/accepted/waiting/pending counts, first game and localized extra count,
  optional demonstrator, and terminated joint winners. Count help stays far left outside navigation;
  invitation controls retain the right-side consent/version/cutoff guards.
- Stable persisted Table IDs seed animated DiceBear Planets across saved/review identities. Event
  identities and parent links use Constellation. Existing reduced-motion policy remains unchanged;
  no dependency, Babel, authentication, server-state or rating-calculation changes.
- Artwork keeps accepted, pending invitation, pending request and waiting-list icon states, not
  body labels. Immutable Results swap Global ranking into the first-row Group-change position;
  Group change moves to the second row. Genuine snapshots/ND/unavailable scopes remain unchanged.
- Verification: **606** coverage tests pass (web **424/82 files**, mobile **182/28**); existing 100%
  Table-card/result gates remain unchanged. Root typecheck **4/4**, scoped Biome, compiled EN/IT
  help/plural checks, web production build and Android Metro export pass. Next references restored
  byte-for-byte. Root lint is locally blocked only by pre-existing private service JSON formatting,
  left untouched; this is not a native rendering/gesture or authenticated Playwright/Maestro claim.
  The operator now authorizes signed scope-separated commits, a normal push of the existing branch,
  and monitoring/fixing its enabled CI until green. Private/local files remain excluded. No force-push,
  merge, new PR, manual provider/live-data mutation, emulator operation or weakened CI gate is authorized.

## Previous shared Event availability, result rows and excluded Tables — scoped publication

- PRIVATE enrollment at another Table reuses accepted participation in the same Event, without a
  second preference sheet or voter overwrite. Pending/cancelled/declined rows never qualify. Shared
  Query actions reconcile owned Event participation from registration responses, retain newer cached
  registration versions and preserve foreign identities/unrelated Events. Private actions wait for
  missing participation metadata; ordinary failures keep content and offer an explicit retry.
- Event date/location edits retain at least one YES/IF_NEEDED in their own current option set. NO is
  disabled with localized explanation when it would remove that final option. Both positive states
  remain interchangeable, other positive alternatives allow NO, removed options/other dimensions do
  not qualify, and game NO/UNKNOWN are unchanged. API validation shares the existing transaction lock.
- Table Overview now places an Event label and linked name/matching artwork item immediately below
  settings. Result entry removes duplicate body Back controls; app-header Back owns selected/list
  navigation, preserving other Table drafts. Native hardware Back keeps the same behavior; web header
  controls/title share one bounded width to avoid introducing narrow-screen overflow.
- Immutable Result cards have two matched statistic rows: position/GROUP-before/change/after, then
  exact score or ND/GLOBAL change/after. Missing/disabled GROUP snapshots stay unavailable rather
  than aliasing GLOBAL data. Native rows remain virtualized; no rating/statistics algorithm changes.
- Personal feed excludes non-frozen CONFIRMED/TERMINATED Tables before paging and filters known
  excluded old cache rows. Parent Event lists/details retain those Tables; planning/replanning retains
  ordinary planning visibility. No records are deleted or reset.
- Verification: **1,533** passing coverage tests: web **422/82 files**, mobile **182/28**, API **604/68**,
  schemas **108/13**, shared **217/31**. Existing 100% policy/UI gates retained and passed; missing
  allowed-location branches and asynchronous cache assertions were covered rather than weakening
  thresholds/timeouts. Root typecheck **4/4**, scoped Biome, four real compiled EN/IT message checks,
  API/web builds and Android Metro export pass. Generated Next references restored byte-for-byte.
- Real isolated Mongo **3 passed, 30 intentionally filtered**: two simultaneous NO changes cannot
  eliminate the final positive date/venue; additional joins leave preferences unchanged; excluded
  rows cannot consume personal page slots and remain in confirmed/terminated Event lists. Initial
  enrollment rollback/stale rejection and prior atomic whole-event result/rating regressions pass too.
  This is not a complete integration-suite or authenticated/native acceptance claim.

The operator authorized signed scope-separated commits and a normal push of feat/social-api-refactor
from base 08ba574. Scopes cover localization, native plural bootstrap, Groups, Events/Tables, regression
coverage and documentation. Private service files, local agent configuration, .gitignore edits and
API development type references are excluded. No force-push, new PR, direct provider/deployment change,
live-data mutation or emulator control is authorized. Native rendering/gestures and authenticated
Playwright/Maestro remain unverified; retained suites/workflows are unchanged. Earlier Members/Rankings
issue remains unreproduced. Local check evidence: .git/followup-current.md; commit/signature evidence
belongs to Git history. Behavior contract: [Unified Groups / Events / Tables](groups-events-refactor.md).

## Previous player cards, compact Tables and PRIVATE enrollment availability — local, uncommitted

- Table tabs are centered. Results/current-ranking cards share platform-owned avatar/full-name/username
  presentation; API responses supply authorized local usernames. Immutable Results show position,
  before/after OpenSkill display rating and signed semantic-color changes, retaining exact scores/ND
  and genuine GLOBAL/GROUP deltas. Missing profile fields skeleton independently of known results.
  Ranking shows Selected game, the existing game-row pattern, then Ranking/current player cards.
- Main Table cards show Dices plus the first game and localized additional +n game/games. Redundant
  body status chips/participation labels are removed; artwork retains pending/accepted/waiting states
  and the viewer's genuine winner trophy. Group/Event metadata, totals and joint winner names remain.
- Voluntary PRIVATE enrollment opens initial confirmation, then platform HeroUI Dates/Locations
  bottom sheets. Every option needs an explicit YES/IF_NEEDED/NO, with at least one usable option in
  each dimension. Opening/canceling writes nothing. One versioned request commits registration and
  initial preferences together; incomplete/stale choices fail before writes. Invitations retain their
  separate consent semantics. Event details allow later edits; UNKNOWN remains a game choice only.
  Native sheet lists use bounded Gorhom virtualization; draft choices remain local, Query owns data.
- Corrected the reported RSC build error at its source: useEventJoinForm alone is marked use client.
  The shared barrel and pure enrollment policy remain server-capable. Both API/web production builds
  pass through the actual previously failing import chain; no API service is converted to client code.
- Verification: **1,519** passing coverage tests (web **413/82 files**, mobile **182/28**, API **602/68**,
  schemas **108/13**, shared **214/31**). Existing thresholds retained; new deterministic enrollment,
  form/sheet and player-card paths meet 100% gates. Root typecheck **4/4**, scoped Biome, compiled EN/IT
  labels/plurals, API/web builds and Android Metro export pass. Next references restored byte-for-byte.
- Real isolated Mongo: **2 passed, 30 intentionally filtered**, covering enrollment/preference atomic
  rollback and stale rejection, later vote edits/game UNKNOWN, plus whole-event result/rating rollback
  and current frozen-roster rankings. Not a full-suite integration or authenticated/native acceptance.
- Retained initial failures: missing client directive, superseded UI assertions and missing dismissal
  coverage were corrected; one outer web command window elapsed before its longer exact-command rerun.
  No Vitest deadlines, authentication, assertions of current behavior or coverage gates were weakened.

Everything remains local/unstaged, published HEAD 08ba574 unchanged. No commit/push, PR/deployment,
provider or live application-data mutation, emulator operation, dependency/SDK/Babel change. Native
rendering/gestures and authenticated Playwright/Maestro remain unverified; suites/workflows unchanged.
Earlier Members/Rankings failure remains unreproduced. Evidence: .git/fixes123-current.md.

## Previous Event/Table result workflow and current rankings — local, uncommitted

- Confirmation/replanning dialogs use CalendarCheck/RotateCcw. A confirmed owner's ClipboardPenLine
  registration action is icon-only in the app header; the secondary RotateCcw FAB sits bottom-right.
  Existing capabilities, owner, version, placeholder/busy and exact-cutoff safeguards remain active.
- Platform Table wrappers own Overview/Ranking tabs after confirmation and add Results after termination.
  Overview/standings/current-ranking responsibilities are separate; native views stay virtualized and
  safe-area aware. Immutable scores, ND, ties and profile skeletons remain; rating deltas are hidden
  when Table ratings were disabled. Terminated overview uses real paged accepted registrations, not
  invented seats/versions. Group ranking gets the same horizontal insets as other Group destinations.
- New authenticated, strict, source-paged Table leaderboard reads the selected frozen game's current
  GLOBAL (standalone) or GROUP snapshots and genuine physical-Table statistics for frozen players only.
  No synthetic Match/organizer seat, pending player, legacy Match statistic or rating write is introduced.
  Read operations sharing a transaction session run sequentially. Auth/API/user/Event/Table/game cache
  keys, fresh tokens, cancellation, cache-first immediate revalidation and scoped invalidation remain.
  Wrong-game responses cannot enter an old game cache; retry refreshes only owned Table metadata.
- Registration reuses Table artwork/card/body patterns. Header titles are Register Tables Results for
  the list and Register Table Result for its editor; Tables list help explains complete/irreversible
  finalization and all-ND non-contribution. Completed local drafts show a success check on the artwork,
  with an accessible description/hint. Finalization button/dialog use Flag. Native header/hardware Back
  returns to the list while retaining other drafts. No per-Table server saves or server Event drafts.
  Denied selected-Table reads hide cached player editors; ordinary cached failures remain retryable.
- Verification: **1,504** passing coverage tests (web **402** / **80 files**, mobile **182** / **28**,
  API **599** / **68**, schemas **108** / **13**, shared **213** / **30**). Previous gates preserved;
  added 100% web result-card/standings/current-ranking and shared leaderboard-query metrics. Root
  typecheck **4/4**, scoped Biome, nine compiled EN/IT labels, API/web builds and Android Metro export
  pass. Generated API/web Next references restored byte-for-byte. No dependency/SDK/Babel changes.
- Focused real-Mongo regression **1 passed, 30 intentionally filtered**: invalid later Table rolls back
  all earlier results/ratings; only genuine eligible Tables contribute; current ranking updates after
  atomic finalization, pages the frozen roster, and all-ND Tables display current rankings from other
  physical Tables without contributing their own statistics. This is not a fresh full Mongo-suite pass.

Local/unstaged on `feat/social-api-refactor`, published HEAD `08ba574` unchanged. No commit/push,
PR change, deployment, emulator operation or provider/application-data mutation. Native rendering,
gestures and authenticated Playwright/Maestro remain unverified; retained suites/workflows unchanged.
Earlier Members/Rankings issue remains unreproduced. Stale assertions, initially missing coverage paths
and an unsupported aria-description were corrected with behavior/ARIA tests, never weakened gates.

## Previous personal Table cards and pending artwork — local, uncommitted

- Main Tables cards remove visible Reserved place/Invitation received text. Own pending invitations
  carry warning mail artwork badges; pending self requests carry warning clocks without self-approval
  controls. Group invited/requested artwork uses the same badge family; creator crowns remain intact.
- Event metadata has CalendarDays and the shared semantic state badge; associated Group/UsersRound
  follows beneath. A single horizontal icon row shows minimum, maximum, accepted and pending totals.
  New read-only API metadata supplies approved Group name and complete registration totals, including
  waiters, without changing existing seated/pending-seat/waiting counters or introducing approval writes.
  Older cache shapes keep available content and skeleton only missing new fields. Games, frozen/waiting
  context, joint winners, source paging, exact cutoffs and authorization remain intact.
- Group/Table invitations reuse platform InvitationActions: matching size, primary/danger-soft variants
  and Check/X icons. Native controls retain 36px visuals plus 4px hit slop and use theme foregrounds,
  replacing hard-coded icon colors. Consent/version/busy/toast behavior remains; pending self requests
  cannot invoke invitation responses even through stale capabilities. EN/IT source/compiled catalogs updated.
- Verification: **1,466** coverage tests (web **373**, mobile **177**, API **595**, schemas **108**,
  shared **213**). Existing gates unchanged; 100% web metrics added for main Table/response controls and
  shared invitation/artwork badges. Root typecheck **4/4**, scoped Biome, API/web production builds and
  Android Metro export pass; generated Next references restored byte-for-byte. The initial unrelated
  favorites-route cold timeout passed the exact full API retry without changing its 5s deadline.
- Real Mongo targeted regression: **1 passed, 30 explicitly filtered**, verifying paged personal rows,
  approved Group names, accepted waiters, pending invitation totals and decline/cancel reconciliation.
  Full integration attempt hit the outer command window before completion; its passing partial log
  is preserved and is not a new full-suite pass. No test timeout/assertion/coverage/auth gate weakened.

Local/unstaged on `feat/social-api-refactor`, published HEAD `08ba574` unchanged. No commit/push,
PR change, deployment, emulator operation or provider/application-data mutation. Native rendering,
gestures, authenticated E2E and a completed fresh full Mongo suite remain unverified. Earlier
Members/Rankings issue remains unreproduced. Previous checkpoints below are historical evidence.

## Previous detail identity cards and concise voting help — local, uncommitted

- Web/native Event detail starts with Details, Info and the existing voting legend. Its first card
  reuses stable waves artwork, CalendarDays/name and a top-right state badge; associated Group
  navigation appears beneath only when present. Missing Group metadata loads partially without
  replacing available identity. Event list/detail share one platform-owned status badge.
- Table detail starts with Settings/Settings2 and existing minimum/maximum help. Its first shapes
  card holds Dices/name, the shared enabled/disabled Rating badge, then the existing player-limit
  icons/counts. Frozen exclusions, app-header Back, game/seat workflows and authorization stay intact.
- EN/IT voting help now limits description to accepted-only voting, reserved pending places until
  acceptance, and joining at least one Table to participate in the Event; all four voting meanings
  remain. No API/state/rating, dependency/SDK, mobile Babel, E2E/workflow or provider changes.
- Verification: web **364** coverage tests / **78 files**, mobile **175** / **27 files**; prior gates
  preserved, plus 100% web metrics for detail identity/status/limits/legend components. Root typecheck
  **4/4**, scoped Biome, EN/IT extract/runtime preservation/compile, web production build and Android
  Metro export pass. Generated Next references restored byte-for-byte.

Local/unstaged on `feat/social-api-refactor`; published HEAD `08ba574` unchanged. No commit/push,
PR change, deployment, emulator operation or provider/application-data mutation. Native rendering,
gestures and Playwright/Maestro acceptance remain unverified. Earlier Members/Rankings issue remains
unreproduced; older API/Mongo/full-workspace counts below are historical, not rerun for this UI task.

## Previous compact draft Table games and secondary disabled rating — local, uncommitted

- Both creation/review Table cards show Dices, the first game only and `+n` for additional games;
  zero/one-game cases never show `+0`. Extra names are not repeated in text/tooltips. Long names
  truncate without hiding the count; existing EN/IT plural messages provide assistive descriptions.
- Shared platform Rating badges retain primary/accent when enabled and use secondary/default when
  disabled. Native disabled icons use the corresponding foreground, not accent-foreground. Existing
  state icons/labels and parity across review, saved cards and detail remain intact. No rating logic,
  API, dependency or SDK changes.
- UI verification at that checkpoint: web **355** coverage tests / **77 files**, mobile **174** / **27 files**;
  existing gates preserved and 100% thresholds added for the web draft card/rating badge. Root typecheck
  **4/4**, Biome **7 files**, EN/IT extract/compile and web build pass. Android Metro export passes
  an exact-command retry: the initial Windows process exited `3221225477` after writing its bundle;
  failed and successful logs remain separate. Generated Next references restored byte-for-byte.

Changes remain local/unstaged on `feat/social-api-refactor`, published HEAD `08ba574` unchanged.
No commit/push, deployment, emulator operations or provider/application-data mutation. Native
rendering/gestures and Playwright/Maestro acceptance not run. Older API/Mongo/full-workspace counts
below are historical, not newly rerun for this UI-only follow-up.

## Overview request controls and inline Event Group selection — local, uncommitted

- Public membership request and pending explanation/cancellation sit centered after Overview's final
  information item on web/native. Request uses UserRoundPlus, cancellation uses X beneath the pending
  explanation; existing versioned confirmation, busy guards and failure handling remain intact.
- Shared capabilities now permit authenticated, non-banned browsing of an approved PUBLIC Group's
  accepted roster before requesting. No social state/actions, Events, rankings, pending requests or
  bans become available. Private/unapproved/actively excluded readers remain protected. Both member
  management dialogs include Check/X icons for administrator Approve/Reject responses.
- Event creation uses the platform HeroUI Select inline, not a separate Group search screen.
  Search reuses the 300 ms/four-character policy and scoped fresh-token source paging; Group artwork
  and explicit No group are retained. More pages load on dropdown scroll or explicit action, never
  eagerly draining the feed; repeated in-flight paging is not cancelled/restarted. Query errors remain
  observable and retryable. A Group-menu launch presets/disables selection, backed by the existing
  shared draft guard; context identity keys keep distinct launches separate. Edits retain immutable
  Group identity. Selecting/clearing an optional Group preserves the other unsaved form fields.
- EN/IT catalogs extracted/compiled; new Load more groups translation included. No dependency/SDK,
  provider, E2E/workflow or mobile Babel changes. Web Select.Value directly renders the authorized
  selected label for visual and assistive-technology consistency.
- Verification: **1,438** coverage tests (shared **213**, schemas **108**, API **594**, web **351**,
  mobile **172**), unchanged previous gates plus 100% for GroupJoinRequest; root typecheck **4/4**;
  Biome **21 files**; **95** Node policies, zero failures/skips; **76** full real-Mongo integration
  tests across **3 files**, zero failures/skips. The real public-Group regression now checks pre-request
  accepted-roster access without social state, protected pending/banned modes/rankings and active-ban
  denial. API/web builds and Android Metro export pass; Next references restored byte-for-byte.

Changes remain local on `feat/social-api-refactor`, published HEAD `08ba574` unchanged. No staging,
commit/push, deployment, application-data reset, provider mutation or emulator operations. Initial
stale UI assertions and one unrelated cold-import timeout were superseded by passing same-deadline
checks; no timeout, coverage or authorization gate was weakened. Native rendering/gestures,
Playwright/Maestro and production acceptance remain unverified; earlier Members/Rankings failure
remains unreproduced, distinct from the newly authorized read-only public roster behavior.

## Group context, invitation candidates and personal Tables — local, uncommitted

- PUBLIC Table editors fix the Event day and expose only bounded start time, strictly after Event
  start with the full duration fitting by Event end. API validates the same write constraints and
  returns client errors for invalid intervals. Demonstrators use grouped player identities and avatars.
- Grouped Event creation returns to that Group's Events tab on both clients; standalone creation and
  edit destinations retain their existing behavior. PUBLIC detail consistently presents Start Date
  and Time, End Date and Time and Booking Cutoff Date and Time as matching information items.
- Group invitations source-page eligible reciprocal friends, filtering accepted/pending memberships,
  blocks and live Group bans before search/pagination. The creator/approved-Group guards remain;
  optimistic invitation removal and selective rollback stay API/user/Group-scoped.
- Received invitations appear in a centered Accept/Decline card after Group information. Accepted
  non-admin departure is a danger LogOut action in the app header, with existing explicit consent;
  the old above-tabs Leave action is removed.
- Main Tables include accepted seats, accepted waiting players and pending invitations in planning,
  confirmed and terminated Events, retaining confirmed organizer/demonstrator duties. Declined/left
  registrations are excluded; existing Group visibility remains authoritative.
- Unified HTTP lazily loads service implementations only for authenticated active operations; retired
  URLs retain 401/410 and never initialize unused domain services. This also resolves cold-import
  timeouts without changing test deadlines, assertions or coverage thresholds.
- Verification: **1,430** coverage tests (shared **212**, schemas **108**, API **594**, web **345**,
  mobile **171**), unchanged existing gates plus 100% for the new invitation card; typecheck **4/4**;
  scoped Biome **41 files**; **95** Node policies; **76** full real-Mongo integration tests across
  **3 files**, zero failures/skips. Mongo verifies filtered candidate paging, accepted waiting/pending
  personal Tables, declined/left exclusion and retained results. API/web builds and Android Metro
  export pass; generated Next references restored byte-for-byte. EN/IT source/compiled catalogs updated.

Everything remains local on `feat/social-api-refactor`, published HEAD `08ba574` unchanged. Nothing
staged, committed, pushed, deployed or changed in providers/application data/emulator state. No new
packages or SDK upgrades. Playwright/Maestro suites remain unchanged; native rendering/gestures and
production acceptance remain unverified. Earlier Members/Rankings failure remains unreproduced.

## Public schedule bounds and Table editor parity — local, uncommitted

Latest operator requirements supersede strict min/max inequality and public overnight writes in the
older checkpoints below; the [active contract](groups-events-refactor.md) describes current rules.

- Table details rely on the app-header Back action. The shared write DTO and both editors allow
  `2 <= minimum <= maximum`. Event-review cards reuse the saved Table's stable DiceBear shapes and
  the exact enabled/disabled Rating badge used by Event detail.
- PUBLIC drafts initialize an editable, non-removable combined Start Date and Time to tomorrow;
  Location is not auto-filled from the Group. End Date and Time and combined Booking Cutoff precede
  Location. Same-day end bounds and strictly later clocks are enforced by both clients and API in
  the verified venue zone. Historical overnight instants remain readable, never silently rewritten.
- Cutoff compares one combined instant, allowing an earlier same-day time or a prior day's later
  clock; new cutoffs remain future-only. Web uses bounded datetime-local inputs. Native retains one
  field; Android selects date then valid hour/minute columns because its system time picker cannot
  disable alternatives. Cancellation never commits a partial selection. Date/time remains canonical
  venue metadata, not a device-zone fallback.
- EN/IT source/compiled catalogs include ten updated labels/help messages. Endpoint labels correctly
  identify end/cutoff times for screen readers. Existing consent, exact cutoff, duration, overlap,
  optimistic cache, immutable results and rating behavior remain intact. No dependency/SDK upgrade.
- Verification: **1,412** coverage tests (web **334**, mobile **170**, API **589**, schemas **108**,
  shared **211**), unchanged gates including 100% deterministic schedule helpers; typecheck **4/4**;
  scoped Biome **36 files**; **95** Node policies, zero skips; **74** full real-Mongo integration tests
  across **3 files**, zero failures/skips. Integration covers venue-local overnight rejection and
  transactional rollback, equal player limits, frozen public exclusion safety and immutable history.
- API/web production builds and Android Metro export pass; Next references restored byte-for-byte.
  An earlier Windows export process exited `3221225477` after writing its bundle; the same command
  and the final export subsequently exited zero. Failed logs remain separate, not counted as passes.

All changes remain local on `feat/social-api-refactor`, published HEAD `08ba574` unchanged. No
commit/push, staging, deployment, provider mutation, application-data reset or emulator operations.
Playwright/Maestro suites remain intentionally unchanged; native rendering/gestures and production
acceptance remain unverified. Earlier Members/Rankings loading remains unreproduced. Older full-Mongo
interruptions below are historical; the current 74-test suite passed in full.

## Grouped Table places and preference controls — local, uncommitted

- Web/native Table details use the existing grouped game/user rows, a places heading with status/privacy
  help, avatar badges, free-place enrollment and a retained queue entry at capacity. Organizers choose
  self-enrollment when eligible or the existing invitation picker. Old standalone join/invite and
  accepted/pending filter buttons are gone. Native rows remain virtualized; web rows source-page and
  use native CSS content visibility for long rosters.
- Summary cards navigate as a whole, with independent help/invitation controls. Table detail uses
  labelled name/settings, player limits and the primary Rating badge instead of repeating its card.
- One secondary status button opens explicit vote choices. Counts sit beneath date/location identities
  and beside game metadata. Detail-only aggregates count accepted players, deduplicate Event voters,
  and treat missing preferences as UNKNOWN; pending ballots never contribute. Accepted participation
  still gates Event voting, and accepted registration at that Table gates game voting.
- Pending identities remain organizer/recipient-only; the recipient's own detail includes their profile
  without granting access to another person's pending stream. Fresh-token, scoped optimistic vote/count
  changes and selective rollback remain intact. Place-choice dialogs recheck cutoff/capabilities.
- Current checks: **1,404** coverage tests (mobile **169**, web **331**, API **588**, schemas **108**,
  shared **208**) with unchanged 100% gates; all four typecheck tasks; **95** Node policies, zero skips;
  scoped Biome (41 files, 32 warnings), whitespace, compiled EN/IT, API/web builds and Android Metro
  export. Generated Next references were restored byte-for-byte. No new dependency or SDK upgrade.
- The real-Mongo proposal/replanning regression additionally verifies persisted aggregate counts,
  pending exclusion and pending-roster privacy: **1 passed, 28 explicitly filtered**. This is not a
  current full integration-suite pass. Playwright/Maestro and native rendering/gestures remain unverified.

Changes remain local on `feat/social-api-refactor`; published HEAD `08ba574` is unchanged, with nothing
staged. No commit/push, deployment, provider mutation, application-data reset/deletion or emulator
navigation/restart. Earlier Members/Rankings loading remains unreproduced. Prior evidence below is
historical, not acceptance of this follow-up.

## Cards and private date/time proposals — local, uncommitted (2026-10-24)

The latest operator request supersedes the earlier single-choice restriction for PRIVATE Groups.
Standalone and PUBLIC Group Events remain fixed to one date/time and one verified venue; see the
[active contract](groups-events-refactor.md).

- Both clients keep contextual Table artwork on the left and every information/action block on the
  right. Table-name labels precede their values; artwork/name navigation stays available. The primary
  badge reads **Rating**, with its enabled/disabled meaning retained through icon and accessible name.
- Event cards put the icon-bearing semantic status at top right, center the calendar beside the name,
  show the first proposed or chosen localized date/time, and identify Table/player counts with icons.
  While planning, `+n` gives the total proposed-date count as requested. Unchosen proposals still belong
  to both Past/Future scopes. Multiple venue zones are not presented as one agreed time zone.
- PRIVATE editors retain empty date/time and verified-location add rows, support distinct clocks on
  the same day, deduplicate choices and enforce 20 options per dimension. The combined field uses the
  browser's datetime-local input and native date/time flow; Android requires date then time and commits
  neither on cancellation. Pending web input survives location-picker navigation.
- Optional per-date `startTime` preserves old common-clock reads. Shared draft validation, Table
  intervals, displays and API validation use the actual option clock. Canonical venue zones and DST
  checks remain mandatory. Clock edits require fresh IDs; unchanged explicit private clocks preserve
  their votes across venue-zone metadata changes. Public registered-schedule locks cannot be bypassed
  with per-option clocks. Confirmation stays manual and freezes the selected clock in the selected zone.
- Verification: all four typecheck tasks; **1,372** coverage tests (mobile **168**, web **309**, API
  **587**, schemas **108**, shared **200**), unchanged 100% gates; **95** Node policies; scoped Biome
  and whitespace; compiled EN/IT catalogs; API/web builds and Android Metro export. Generated Next
  references were restored byte-for-byte. No dependency was added for this follow-up.
- The new real-Mongo transaction regression passes: private proposals/votes, chosen-zone freezing,
  replanning edits, selective vote retention and stale-version rejection. This was an explicit targeted
  run: **1 passed, 28 intentionally filtered**, not full-suite acceptance. Unfiltered attempts were
  interrupted after runner timeout/very slow Docker fixtures; they are not counted as successful.

All follow-up changes remain local on `feat/social-api-refactor`, published HEAD `08ba574` unchanged.
No commit/push, provider change, application-data reset/deletion or emulator navigation/restart occurred.
Playwright/Maestro suites remain unchanged; source/unit/export checks do not establish native rendering,
E2E or production acceptance. Earlier Members/Rankings loading reports remain unreproduced.

## Event confirmation, Table presentation and native plurals — local, uncommitted

- Event confirmation is compact on both platforms and requires both the server capability and an
  explicitly agreed response. Disabled-state explanations, including individual Table reasons, live
  only in the header help popover, not below Locations. Explicit versioned confirmation remains.
- Contextual Table cards reuse their stable-ID DiceBear shapes, label the Table name above its value,
  and put a game icon before the first relevant game. Ratings, queues, consent and frozen data remain.
- The reported native plural crash is reproduced by removing `Intl.PluralRules` in a fresh process.
  Mobile localization now imports the standard `intl-pluralrules` JS polyfill before Lingui use;
  regression checks evaluate the real compiled English/Italian singular and plural messages. This
  adds one JS-only dependency (`2.0.1`), no Babel configuration or native module, with the installed
  pnpm graph and lockfile synchronized. No retained dependency was upgraded.
- Current checks: workspace typecheck; **1,361** coverage tests (mobile **167**, web **305**, API
  **584**, schemas **107**, shared **198**); **73** unfiltered real-Mongo integration tests; **95**
  policy tests; scoped Biome and whitespace; peers; API/web builds; Android Metro export. Existing
  coverage gates remain enforced. EN/IT catalogs compile with the existing translated messages.
- Compatibility against the installed/pinned Expo SDK passes offline. The online Expo checker also
  reports newer patches for existing SDK 57 packages; those unrelated upgrades were not applied.

These remain local source/compilation checks, not emulator rendering, Playwright/Maestro or production
acceptance. No commit/push, deployment, provider mutation, app-data reset or emulator restart occurred.

## Group deletion and contextual UI follow-up — local, uncommitted (2026-10-24)

This follow-up remains local on `feat/social-api-refactor`; the last published HEAD is `08ba574`.
No new commit, push, deployment, provider mutation or application-data deletion was performed.

- Creator-confirmed Group deletion follows the [active domain contract](groups-events-refactor.md):
  versioned sole-owner authorization and one transactional cascade, including terminated Event/Table
  history. Personal GLOBAL skill snapshots, unrelated resources and legacy documents remain intact.
  Real-Mongo regression testing caught and corrected inbox cleanup using the persisted `href` field,
  not the notification-input field `resourceHref`; exact path boundaries preserve unrelated links.
- Both clients expose top-level Groups/Search tabs, Overview-only Group editing and right-aligned
  contextual Event creation. Wizards use spaced steps, compact player controls, clickable empty game
  rows, arrow-only Back, context-aware demonstrator reviews and icon-only final actions. Successful
  new Group/Event creation returns to its list; editing retains its detail return.
- Event details use labelled metadata, a warning phase badge, owner-only manual confirmation in the
  app header with disabled-state explanations, and an edit FAB. Contextual Table summaries omit
  repeated Event metadata, retain excluded/frozen/consent state, and show rating badges, count legends
  and localized remaining-game plurals. Platform UI remains separate; shared Query ownership remains.
- Fresh local verification: workspace typecheck; five coverage suites, **1,358 tests** (API **584**,
  web **304**, mobile pure logic/source contracts **165**, shared **198**, schemas **107**); full
  real-Mongo replica-set integration **73 passed**, three files, zero skips; Node policy **95 passed**,
  zero skips; scoped Biome and whitespace checks. Existing coverage thresholds were not lowered;
  extracted invitation controls, contextual Table summaries and web header actions retain 100% gates.
- API/web production builds and Android Metro export pass. Generated Next type references were
  restored after builds. English/Italian source and compiled catalogs include the new messages.

The earlier interrupted integration runs are not acceptance evidence; the complete 73-test rerun
above supersedes them. Playwright/Maestro suites and CI E2E policy remain unchanged. Unit/source
contracts and compiled exports do not establish native rendering, gestures, E2E or production
acceptance. The reported Members/Rankings loading issue still lacks a reproduced failing HTTP/UI
path and is **not claimed fixed**; prior successful repository probes do not prove otherwise.

## Group and Event wizard follow-up — PR #22 (2026-10-23)

The operator clarified one day and one verified location for every Event, including PRIVATE Groups.
New/edited Table inputs require at least two minimum players and a strictly larger maximum; historical
record shapes remain readable. Location time zones are derived from verified coordinates on the API,
not selected manually. Existing immutable instants and legacy planning clocks are not silently moved.

Both clients now share staged draft validation while retaining platform-owned controls: contextual
Groups are read-only, Next starts enabled then exposes inline errors and waits for corrections,
Back/Next use labelled arrows, player limits use bounded primary counters, and date/location/game
removal stays inside its list item. Reviews use read-only rows and Table cards with rating badges.
Native time selection no longer requires selecting a day first. Group detail has padded cards,
centered tabs, an edit FAB, and roster-only Ban actions with explicit icon-bearing confirmations.

Verification for this follow-up:

- Frozen pnpm graph installation succeeds; only API dependency `geo-tz` was added. No retained
  dependency was upgraded. Only its required post-1970 geographic dataset is traced for deployment.
- Workspace typecheck and all five coverage suites pass: API **583**, web **282**, mobile pure
  logic/source contracts **159**, shared **193**, schemas **106** (**1,323 tests**). Existing 100%
  deterministic gates remain unchanged; the new API time-zone resolver also has a 100% gate.
- Real-Mongo replica-set integration: **69 passed**, three files, zero skips. Node policy suite:
  **95 passed**, zero skips. Scoped Biome and whitespace checks pass. Private local service JSON
  and unrelated worktree changes remain untouched; clean CI owns the full repository lint gate.
- English/Italian source and compiled catalogs are synchronized, including native-only strings.
- Next API/web production builds and Android Metro/Hermes export pass. API tracing includes both
  geographic lookup files and excludes unused datasets. Generated Next type references are restored
  to their original local contents after validation.

No application DB reset/deletion, provider configuration, fixture recreation or manual deployment
was performed. Playwright/Maestro suites and CI E2E policy remain unchanged. This follow-up does not
claim live native, E2E or production acceptance; compiled exports and source contracts are not those
acceptance gates. Earlier evidence below belongs to its recorded baseline.

## Unified domain delivery — previous PR #22 baseline (`9f7f191`)

The active contract is [Groups / Events / Tables](groups-events-refactor.md). Source implementation
now includes both platform editors/results, source-paged group/member/game/table workflows,
moderation/exclusions, explicit consent, exact agreement, duration/cutoff guards, atomic ratings,
new navigation/startup/deep links and legacy-writer retirement. Legacy DB documents remain intact;
unified readers/locks exclude them. No application DB reset/deletion, provider provisioning or
manual deployment/migration was performed.

Verification checkpoint:

- Workspace typecheck passes. Unit coverage gates pass: API 566, web 273, mobile pure logic/source
  contracts 146, shared 175 and schemas 105 (**1,265 tests**). Deterministic per-file 100% gates remain
  enforced; no thresholds were lowered.
- Node policy suite: **95 passed, zero failed/skipped**. The source-policy check now targets the
  actual table score sheet rather than a deleted Match screen. Playwright/Maestro suites and
  workflow/action files are unchanged; PR E2E jobs remain explicitly disabled.
- Scoped Biome checks pass. Root lint is blocked only by a pre-existing, untracked private native
  service JSON formatting issue; it was not edited, ignored or staged to conceal the failure.
- EN/IT source and compiled catalogs are synchronized, including native-only runtime labels.
- Next API/web builds and Android Metro/Hermes export pass. Export validates compilation/assets,
  not installation, launch, rendering, permissions or Maestro acceptance.
- Final unfiltered real-Mongo replica-set suite: **69 passed across three files, zero skipped**.
  Two obsolete Match-based leaderboard fixtures were migrated before this complete rerun.
  Statistics exclude legacy Match outcomes, disabled/removed/planning Tables, all-ND and
  fewer-than-two-finisher outcomes. Legacy documents remain unchanged by unified reads/locks.

Live native acceptance remains unavailable because the previously owned Clerk fixture no longer
exists; no account/device recreation or historical acceptance reuse was attempted. This branch is
not production/E2E-accepted and must not be described as such. Earlier checkpoints below describe
historical contracts and evidence, not authorization to reset data or restore retired writers.


## Mobile organization presentation and location controls — PR #22

- Mobile-only correction requested by the operator: moderation dismisses to the existing list
  instead of replacing its detail with a duplicate list; compact Approve/Reject buttons retain
  full accessible labels, busy guards and the mandatory rejection reason.
- Community labels stay on one line with more room for Organizations. Organization detail
  skeletons have horizontal page padding; status badges retain natural text width and padding.
  Pending friend invitations remain disabled, with their explanation in the existing help popover.
- The shared native location picker moves GPS to the map's lower-right above attribution;
  address search retains its independent clear control. Permission, verified-address and save
  validation behavior is unchanged. Matches, organization and event pickers use this same control.
- EN/IT catalogs compiled; mobile typecheck, 184 mobile unit tests, 512 web unit tests,
  88 CI policy tests and 15 Maestro syntax checks passed. Updated native scenarios cover the
  invitation help and one-Back return from completed moderation; they are not executed acceptance.
- Live native validation was blocked by HTTP 404 for an owned local Clerk fixture during
  read-only ownership attestation. No account was recreated and no device/fixture reset occurred.
  Both PR E2E jobs remain explicitly disabled by operator request; main/manual gates are unchanged.

## PR #22 follow-up after run `38288214637` (`0757693`)

- Branch CI, quality/integration/previews, browser acceptance and development APK passed. Internal
  APK was actually reused after the provenance/configuration/checksum checks; the real checksum
  verified the previous `20261012170046-internal.apk`. Native passed Welcome, complete country/login
  flow and startup deep link (3/13). User/database cleanup succeeded; publication was skipped.
- The next first failure was Contacts after switching to the target: the real Android notification
  permission dialog appeared, `Allow` completed, but `View all notifications` did not return. The
  failure hierarchy showed the Matches screen without a popover. Earlier social actions and target
  authentication reached this point; later shared-session failures are not independent acceptance.
- NotificationBell now opens its controlled popover only after the native permission request
  settles. This avoids mounting a dismissible overlay underneath the system prompt. Inbox access
  is retained on denial/unsupported/native errors and does not wait for push-token synchronization.
  Registration, fresh authorization, permission refresh, invalidation and error feedback remain.
  The existing real permission/menu assertions are unchanged: no extra tap or permission bypass.
- Four executable callback regressions cover pending permission, grant with blocked registration,
  denial/unsupported, close, and native-request failure without loading RN UI in Vitest. Local
  checks passed: 172 mobile tests with unchanged coverage gates, mobile types, 60 workflow tests
  and scoped Biome. Native UI acceptance still requires a new real run/APK for this runtime change.
- The SDK ownership preparation saved the new image/tools key before acceptance. A restore of
  that exact new key remains pending verification; lookup/download alone is not a restore claim.

## PR #22 follow-up after run `38280268845` (`3700551`)

- Both APKs now built successfully with the Gradle memory configuration; Branch CI, quality,
  integration, previews and browser acceptance passed. Native remains 1/13. Owned-user and
  isolated-database cleanup both succeeded; publication was skipped. Full acceptance is still open.
- The strengthened first country-input assertion failed: `inputText: zzzz` produced `zz` in the
  focused search field. Disabling autocorrection and stabilizing the clear slot did not resolve
  rapid injected-key loss. This matches documented [Maestro issue #395](https://github.com/mobile-dev-inc/Maestro/issues/395),
  not weakened country validation. The country flow now sends each character separately and
  acknowledges every prefix before the next key. Empty and DE/IT outcomes, complete values and
  country/calling-code assertions remain mandatory; no retries, sleeps or increased timeout budgets.
- SDK archive download hit the previous key but tar restoration failed on root-owned runner
  `platform-tools` timestamps/modes. Cache ownership is now prepared for only the three cached SDK
  directories before restore; AVD/userdata and unrelated directories remain excluded. A shell
  regression verifies the exact directory allowlist and ordering. A successful restore is not yet
  claimed merely from the earlier lookup/download hit.
- These changes do not alter mobile runtime/build inputs, so the successful internal APK from this
  failed-acceptance run is eligible for reuse only after source, current configuration and checksum
  validation. All current quality, browser and 13 native gates still rerun.
- Local validation: 60 workflow regressions, scoped Biome, parsed action/flow YAML and clean diff
  checks. No additional mobile runtime change or local native-acceptance claim.

## PR #22 follow-up after run `38271024819` (`d9f1d72`)

- Branch CI, quality/integration/build/Preview gates, internal APK and all 83 browser tests passed.
  The development APK failed; Maestro passed 1/13. Owned-user and isolated-database cleanup
  both succeeded; publication was skipped. No full-green or native-acceptance claim is made.
- Development's cold Gradle build reported a 2 GiB heap/512 MiB metaspace, exhausted metaspace,
  then a client `OutOfMemoryError` and `:app:packageRelease` failure. The shared build action now
  uses 4 GiB build heap/1 GiB metaspace, two workers and a separate 512 MiB client heap. Gradle
  user-home properties override generated project defaults without overwriting unrelated settings;
  that configuration remains outside dependency caches. Verified against Gradle 9.3.1 docs:
  [build environment](https://docs.gradle.org/9.3.1/userguide/build_environment.html) and
  [client/build JVM memory](https://docs.gradle.org/9.3.1/userguide/config_gradle.html).
- Native email script, password and device-verification path reached profile completion. The first
  native failure was country search: the command entered `zzzz`, but hierarchy/screenshot showed
  `zzz`, so the four-character minimum correctly retained the complete list. Other authenticated
  flows then failed behind the unfinished profile form; no provider or authorization bypass added.
- Shared native `SearchInput` now disables autocorrection/capitalization and keeps HeroUI's
  ClearButton composed even for empty text. HeroUI hides it while retaining registered padding,
  avoiding the first-keystroke layout change caused by the old conditional composition. All seven
  caller contracts remain; country E2E additionally asserts complete `zzzz`, `DE` and `IT` input
  before checking empty/Germany/Italy results. Search thresholds and debounce are unchanged.
- SDK/system-image cache was actually saved before the failing native acceptance job completed.
  Internal APK configuration digest/checksum generation also passed in the real build. Dependency
  caches exclude Gradle task build outputs, runtime identities, private config and snapshots.
- Local checks: 168 mobile tests with unchanged coverage gates, mobile typecheck, 59 workflow
  tests (including executable Gradle-property and APK-provenance cases), scoped Biome and YAML.
  These are not real native acceptance; both APKs and all 13 native reports must pass on new source.

## PR #22 follow-up after run `38261827367` (`bbf923f`)

- Branch CI and PR quality/build/Preview/APK/browser gates passed. Maestro passed 2/13:
  Welcome and Dark mode. Login failed because the complex inline email-regex expression
  remained a literal selector in Maestro; authenticated flows subsequently failed. Owned-user
  and isolated-database cleanup both succeeded; publication was skipped.
- Exact email verification now computes the pattern in a Maestro JavaScript file and interpolates
  only `output.authEmailPattern` in YAML. Native remembered-text selection, password placeholder,
  timeout budgets and real Device Trust verification remain unchanged.
- Reviewed the downstream native flows against current UI. Organization acceptance now checks
  `Confirmed members`; table acceptance checks the canonical name/count legend and deliberately
  absent repeated venue, retaining fixed date/game help, editing and destructive confirmations.
- Internal APK discovery can use a successful build job from a failed acceptance run. Each
  candidate still requires its own unchanged mobile source/dependency graph, current API URL,
  profile/public/private configuration digest and matching APK checksum. Every current quality
  and acceptance gate reruns. Missing/expired/stale metadata triggers a fresh build.
- Development APKs still embed the immutable development API deployment URL: a new deployment
  changes that build input and therefore requires rebuilding, even without mobile code changes.
- GitHub Actions caches only Android SDK/system-image/tool directories, saving immediately after
  SDK installation so later Maestro failure does not discard the cache. AVD userdata/accounts,
  permissions and snapshots are never cached; fresh AVD, cold boot, KVM guards and teardown stay.
  Gradle caches/wrapper remain cached; removed the unused EAS-local directory cache (builds use
  temporary working directories). No credentials, project build outputs or APKs enter these caches.
- All 57 workflow tests pass locally, including executable checksum/configuration rejection paths,
  plus scoped Biome and changed YAML validation. These checks do not prove native acceptance;
  all 13 real reports and complete PR publication remain required on the next pushed SHA.

## PR #22 follow-up after run `38254813355` (`feaf149`)

- Branch CI and PR quality/build/Preview/APK/browser gates succeeded. Native passed 4/13;
  owned-user and isolated-database cleanup succeeded; publication remained skipped.
- Contacts passed the repaired search/action path and cancelled/resubmitted a real friend
  request. Its first switch to the target failed at Clerk password entry: the floating email
  label positioned the caret inside the remembered actor email, so backspace removed only its
  prefix and target input retained a suffix. The screenshot establishes malformed input, not
  a provider/authentication or Device Trust rejection. Later authenticated failures followed.
- Remembered email entry now long-presses the actual fixture value, selects all when the native
  toolbar offers it (including overflow), and deletes the selection. The helper asserts an
  escaped, exact email match before Continue; a VM-executed regression rejects prefix/suffix
  remnants and a missing literal plus. Password selection and real device verification remain.
  All 52 workflow contracts, scoped Biome and helper YAML validation pass locally; full real
  native execution remains required.

## PR #22 follow-up after run `38247581797` (`3e1829f`)

- Branch CI, PR quality/build/Preview/APK gates and browser acceptance succeeded. Native seed
  verification succeeded, and Contacts exercised named unregistered contacts and later-page
  rendering. Native acceptance still failed: 3/13 flows passed; user/database cleanup succeeded;
  publication was skipped.
- The first Contacts failure was not authentication: its broad search selector tapped the help
  trigger rather than the field, so the visible target was the device suggestion and the popover
  obscured actions. Exact input and user-qualified action labels now drive both social flows;
  subsequent group acceptance uses the current Requests/shared-action confirmation controls.
  The original search-help and action assertions remain, with no forced clicks or skipped flows.
- Clerk clear behavior is bounded: Maestro's default removes only 50 characters, while target
  fixture emails contain 52. Shared sign-in uses the documented maximum of 100 before entering
  actor/target credentials. Local checks pass: all 52 workflow contracts, scoped Biome and three
  changed Maestro YAMLs. Another full real acceptance run is required.

## PR #22 follow-up after run `38240730642` (`7be0731`)

- Branch CI and all PR quality/build/Preview gates succeeded. Playwright passed all 83 tests.
  Both APKs built successfully. Native Welcome, Login (including profile completion with the
  keyboard open), Startup deep link, Profile/logout and Dark mode passed. Eight native flows
  failed; this is not native acceptance or publication success.
- Contacts reached real permission cancellation/approval and help legends, then stopped at the
  address-book fixture. ADB's second shell split spaced names; Android `content` printed
  `Unsupported argument: Unregistered` (and analogous page-name errors) while returning zero.
  Seed bindings now retain remote-shell quotes and verify native display names before acceptance.
  A shell-executed regression reproduces ADB argument joining and rejects missing names.
- Reauthentication appended the actor email to Clerk's remembered Last used field, so no password
  screen appeared and later authenticated flows failed. Shared sign-in now clears both credential
  fields before entering the selected actor/target values; real authentication/device verification
  remains mandatory. All 51 workflow contracts, shell syntax and login YAML checks pass locally.
- Owned-user and isolated-database cleanup succeeded. Browser/native acceptance still needs a
  new complete run before the draft prerelease and Telegram gates may be claimed green.

## PR #22 follow-up after run `38234502015` (`db428ac`)

- Branch CI succeeded. PR quality/coverage/integrations, both API Previews, web Preview and both
  APK builds succeeded. Browser acceptance reached 75/83; remaining failures exposed labeled
  player-limit text, a venue sharing its organization's name, header-owned Leave, and a booking
  fixture missing the distinct profile name. Selectors now preserve those real layout semantics;
  reservation acceptance checks both full name and nickname, without email exposure.
- The password selector repair worked: real Clerk sign-in and device verification reached the
  mobile-number form. Native acceptance then failed because the open keyboard covered Continue,
  causing dependent flows to fail. The form now reuses `ScreenScrollView` inside the established
  keyboard-avoiding layout; Maestro scrolls to Continue without dismissing the keyboard. No phone
  validation, authentication, Device Trust, time budget or real-report requirement is weakened.
- Both owned-user and isolated-database cleanup jobs succeeded. Publication was skipped, not green.
  Local mobile coverage: 167 tests; web/mobile typecheck and scoped Biome pass; all 49 workflow
  contracts pass. New real browser/native execution remains required.

## PR #22 acceptance follow-up after run `38225313430`

- Head `67d9251`: Branch CI succeeded; PR CI failed in browser/native acceptance after quality,
  coverage, replica-set integrations, builds, Preview deployments and APK builds passed.
  Playwright passed 71/83; the 12 failures refer to outdated event/organization card, badge,
  count and Players-tab expectations. Tests now cover labeled sections, authoritative inline
  counts, contextual organization omission, status beside the organization name and Seats.
- Maestro reached password entry, but its broad regex matched the heading "Enter password"
  before the field "Enter your password". The screenshot/hierarchy shows the editable field
  unfocused and empty. The shared login helper now targets only the anchored input placeholder;
  a runnable regression rejects heading, account-hint and password-action text. Credential entry,
  Development Device Trust verification, time budgets and all 13 real-report gates remain intact.
- Local web coverage: 512 tests; native confirmation coverage: 166 tests; web/mobile typecheck
  and scoped Biome pass. Real acceptance on the new commits is still required, not inferred
  from these checks. Native confirmation consolidation is signed as `376c955`.

## Native confirmation-dialog consolidation (local, signed `376c955`)

- The operator's simplified `CommunityConfirm` is now the generic native
  `common/ui/ConfirmDialog`, used by contacts consent/social decisions, groups, ordinary matches,
  result registration, notification deletion, BGG unlinking and organization/event/table actions.
  Small buttons share one row; labeled Close replaces the separate Cancel button and invokes
  cancellation only through HeroUI's open-state handler. Busy actions block submission and every
  dismissal path. Callers retain validation, mutation feedback/rollback and failure retry state.
- Date/time and native permission APIs remain native. `EventDateTimeField` opens Android's picker
  directly; its presentation dialog only hosts the iOS native spinner. BGG connection forms and
  ordinary social menus are not converted into confirmation dialogs.
- `UserActionsSheet` is shared by Contacts, Groups, Matches and OrganizationMembers. Its
  confirmation is a sibling `ConfirmDialog`, never sheet content; a close-state guard preserves
  the selected user while the menu closes to show the dialog. Regressions verify the four shared
  callers, outside-sheet placement and busy/confirmation-aware dismissal.
- Mobile typecheck, 166 unit/source/pure-handler tests with coverage and scoped Biome pass.
  Maestro flows cover Close cancellation before contacts permission, notification deletion,
  group archive/removal/departure, match deletion and BGG disconnection, retaining social action
  IDs. Real native execution of this local refactor is still pending; source checks are not native
  acceptance. Existing PR CI for `67d9251` does not include this signed local commit.

## PR #22 quality and acceptance repair after `5895cc5`

- The failed quality gate exposed native source contracts that still described the old cards,
  table-heading ownership and Players labels. Contracts now assert the implemented sections,
  actual icon legends, Seats-only table labels and full-name/username identity. Native organization
  rows reuse the existing `ListCardBody` with an optional title icon.
- Added web acceptance-unit paths for contextual cards without organization identity and every
  disabled-seat explanation. Existing 100% table/card coverage thresholds remain unchanged.
  Local coverage passes: mobile 163, web 512, API 541, schemas 92 and shared 123 tests (1,431 total).
  Typecheck and all 47 workflow contracts pass. One full web run hit the existing five-second
  country-selector test limit; the unchanged test passed on rerun, without timeout increases.
- Run `38170603100` produced real native reports but failed Contacts and reauthentication.
  Contacts expected an empty connection list while browser acceptance mutated the same users.
  PR provisioning now creates separate web/native actor-target pairs, mirrors all four identities,
  seeds each actor's BGG fixture and explicitly cleans up all four IDs. Native login now selects
  the email method and input placeholders through one shared helper; caller credentials and Clerk
  device verification remain intact. Main/manual callers receive the actor email too.
- These are repairs awaiting a new full PR run, not green native acceptance. Local replica-set
  integration verification did not complete within the command window; CI remains authoritative
  for integrations, real browser/native execution, deployment, cleanup and publication.
  Concurrent mobile edits and private/generated configuration stay outside this repair commit.

## Current table-participation and navigation pass

The operator authorized updating existing PR #22 on `feat/social-api-refactor`, monitoring its
full CI and fixing failures on that same branch. The PR branch was fast-forwarded to `fdfd052`
without rewriting history. No new branch/PR, delegation, provider provisioning, account recreation,
Device Trust bypass, or changes to `main` are authorized. Earlier local-only restrictions remain
historical evidence, not the current push scope.

- Creation/edit headers provide contextual Back independently of wizard step/table/location Back.
- Event/table and match entrances compose the same platform-owned table heading, overview and
  virtualized/paged players. Fixed results, rating views and demonstrator result registration
  retain server authorization. Optional match access is checked through the match API, preserving
  frozen former participants rather than inferring access from current organization membership.
- Empty-place confirmation explains that the existing REQUEST/PENDING booking immediately
  reserves capacity and awaits administrator approval plus an acceptance/rejection notification.
  Admin request decisions use Accept/Reject/Cancel, without organization Ban. Leave/remove actions
  require confirmation. Position hints are local presentation, never persisted physical seats.
- Owner-only contextual table editing uses existing editors and atomic event updates: one changed
  table, no implicit removals, an initial concurrency version, retained unloaded tables, deadline
  guards and explicit reservation-reset confirmation. No booking-domain/service changes were made.
- New Query observers use stable scoped keys, fresh tokens, cancellation and denied-data masking;
  cached content survives ordinary network failures. Native players are not nested in a ScrollView.
- EN/IT catalogs: 678 active IDs each; all 660 previous IDs/translations preserved and compiled.
- Local evidence: lint/typecheck, five coverage gates, **1,418 unit tests**, **63 replica-set
  integrations**, API/web builds, Android JS export (5,512 modules), and six Maestro source/report
  contracts pass. New deterministic helpers, shared table hooks and web table components have
  measured 100% line/function/branch/statement coverage.
- Browser desktop/mobile-width scenarios and the real native draft flow were updated but not run
  locally. Controlled Playwright community responses are rendering checks, not live API/provider
  acceptance. Published native pending-approval/notification/frozen-result paths still need actual
  acceptance against a moderated organization; exports and source contracts do not prove them.
- Protected API/web generated types were restored byte-for-byte. Private configuration, environments,
  historical artifacts/resources and unrelated work remain excluded from the task commit.

- Full PR run `38074656882`: all 12 initial quality/build gates passed; both remote API builds
  failed resolving workspace packages after restoring the same Vercel cache. Cleanup passed;
  APK/E2E/publication did not run. A minimal pnpm 11.25 hoisted-workspace reproduction confirmed
  that cached installs do not restore missing workspace links, even with `install --force`.
  The shared deployment action now uses `vercel deploy --force` without `--with-cache`; this
  bypasses remote build cache while retaining frozen dependency versions and all isolation guards.
  Regression checks cover Preview and Production flags. Run `38075709178` verified both remote
  API builds, then attempt 1 stopped at authentication. After the operator corrected the key,
  attempt 2 passed both database attestations and seeded its isolated database. It failed on a
  redundant webhook-domain PATCH (the domain was already bound to the exact PR branch) and on
  database cleanup using the repository Clerk key instead of the `development` environment key.
  PR consumers and cancellation cleanup now select `development`; the alias step verifies and
  reuses an already-correct Preview binding, and still verifies any changed binding before aliasing.
  The same environment-selection defect rejected the repository Expo token. APK builds and
  draft publication also select `development` for Expo, release and Telegram credentials.
  No secrets, Git-provider connection or Production configuration were modified. The independent
  cancellation-cleanup workflow is not yet present on the default branch; it cannot currently
  supply fallback cleanup. Attempt 2 database cleanup remains unverified until explicitly recovered.
  Full APK/browser/native/publication acceptance still requires a new successful PR run.
- Run `38079278200` verified both API deployments, the webhook alias, Web Preview, provisioning,
  mirroring and both cleanup jobs. Both APK jobs stopped before compilation because Expo rejected
  their bearer token; the APK environment-scope fix was not yet in that run. Playwright recorded
  69 passed / 14 failed / 0 skipped: rendering assertions still targeted old card text, invitation
  actions and booking labels, and the seat assertion included navigation list items. Those selectors
  now match the accessible UI and scope the chosen seat to Players; invitation cancellation remains
  covered before confirming either choice. Browser evidence also exposed a real desktop confirmation
  overflow: three non-wrapping buttons pushed Cancel outside the dialog, under its backdrop. Shared
  confirmation actions now wrap, with unit and browser hit-target regressions. The direct organization
  list URL now redirects into the existing Community organization section instead of losing its tabs.
  Local lint, web coverage (508 tests), web typecheck/build and all 34 workflow regressions pass.
  An isolated Chromium check with the compiled CSS reproduces the missed Cancel hit target before
  wrapping and verifies all buttons remain clickable at 320/768/1280px afterward; this is not app
  acceptance. That checkpoint did not yet prove APK/native/publication success; the next run is
  recorded below.
- Run `38082278542` completed with all 12 initial gates, both API deployments, Web Preview,
  provisioning/mirroring, **both APK builds** and both cleanup jobs passing. Expo environment
  selection is now verified by successful compilation, not just workflow inspection. Playwright
  improved to **77 passed / 6 failed / 0 skipped**. Remaining tests now target the searchbox role,
  reselect Events after reload, inspect the visible Next action instead of its `display: contents`
  wrapper, and await menu focus, complete dismissal and restored trigger focus before reopening.
  Five isolated Chromium focus/Escape/reopen cycles with installed HeroUI/React Aria pass; this is
  not authenticated application acceptance. Maestro passed the first three flows, then flow 05
  failed waiting for a contacts prompt; the remaining nine flows were not run. Its initial
  `launchApp` implicitly granted every permission, so the native prompt was absent. The launch now
  explicitly leaves contacts and notifications denied without clearing session data; denial/retry
  and actual grants remain required. The deny-button selector accepts straight or typographic
  apostrophes. No app permission policy, Device Trust or acceptance gates were weakened. Local
  typecheck, 162 mobile unit tests, 83-test Playwright discovery and all 35 workflow/source
  regressions pass. These combined corrections require the next full PR run; publication and
  complete web/native acceptance remain unverified.
- Run `38087033020` verified the initial gates, deployments and both APK builds again. Playwright
  advanced to **81 passed / 2 failed / 0 skipped**: both failures reach creation and expose a fixture
  responding to the obsolete root POST instead of the actual contextual
  `POST /api/organizations/:organizationId/events`. The local fixture and request assertion now
  follow the controller and shared hook. Maestro passed welcome, login and the startup deep link,
  then flow 05 passed the initial contacts permission prompt/denial and failed asserting the help
  popover title after tapping its trigger. The capture did not retain a UI hierarchy, so exact native
  positioning cannot be established from that run. Installed HeroUI content requires asynchronous
  native measurement before entering; help and legend checks now explicitly wait for visible portal
  content, retaining all title/body assertions. The same transition guard covers the game and
  organization search helpers. This remains a CI hypothesis to verify, not native acceptance.
  Both user/database cleanup jobs succeeded before the next push. Native CI is also split into visible
  SDK/AVD/boot, APK/callback, warm-up, address-book and individual flow steps in PR, main and manual
  workflows. One job-scoped emulator and the same authenticated session survive those steps; failed
  boot kills its process, and always-run teardown stops a successful boot and preserves diagnostics.
  All 13 flows retain their order, distinct real JUnit reports and fail-closed verification. Failure
  video now covers the actual failing flow rather than only the first 30 minutes of the suite.
  No timeout, acceleration, authentication or acceptance policy changes are included. These local
  orchestration changes are not yet verified by a full CI run.
- Run `38091991376` verified all initial gates, deployments, both APKs and **83/83 Playwright
  tests**. Native preparation and the shared emulator survived the split steps, but the Welcome
  flow failed; later flows were not executed. Both cleanup jobs passed. Recorded native timings
  show 417 seconds for boot and 1,036 seconds for address-book seeding with CPU acceleration
  explicitly disabled. Boot now requires a readable/writable `/dev/kvm`, applies the documented
  ephemeral-runner udev rule, checks `emulator -accel-check` and uses `-accel on` without a silent
  software fallback. Emulator lifetime, cold-state isolation, flow order and timeout/report gates
  remain unchanged; no snapshot cache or parallel sessions are introduced. This requires verification
  on the next real Linux runner and does not yet prove the native failure resolved.

Status: **IMPLEMENTED; PR ACCEPTANCE INCOMPLETE**. Local quality gates and remote Branch CI
pass; full PR/native acceptance remains pending. Do not describe the feature as production-ready or claim full acceptance
coverage. The operator requested local feasible checks followed by signed commits/push and CI
iteration instead of further local-emulator cycles. Real Inngest provisioning/delivery is excluded.

## Historical authority and isolation

This records the original implementation pass, not authorization for subsequent tasks. Earlier
local-only scopes below permitted local commits only; the current pass above supersedes their push
restriction; current authorization permits updates only to existing PR #22, not delegation,
provisioning, new PR creation or merges to `main`.

- Branch `feat/organizations-events`, based on authorized PR #22 head `b83e30e`, not `main`.
- Worktree `D:/git/board-game-organizer/.worktrees/organizations-events`.
- Signed commits/push and updating existing PR #22 are explicitly authorized. No new PR,
  delegation or merge to `main` is authorized. PR #22's `feat/social-api-refactor` was fast-forwarded
  to feature head `b264374`; keep subsequent fixes synchronized with `feat/organizations-events`.
- Original worktree/index is preserved. Its generated API `next-env.d.ts` currently points to
  development types; do not reset that unrelated generated change or the user's other work.
- Approved behavior: `docs/organizations-events.md`.
- Operational/release requirements: `docs/organizations-events-operations.md`.

## Implemented

- Strict organization/event/table/booking/logo/deadline schemas, models, indexes and migrations.
- Clerk username mirroring/repair/backfill and fresh server-owned moderator authority.
- Transactional organization revisions, moderation, name reservations and membership lifecycle.
  Approved information remains operational during private proposals or rejected corrections.
  Requests do not require friendship; invitations do. Exclusions and private membership/proposal
  visibility are enforced on the server.
- Authenticated, bounded, retry-safe chunked logo uploads; MIME/decode/pixel/animation validation,
  EXIF removal, optimized square WEBP previews and unclaimed-asset expiry. Replaced unreferenced
  logos are released without expiring an asset still used by an approved/proposed revision.
- Verified MapTiler locations with canonical stored addresses/coordinates, not unverified text.
- Source-paginated event/table/booking/member lists, event CRUD, invitations and reservations.
  Partial edits preserve unloaded tables and remove only explicit IDs. Pending reservations
  reserve capacity/overlapping time; only confirmed players count toward the minimum. No implicit
  administrator/demonstrator seat or waitlist.
- Organization-before-event transactional locking, stale revision protection and rollback when a
  transaction crosses the cutoff. **Private drafts also freeze at the exact cutoff.**
- Versioned, database-scoped durable deadline outbox, signed Inngest endpoint, sleepers, retry-safe
  notifications, five-minute recovery and read fallback. Publication now permits missing Inngest
  configuration by explicit operator request; autonomous closure/recovery still require it.
  Local tests do not impersonate a registered production provider.
- Fixed table matches and frozen explicit booking rosters. Ordinary match planning/voting/deletion
  is suppressed. Owner/demonstrator results preserve departed/excluded historical participants,
  optional GLOBAL OpenSkill and atomic immutable finalization. Cancelled tables are excluded.
- Web/native Events navigation and Groups / Organizations / Search. Approved-organization/public-
  group discovery has four-character minimum, 300 ms debounce and pagination; public-group joining
  remains explicitly unavailable. Web tabs now associate their content with an accessible panel.
- Web/native organization create/edit/logo/friend-picker and moderation/member screens. Camera,
  gallery, denial and Settings/AppState permission handling; image-only native permissions. Native
  organization creation now has an accessible `FloatingActions` entry point in the owned list.
- Web/native event information → tables → review wizards, authorized organization/game/demo
  selection, empty initial event location, default 24-hour cutoff, retained failed drafts and
  confirmation of destructive edits. Unchanged wall-time input preserves stored seconds/DST
  instant; invalid/nonexistent local times are rejected.
- Fresh-token, API/user-owned Query caches; selective optimistic snapshots/rollback and canonical
  detail/list reconciliation. Booking mutations carry their owning event ID. A cutoff causes one
  owning-event revalidation, not polling; useful cached fields survive recoverable failures.
- Fourteen community notification kinds with EN/IT copy, icons, scoped invalidation and validated
  native event/table deep links. Event matches link back to the owning table on both clients.
- Shared/native-only runtime messages and compiled catalogs, including recent table statuses and
  the event-table link. Logo bounds are checked before browser file reads or shared base64 decode.

## Latest verified automated gates

### Event detail tabs and match-table legend — local only

- Same feature branch, signed local commit only; no push, PR synchronization, delegation,
  provisioning or service/account/device changes. Protected API/web environment types are
  checked/restored byte-for-byte; the existing API change is excluded from the commit.
- Matches replace the Event table text tag with one accessible calendar icon below the artwork
  at bottom-right. Administrator crowns remain. Table list / Lista Tavoli follows filters and
  reuses the platform question-mark popover with both symbols and localized explanations.
  Ordinary invitation controls remain absent for event-table matches.
- Event detail uses Details / Tables with existing HeroUI tabs and native TabBar. Details reuse
  the planets event card without organization identity or table count; confirmed participants,
  status, day/times/address, deadline and the post-cutoff information remain. Tables reuse one
  platform table-card body from the wizard, preserving fixed covers/fallbacks, time-only fields,
  name/game/player limits, optional demonstrator and enabled-rating badge. Read-only navigation
  retains confirmed/reserved totals and status, with no row edit/removal.
- Cancel is a labeled danger icon in the header. Edit is the shared bottom-right icon FAB outside
  both panels, guarded by server modification rights and the exact cutoff. The web FAB is extracted
  from the existing organization edit/create links; their destinations and tab behavior remain.
  Confirmation/busy/failure guards remain, including cutoff rechecking before cancellation.
  Denied native details clear the old resource title/header action. Table requests are tab-scoped;
  pagination retains cache, skeleton/error/retry paths and native virtualization.
- Verified: Biome, workspace typecheck, **1,318 unit tests** (web 427, mobile 152, API 536,
  schemas 92, shared 111), all five coverage gates, API/web production builds and Android export
  (**5,497 modules**). New/readjusted web card/body/detail/FAB/legend modules have 100% per-file
  thresholds; no threshold was reduced. Six Maestro CI/JUnit contract tests pass with no skips.
- EN/IT extraction/compilation preserves all 656 prior IDs/translations and has **660 active IDs**
  each. Desktop/mobile-width Playwright scenarios cover icons/legend, both detail tabs, read-only
  table metadata, paging/failure/retry, contextual controls and explicit cancellation. Native
  match/draft flows now check legend, tabs and contextual header/FAB behavior.
  **These browser/device scenarios were not executed**: mocked fixtures, source contracts and
  export are not native/provider acceptance. The UI-only pass did not rerun replica-set integration;
  the preceding API/count pass retains 63 passing integrations. No remote CI result is claimed.
- Guides used: component architecture/composition, existing Query and platform rendering guidance,
  Expo navigation, HeroUI React/Native, Lingui/Uniwind and fresh web-design review. No package or
  skill changes. The later request for wizard Back and a unified bookable table detail is pending.

### Previous community event/organization cards and empty lists — local only

- Same feature branch, signed local commit only. No push, PR synchronization, delegation,
  provisioning, migration or account/device changes. API and web environment-type files are
  restored and checked byte-for-byte against their pre-build copies; the user's existing API
  change remains outside the commit.
- Platform event cards use locally generated DiceBear planets artwork, approved-organization
  identity, event name, local day/time, venue/address and server table/participant counts. Published
  and Draft retain success/warning top-right badges. Platform ListCard frames now serve linked
  cards and organization details; native padding is explicit rather than doubled by Surface.
- Organization details keep name/status together, logo left, venue/address and confirmed-member
  count including creator plus published-event count right. Leave is a danger icon in the page
  header; pending-request Cancel is an icon at the card's bottom-right. Separate invitation choices
  confirm only the selected action. The existing Members/list-row response dialog, private roster
  guards, exclusion semantics and destructive confirmations remain.
- API counts published (not draft/cancelled) events and distinct users with confirmed bookings on
  active tables, including retained/unloaded records. Query settlement revalidates owning event
  cards after booking changes and owning organization counts after event lifecycle changes;
  foreign API/user scopes and unrelated organizations/private member queries stay untouched.
- Existing EmptyList primitives now cover remaining item/card empty states, including discovery,
  events/tables, user/friend and game pickers, country/address/favorite lists and notification
  previews. Loading/failures are not empty success. Linked cards retain visible inset keyboard
  focus; icon-only actions have labels, long text wraps and dates/counts use the active locale.
- Verified: Biome, workspace typecheck, **1,294 unit tests** (web 406, mobile 149, API 536,
  schemas 92, shared 111), all five coverage gates, **63 replica-set integration tests with no
  skips**, API/web production builds and Android export (**5,494 modules**). New web event/detail
  cards and common frame/empty primitives have 100% per-file thresholds; existing thresholds were
  not reduced. Six Maestro CI/JUnit contract tests pass, with no skips.
- EN/IT extraction/compilation: **656 active IDs** each, all prior 647 IDs/translations preserved.
  Playwright desktop/mobile-width scenarios and Maestro draft/invitation helpers were updated.
  **They were not executed**; export/source contracts/unit fixtures do not establish browser,
  native device, APK or provider acceptance. No remote CI result is claimed.
- Guides used: project component architecture, composition, TanStack Query/Expo fetching,
  HeroUI React/Native, Uniwind, Lingui and web-design review. No dependency or skill installation.

### Previous one-day event wizard and compact member controls — local only

- Same `feat/organizations-events` branch; signed local commit only, no push, PR changes,
  delegation, provisioning, migration, or account/device reset. The user's API environment-types
  change is preserved byte-for-byte and excluded.
- Membership requests now use inline icon/text Accept / Reject / Ban on one row and Cancel below.
  Other confirmation callers retain their existing layouts and busy/snapshot guards. The shared
  native social sheet remains mounted closed without a selection: HeroUI's installed implementation
  snaps only on a closed-to-open transition, so mounting it initially open had hidden the first menu.
- Native filter chips have a 32px visual height with a 44px parent/touch area and vertical hit slop;
  web chips use reduced height/padding. Selection, semantics and labels remain unchanged.
- Events again require the same **local** day, strict start/end ordering and at most 20 tables.
  Schema validation includes UTC-day crossings and DST; transactions count retained/unloaded tables
  plus additions minus explicit removals. No existing data is migrated or silently removed.
- Event detail step: name-specific help, one date-only picker with help, paired native/browser
  time-only pickers with shared help, and the event-address label. Tables show date-only Event day,
  paired times and the limit help. Review shares that platform-owned summary with name and venue.
  Table editors have header Back, time-only strict ranges (including current table end), fixed-size
  card covers, time-only rows and the bottom-right enabled-rating badge.
- Android's native time picker cannot enforce min/max; invalid selections are rejected with a
  visible localized error, not clamped or replaced by a custom minute list. Submit-time timezone/DST
  validation and unchanged stored-second precision remain active.
- Verified: lint, workspace typecheck, **1,274 unit tests** (web 391, mobile 146, API 534,
  schemas 92, shared 111), web/mobile/schema/shared coverage gates and **62 replica-set integration
  tests with no skips**, API/web production builds and Android bundle export. New/shared deterministic
  date/count logic and the measured web primitives retain 100% per-file coverage gates.
- EN/IT extraction and compilation pass: **647 active IDs** in each catalog; all previous 630
  IDs/translations retained. Playwright and Maestro scenarios/helpers were updated for native date
  and time pickers, invalid bounds, header Back, row geometry, summary and the rating badge.
  **They were not executed**: builds/export/source contracts are not browser/device acceptance.
  No APK, provider execution or remote CI verification is claimed for this pass.

### Previous organization member dialogs and review controls — local only

- Operator scope: same `feat/organizations-events` branch, signed local commit only. No push,
  PR, provisioning, delegation or changes to the unrelated API `next-env.d.ts`.
- Pending membership requests show icon-bearing Accept / Reject / Ban / Cancel on one row
  (Accetta / Rifiuta / Banna / Annulla). Organization exclusion remains separate from global
  social blocking. The shared dialog row layout is opt-in; existing callers retain their layout,
  busy guards and cancellation behavior.
- Review reuses the platform question-mark help label for Manage organization and adds a
  localized Reject reason placeholder. Approve/Reject stay on one row. Native icon-bearing
  buttons now use explicit `Button.Label`: the installed HeroUI implementation cannot wrap
  mixed icon/raw-string children automatically. A TypeScript-AST source regression checks all
  review button labels; this is not native rendering evidence.
- Verified: full Biome lint, workspace typecheck, 1,266 unit tests (web 387, mobile 144, API 533,
  schemas 92, shared 110), web/mobile coverage gates and EN/IT compilation. Shared web dialog
  has 100% statements/lines/functions/branches with an explicit per-file threshold. Catalogs
  retain all 626 previous IDs/translations and add four localized messages each.
- Playwright now checks management help, placeholder, request order and real button geometry at
  a 360px viewport. Native membership helper and a fixture-scoped moderation helper are updated.
  These flows were not executed; browser/native acceptance remains incomplete. No build, APK,
  integration/provider verification or remote CI was run for this UI-only correction.
- Skills used: `bgo-component-architecture`, `vercel-react-best-practices`,
  `vercel-react-native-skills`, `expo-overview`, `heroui-react`, `heroui-native`, `uniwind`,
  `lingui-best-practices`, `playwright-best-practices`, `web-design-guidelines`, `ponytail`,
  `context-mode`. No skills or dependencies installed/changed.

### Previous multi-day event/table wizard and member social menus — local only

- Explicit operator scope: current feature branch, signed local commit only; no push, delegation,
  provisioning or account/device bypass. Preserve pre-existing API environment types byte-for-byte.
- Multi-day event creation/edit validation; dynamic minute picker bounds with exact stored instants
  retained. Tables use strict contained editor intervals, bounded player steppers, game/member rows,
  removable demonstrators, inline errors, icon Save and match-style draft cards with covers/details.
- Match/event wizards share numbered themed step indicators. First event page has no Back action;
  demonstrator Back belongs to its header. Location precedes compact deadline input with dedicated
  help; both organization/event wizards resolve selected-location favorite status before toggling.
- Membership rows expose membership actions plus social ellipsis only. Common native HeroUI social
  sheet serves contacts/groups/matches/organizations; friends retain follow/unfollow menu actions.
  Request dialog order is Accept / Reject / Ban from organization / Cancel, all with icons.
- Inngest is optional by explicit request. Draft saving/publication retain organization approval,
  table validation, transactional outbox, exact-cutoff guards and idempotent authorized-read closure.
  Without a configured worker, autonomous execution/recovery is unavailable. A real replica-set test
  proves missing-key draft/publication, outbox retention, cutoff rejection, freezing and replay.
- Local gates: Biome, typecheck, localization compilation; **1,251 unit tests** (web 374, mobile 142,
  API 533, schemas 92, shared 110); **61 replica-set integration tests**, zero skips. New deterministic
  form/range logic and web date/card/step components meet their 100% per-file coverage thresholds.
- API/web production builds and Android JavaScript export (**5,489 modules**) pass. EN/IT preserve all
  591 prior IDs/translations and add 35 translated messages. No dependency or environment-value changes.
- Updated Playwright/Maestro flows are **not executed**. No fresh APK, native rendering, browser or
  real-provider acceptance is claimed; broader PR/native acceptance remains incomplete.
- Guides applied: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`, `expo-router`,
  `heroui-react`, `heroui-native`, `uniwind`, `tanstack-query-development`, `lingui-best-practices`,
  `playwright-best-practices`, `web-design-guidelines`, `ponytail`, `context-mode`.

### Organization requests and event information — local only

- Organization submission has no top separator and extra safe-area/bottom clearance; native Camera
  and Photo library buttons share one row. Member social menus use vertical ellipses. A pending
  request has one icon opening Accept / Reject / Ban from organization; an outgoing invitation has
  one confirmed cancellation action. Recipients get one Accept / Reject dialog, including on the
  private Members tab without roster access. Open management targets retain the displayed
  membership kind/status and fail closed if it changes; busy/access checks and selective Query
  rollback remain owned by the existing hooks. Global contact blocking is unrelated.
- Both event wizards have information help, a name example, single calendar/date-time and verified
  address/favorite rows, and bottom navigation with an arrow and scroll/keyboard clearance. Time
  zone is hidden, not removed from validation: new events use the local zone and edits retain the
  stored zone. Native Android chains date then time; iOS has a cancellable combined picker.
- Booking deadline is a positive numeric elapsed-hour offset, default **24**, converted to the API's
  ISO instant. Existing fractional/second/millisecond offsets round-trip; unchanged event seconds,
  DST overlap instants and hidden zones remain intact. Missing DST wall times and invalid/zero
  durations fail validation. Deadline-only edits reschedule closure without participation resets.
- Local checks: full Biome/typecheck, compiled EN/IT catalogs, **357 web / 141 mobile / 103 shared
  tests (601 total)** with coverage, web production build and Android JS export (**5,484 modules**)
  pass. Shared deterministic form/action logic and the new web date/invitation components retain
  **100%** line/function/branch/statement thresholds. Mobile source contracts do not measure native
  rendering. No API/schema/integration rerun is claimed for this UI/shared-helper change.
- Playwright organization/event cases and Maestro flow 13/member helper now use the dialogs and
  calendar fields. The isolated recipient helper requires explicit fixtures and both decisions;
  member-helper fixture requirements are documented in its header. These browser cases use mocked
  domain responses and the updated authenticated/device flows have **not** run. No fresh APK,
  device/iOS acceptance, real provider delivery or production verification is claimed; existing
  account/device blockers are not bypassed.
- Work stays local on `feat/organizations-events`: no push, new PR, delegation, account recreation or
  provisioning. Preexisting API environment-type bytes and private configuration are preserved.
- Guides used: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`, `expo-data-fetching`,
  `tanstack-query-development`, `heroui-react`, `heroui-native`, `uniwind`,
  `lingui-best-practices`, `playwright-best-practices`, `clerk`, `clerk-testing`,
  `web-design-guidelines`, `ponytail` and `context-mode`.

### Previous search inputs, filters and help reuse — local only

- Each client now composes its own `SearchInput`, `FilterChips` and `HelpPopover` in
  `src/components/common/ui`. List searches, contacts, user/game pickers, group game selection,
  country selection and verified-address search reuse the input. List/game filters share semantic
  selected/unselected variants instead of fixed gray/white colors; native chips use real 44 px touch
  targets rather than relying on hit slop clipped by a compact parent. Search/field labels and contact legends share the help
  container; native voting legends use it too. Web voting tooltips retain their existing hover/focus
  interaction rather than being forced into a popover.
- Controllers still own debounce, queries, filters, permissions, selected-address invalidation and
  navigation. The plain input imposes no four-character rule on country selection. Existing native
  IDs, translated labels and bounded contact-legend scrolling/keyboard dismissal are preserved.
  Web address lookup explicitly opts its independent geolocation button out of React Aria's
  search-field clear-button context (`slot={null}`); regression tests cover both the independent
  action and opening help without clearing the query.
- English/Italian source catalogs were extracted and compiled. Web primitive/label components keep
  **100%** line/function/branch/statement thresholds. Full Biome/typecheck and local coverage:
  **346 web / 137 mobile tests** pass; native source contracts are not native rendering acceptance. Web production build and
  Android JS export (**5,483 modules**) pass. Playwright match-wizard and Maestro flow 06 now cover
  shared help, selected filters and conditional clear; these authenticated/device flows have **not**
  been executed. Existing authentication/device/provider blockers remain, with no bypass or
  account recreation. API/integration suites were not rerun for this client-only presentation pass.
- Current work is local on `feat/organizations-events`: no push, new PR, delegation or provisioning.
  Preexisting API `next-env.d.ts`, generated web environment types and private configuration are
  preserved outside the commit.
- Guides used: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`, `heroui-react`,
  `heroui-native`, `uniwind`, `lingui-best-practices`, `playwright-best-practices`, `clerk-testing`,
  `web-design-guidelines`, `ponytail` and `context-mode`.

### Previous mobile layout and row reuse — local only

- Mobile common UI now owns `UserList`, `UserListRow`/`UserAvatar`, `AddUserRow`, `TabBar`,
  `ScreenScrollView` and `ListCardBody`. Contacts, organization members/friend picker, group/match
  members and invitation slots reuse them. Discovery also uses the common card body; public
  groups remain read-only rather than acquiring unauthorized navigation/join actions.
  `GameListRow` and `LocationListRow` stay in their
  feature folders and serve pickers, wizards and match details. Existing `LinkedListCard` keeps
  navigation and invitation actions; artwork, votes, favorites and permissions remain feature-owned.
- Organization tabs use the same 20 px page inset and 12 px tab/content gap as group/contact
  details. FAB position and scrolling clearance both use `useFloatingActionLayout`, scoped to the
  owning navigator (tab offset 16; stack offset 100), plus safe-area inset. Callers no longer choose
  incompatible offsets. The match wizard no longer applies the bottom inset twice to its FAB;
  the iOS date picker retains its own safe-area container. The fixed organization submit bar is
  unchanged.
- User pagination remains virtualized and ordered, with explicit error/retry and next-page
  skeletons. Privacy denial still hides cached organization people and their action targets.
  No data/query ownership, API authorization, dependencies or web behavior changed. All visible
  labels reuse the existing EN/IT catalogs. The match Maestro flow targets the stable create FAB
  ID instead of a screen-coordinate guess; existing member/organization selectors are preserved.
- Local checks: full Biome/typecheck, **123 mobile tests** with coverage, and Android JS export
  pass. The deterministic FAB/pagination helpers meet **100%** line/function/branch/statement
  thresholds. Source-structure guards are explicitly not runtime UI tests. No fresh APK, device
  screenshots, Maestro execution or authenticated acceptance is claimed; the existing native/auth
  blockers remain. API/web/integration suites were not rerun for this native-only refactor.
- Work remains on `feat/organizations-events`, local only: **no push**, no new PR, no delegation,
  no account/device/provider changes. Preexisting API `next-env.d.ts` and private configuration
  stay untouched and outside this change.
- Guides used: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-native-skills`, `expo-overview`, `expo-router`, `expo-design-system`,
  `heroui-native`, `uniwind`, `ponytail` and `context-mode`.

### Previous organization UX pass — local only

- Creation has field help, one Upload source selector, the match-style verified address/favorite
  row, and a fixed send-icon submit bar with safe-area clearance. Detail has Details / Members /
  Events tabs, status/edit controls, ordered paginated member feeds and contextual event creation.
- Ordinary removal is LEFT (new request/invitation allowed); explicit exclusion is organization-only
  EXCLUDED until revoke. Global social blocking remains separate. Cancelled bookings never revive.
  Member responses include name/username but no email or incoming block flags. Social rollback is
  field-selective; membership rollback preserves unrelated rows, later pages and cleared caches.
- All five unit coverage suites pass: web **338**, mobile **79**, API **533**, schemas **92**, shared
  **92** (**1,134 total**). The new ordered/social hooks and changed organization cache logic meet
  100% deterministic thresholds. Replica-set integration: **59 passed, zero skipped**. Biome,
  typecheck, CI-script checks, API/web production builds and Android JS export (**5,470 modules**)
  pass; this is not a new APK or device run.
- Playwright desktop/mobile-width expectations and native flows 12/13 are updated. The separate
  [native member acceptance helper](../apps/mobile/.maestro/helpers/organization-members.yaml)
  requires an isolated approved organization, signed-in creator and the named fixtures in its
  header. It deliberately does not join the thirteen-flow CI suite without those fixtures.
  These updated authenticated/device paths have **not** been executed in this pass; no live
  provider or release acceptance is claimed. Deleted-account, native-permission and provider
  limitations below remain unresolved; no accounts/devices/services were changed to bypass them.
- Current operator scope permits a signed **local commit only, no push**. Historical push/PR
  authorization below is not authority for this pass. Generated API environment types and all
  private configuration are preserved and excluded from staging.
- Guides used for this pass: `bgo-component-architecture`, `vercel-composition-patterns`,
  `vercel-react-best-practices`, `vercel-react-native-skills`, `expo-overview`, `expo-router`,
  `heroui-react`, `heroui-native`, `uniwind`, `tanstack-query-development`,
  `lingui-best-practices`, `playwright-best-practices`, `web-design-guidelines`, `ponytail`
  and `context-mode`.

### Historical foundation evidence

- Signed feature commit `9ea1502` is pushed on `feat/organizations-events`. [Branch CI run
  37758173173](https://github.com/BGOrganizer/board-game-organizer/actions/runs/37758173173)
  completed successfully: all **9/9 jobs**, including commitlint, Biome, typecheck, five unit suites
  and real MongoDB integration. That Branch CI run did not include APK/deployment/E2E jobs.
- PR run [37760031018](https://github.com/BGOrganizer/board-game-organizer/actions/runs/37760031018)
  passes quality/coverage/integration/build gates. Attempt 1 failed on Preview configuration;
  attempt 2 verifies API deployment, isolated DB seeding, user provisioning and both APK builds.
  Preview-only Config corrections temporarily unblocked the old prebuilt deployment. They are
  not durable with Infisical's Secret-only sync. Deployment now uploads source for Vercel's
  remote build; no environment pull, local Vercel build or prebuilt output is used. Remote build
  validates real public keys and the base non-CI DB/webhook pair before applying the CI database
  override. Runtime attestation still precedes seeding. No Infisical sync, Production or CORS
  settings were changed.
- Attempt 2's nominally green Maestro job is **not runtime acceptance**: direct script interpolation
  inside double-quoted `bash -c` truncated execution at `echo "APK found..."`; synthetic JUnit
  hid missing tests. Shared wrapper now transports script through an environment variable,
  preserves failures/cleanup, writes per-flow real XML and rejects missing/skipped/fabricated
  reports. Group/invitation/wizard/deep-link flows join the existing CI suite; fixture-dependent
  `11-match-join-requests` still requires a separately prepared `PUBLIC_MATCH_LINK`.
- Five workspace coverage suites pass: API **525**, schemas **78**, shared **91**, web **302**,
  mobile **77** tests: **1,073 unit tests**. All five suites were rerun successfully; existing
  thresholds were not lowered. The **30** CI-script checks pass, including executable shell
  quote/exit/pipefail tests, remote build/runtime override guards, real remote-build configuration
  checks and fail-closed real-JUnit validation. All are invoked by CI lint.
- PR run [37770204625](https://github.com/BGOrganizer/board-game-organizer/actions/runs/37770204625)
  passed quality/deployment/provisioning gates; Playwright reported **43 passed / 3 failed**.
  Fixes replace the obsolete Organizations placeholder assertion and make the inaccessible-event
  interception query-independent. Maestro genuinely passed launch, login and startup deep-link;
  contacts flow then failed waiting for the native contacts permission prompt. Remaining flows
  were not executed. The run finished failed; no native green or remote-build acceptance is claimed.
- First remote-build PR run [37779918729](https://github.com/BGOrganizer/board-game-organizer/actions/runs/37779918729)
  passed quality gates but both API builds invoked the repository-wide Turbo build, which also
  tried building Web with API-project environment values. Per-deployment configuration now selects
  only the API or Web workspace and its `.next` output; project settings/Secrets remain unchanged.
  Remote deployment acceptance is still pending.
- Remote-build migration local checks pass: full lint/typecheck, **525 API tests**, **30 CI-script
  tests**, and API/web production compilation. A local browser retry using the old private runner
  account could not authenticate: that CI user no longer exists (**24 failed / 1 passed**, before
  the authenticated acceptance assertions). No Clerk user was recreated or changed locally.
- Native development Lingui crash: HeroUI's sibling portal host was outside `I18nProvider`;
  a search-help consumer mounted in a Select overlay lost its context. Lingui now wraps HeroUI;
  dependencies/hooks were not changed. Root-provider contract regression, mobile lint/typecheck
  and all mobile logic tests pass (original checkout **60**, feature checkout **78**). Debug-device
  reload/runtime confirmation remains with the operator; no emulator was booted for this fix.
- Added 100% deterministic gates include event form/roster/logo helpers, event queries/window,
  public-group queries and deadline delivery/workers. Native push-routing gate is retained.
- Historical real MongoDB replica-set integration run: **54 passed**, **zero skipped**, status **0**,
  including private-draft cutoff behavior. The latest Windows rerun after a PC restart did not
  produce a terminal result before the host execution deadline; this is not a new passing run.
  Linux Branch CI subsequently verified **3 files / 54 tests passed**, with no test skips, on
  `9ea1502`. Clerk moderator/location/provider boundaries are controlled in integration tests;
  they are not external-provider evidence.
- Repository typecheck passes (4/4). Latest full lint passes (4/4); generated export metadata was moved outside app source rather than weakening lint.
- API production build passes. Latest web production rebuild passes, including singular semantic header links and the accessible
  community tab panel.
- Frozen installation, peer check and offline Expo dependency matrix check pass. Android production JS export passes.
  A wrong relative MapTiler asset path in the extracted native location picker was fixed and
  covered by a static-asset regression before rerunning export.
- Fresh **x86_64 release APK** compiled successfully and installed on the existing Pixel_9_Pro
  emulator **without clearing app data**; baseline APK was backed up first. This is a local test APK,
  not an arm64 production publication or iOS build.
- Windows native build initially failed at Ninja's 260-character object-path limit. A short staging
  directory in ignored generated Gradle configuration fixed the local build; it is not a product
  dependency/configuration change. Local Sentry source-map upload was disabled because release
  credentials were not configured; runtime Sentry behavior was not removed.

## Browser/native acceptance in progress

- `apps/web/e2e/organizations-events.spec.ts` exercises real Clerk authentication and actual
  browser UI with controlled community API responses, on desktop and mobile-width web. Covered
  paths include navigation/discovery, verified logo/address review submission, retained failed
  proposals, partial event edits/unloaded tables/seconds, destructive confirmation, explicit seat
  requests and closed controls. This is **not** live API/Mongo/provider end-to-end evidence.
- Existing authenticated development accounts are reused; no Clerk users or metadata were created,
  changed or deleted for this local acceptance pass. Browser navigation assertions now wait for
  the intended route/input rather than filling the departing screen.
- Native Maestro **2.11.0** was downloaded from the official release, SHA-256 verified, and used
  directly on Windows. No app dependency or global PATH change was introduced.
- New native flows: `12-organizations.yaml` and `13-event-draft.yaml`; the CI composite explicitly
  invokes both and seeds a real gallery image. A deterministic CI test checks executable flow
  references, media fixture setup, Cascadia catalog parity and development-only Clerk test-email
  verification. CI provisioning uses `+clerk_test` emails and the documented conditional verification
  UI without disabling Device Trust; fresh CI-account native execution still requires remote proof.
- The first actual organization flow exposed the missing creation action; that root cause was
  fixed and the APK rebuilt. Current native rerun uses real app/API/Clerk/Mongo/MapTiler against
  the isolated local database, not a synthetic Maestro report.
- Latest browser terminal report: **25 passed (2.1m)**, including Clerk setup and twelve scenarios
  at both viewports. Coverage additionally includes membership request/cancel, invitation
  accept/decline/leave, administrator approval/exclusion/revocation, private moderation/rejection,
  revoked moderator authority and inaccessible-table retry. Community responses are controlled.
- Historical native `12-organizations.yaml`: **1/1 passed**, using the real release app/API/Clerk/Mongo/MapTiler. It exercises camera denial, gallery selection, verified address, real chunk upload, pending submission, revision and return navigation. Execution found and fixed the API upload `PUT`/client `PATCH` mismatch and duplicate detail history after editing; both community wizards now use `router.dismissTo`. The flow handles ordinary/permanent Android denial IDs and limited-photo grant confirmation. The shared address-picker header now uses the active route title instead of retaining its own hardcoded title when embedded in a wizard; a regression covers this.
- Historical complete native suite on the rebuilt release APK: **2/2 passed in 4m 29s**, official JUnit reports separate successful `12-organizations` and `13-event-draft` cases, status 0. Event acceptance covers information/dates/timezone/verified address, Catan table, rejected publication, retained draft, no implicit seat, table detail, editing, cancellation and confirmation of a destructive table removal. Centered scrolling keeps Maestro taps outside Android system navigation.
- Native community selection keeps validated route params as its sole owner, with explicit
  pressable test IDs and no competing delayed local-state reset. Parent-event failure no longer
  leaves a disabled dependent table query displaying an endless skeleton; retry respects authority.
- Latest three-flow native run: **1/3 passed**. Event draft passes with Cascadia; group-name and
  organization-search assertions remain unresolved. One captured group name contained a pasted
  localhost URL; group flows now dismiss the keyboard before unrelated actions. Saved names no
  longer stand in for completed navigation: tests wait for detail controls and dialog dismissal.
  These later test corrections are not claimed as executed native acceptance.
- The original baseline APK was restored during an earlier pass, then a feature APK was installed
  again. The emulator is now offline; restoration is pending its next authorized start. App data
  was never cleared. No owned community container remains active. Reports stay local, not committed.

## Remaining gates

1. Finish and inspect actual desktop/mobile-width browser and native Maestro acceptance, including
   permission/Settings return, empty/error/privacy/moderation/membership/invitation paths and
   publication/cutoff/frozen results. Full acceptance coverage is not yet demonstrated.
2. Real Inngest registration/delivery/replay acceptance is outside the operator-approved current
   scope. Publication may use authorized-read closure without Inngest; do not claim autonomous
   execution or provider delivery.
3. BGO is non-commercial: no MapTiler commercial subscription prerequisite. Respect Free quotas,
   attribution and geocoding storage terms.
4. Finish broad final UI/a11y/source review and any further acceptance/localization checks. Latest
   lint, typecheck, frozen installation, peer/matrix checks, API/web builds and native release
   build pass. Android evidence is x86_64 local only.
5. Keep local reports available for review but exclude secrets, local environments, temporary
   scripts/reports/APKs/exports/coverage and downloaded tools from any eventual commit. Owned
   community containers are stopped; baseline restoration is pending because the emulator is
   offline. Do not boot it merely to restart acceptance or clear its data.
6. Historical scope only (superseded by the local-only UX pass above): feature commit was
   signed/pushed and Branch CI was green. PR #22 updates were authorized;
   push subsequent fixes to both feature and PR head refs, monitor full PR gates through cleanup
   and publication, and never treat synthetic or absent native reports as success. **No new PR
   or merge to main.**

Historical PR #22 gates are foundation evidence, not acceptance for this new feature.

## Skills applied in the completion pass

`ponytail`, `context-mode`, `vercel-react-best-practices`, `vercel-react-native-skills`,
`vercel-composition-patterns`, `web-design-guidelines`, `expo-overview`, `expo-router`,
`expo-dev-client`, `heroui-react`, `heroui-native`, `uniwind`, `tanstack-query-development`,
`clerk` and `clerk-testing`. Only relevant references were used; static skill guidance does not
replace the actual executed acceptance reports above.

## Local-only table/organization visual pass

- Existing `feat/social-api-refactor` only; no push, new PR or production changes. Unrelated
  `.gitignore`, generated API types and private native services remain untouched.
- Organization request controls are icon-only; medium confirmation actions use normal-size text,
  danger-soft Reject/Remove, danger Ban and a separate bottom-right icon Cancel for management.
- Reused match player limits and date/location/game rows on both clients. Table details has its own
  header/icon, consistent Overview/Players, fixed-choice section help and BGG catalog metadata.
  Reservation/Leave place confirmations keep icon Cancel beside the action; only rated tables expose
  authorized leaderboards. Groups/events/tables/ordinary matches use reduced-motion-aware
  landscape/planets/shapes/waves artwork respectively.
- Table signup is voluntary: the shared service rejects every new administrator invitation with
  403 `TABLE_INVITATIONS_DISABLED` before reads/writes/notifications. Legacy invitation responses
  remain compatible. Match table cards show table then event then date, and derive Open/Closed from
  authoritative reservations and the exact cutoff, not from event publication status.
- Local validation: five coverage gates passed (web 507, mobile 162, API 541, schemas 92, shared 123
  tests), plus 63 replica-set integration tests with no skips. New deterministic helpers/components
  have 100% thresholds; existing gates unchanged. Typecheck, API/web production builds and Android
  export (5,515 modules) passed. EN/IT contain 689 active IDs with all 678 prior IDs/translations
  preserved. Generated API/web types were restored byte-for-byte.
- Playwright/Maestro selectors and flows were updated. These local results are not authenticated
  browser/native acceptance: local E2E primary/target account credentials are absent. Windows WHPX
  is usable, but it cannot verify Linux runner KVM permissions. Full CI/runtime evidence remains
  required; no APK, provider, prerelease or Telegram success is inferred from export/build checks.
- Actual isolated Chromium checks of the production UI primitives passed at 390px and 1280px:
  four local SVG styles, reduced motion, 44px hit targets, normal-sized confirmation text,
  Remove/Ban on one row, Cancel below and unobstructed hit targets. Screenshots and runnable
  harness remain local under `.git/table-visual-browser-*`; no authentication/API path was bypassed
  in the application. These component checks do not replace Playwright/Maestro acceptance.

## PR #22 run 38124479841 and local CI follow-up

- Run head `36b209172ab045ec55a45c443b6eec2fd79e30ed` completed **failure**. Initial quality gates,
  both API deployments, web preview, user provisioning/mirroring, both APK builds and both cleanup
  jobs succeeded. Publication/Telegram was skipped, not successful.
- Playwright: 82/83 passed. The group-update assertion used `getByText("Updated Players")`, which
  matched two elements. It now waits for the detail URL and targets the exact level-one saved
  group heading; no forced click, timeout increase or suppressed assertion.
- Maestro failed during the shared emulator boot, before flows or the accelerator probe. `/dev/kvm`
  existed and the device rule was printed; the old script then exited 1 without a diagnostic.
  The rule trigger did not await udev settlement before permission checks. The local fix adds
  `--settle` for this device's events and explicit missing-device/permission diagnostics, retaining
  readable/writable KVM, `-accel-check`, `-accel on`, process teardown and all flow/report gates.
- All 41 workflow contracts passed, including execution of the extracted Bash permission guard
  against simulated delayed-permission and denied-permission cases. This validates ordering and
  fail-closed behavior, not actual Linux acceleration. Action/flow YAML and shell syntax are checked.
- These fixes remain signed **local-only** commits on the existing branch. No rerun can verify new
  source until push is authorized; rerunning the old SHA would not test these fixes. Authenticated
  local E2E likewise requires explicitly configured primary/target test accounts. Do not recreate
  accounts to bypass Device Trust, clear historical emulator state or infer full CI acceptance.

## Native Maestro replacement — acceptance pending

- Operator requested replacement of the existing native suite, not a parallel second suite.
  All 14 flow entrypoints and their helpers were rewritten; configuration still discovers only
  the same 13 ordered CI journeys and stops on failure. Public-match and extra organization
  scenarios require their own isolated fixtures and do not count toward those reports.
- Reviewed and project-locked `maestro-mobile-testing` from
  [foreztgump/maestro-mobile-testing-skill](https://github.com/foreztgump/maestro-mobile-testing-skill),
  whose guide declares verification against Maestro 2.11.0. Pi discovery was checked explicitly.
  Official version-matched documentation, domain rules and CI gates remain authoritative;
  community examples do not authorize mocked responses, optional required actions, synthetic
  visibility markers, animation disabling or cloud dependencies.
- Current structural evidence: 41 YAML files parse, referenced flows/scripts resolve, all
  **80 script-policy tests pass**, all **14 entrypoints pass Maestro CLI syntax**, scoped Biome
  and diff checks pass. Assertion floors now exclude only explicitly removed transient feedback;
  policies preserve exact actor authentication, Device Trust, real permission/share actions,
  native calendar validation, overlay closure and all 13 distinct non-skipped JUnit gates.
  These are structural safeguards, not native acceptance.
- Latest clean local batch: **6/13 canonical journeys passed** — Welcome, required onboarding,
  startup deep link, **full Contacts (891.777 seconds)**, Profile/logout and reauthentication.
  Six distinct successful non-skipped JUnit reports were verified against the unchanged Maestro
  source fingerprint. A subsequent fresh ordered 13-flow suite repeated all six passes, then
  failed at Match; separate Match reruns still lose the required four-second feedback sequence
  although creation persists. A separate full Groups journey passed. Group invitations exposed
  an actual Android notification-consent prompt: the flow now completes it and waits for the
  inbox automatically opened by the app, without a second bell tap that would close it.
  Earlier invitation-tail diagnosis did not expose the inbox; consent handling alone had not
  established its pass. Subsequent complete invitation/BGG passes are recorded below. Separate full Organizations and Event draft journeys passed with
  successful non-skipped JUnit reports. Organizations now waits for the authenticated runtime
  before setup navigation after launch. The subsequent night-mode cold-start journey failed:
  Android exit history and tombstone confirm native SIGSEGV in Fabric MountingCoordinator,
  not a missing Maestro selector alone. A subsequent patched-APK cold-start/logout journey passed
  as described below; full Match remains unresolved.
  Separate runs and helper revisions are not aggregated into a full 13/13 claim.
- Earlier Contacts failures exposed native Copy link labeling, address-book/API target duplicates,
  concatenated search emails and ambiguous navigation waits. Search now targets the actual
  `contact-search-input`, clears with the real Clear search action, requires an exact escaped
  literal input value and waits for API results. The existing `contacts?tab=search` route and
  actual input replace static tab-label waits. Real diagnostic probes helped isolate these
  failures; only the subsequent complete clean Contacts JUnit report establishes its pass.
  Fresh mobile units **175/175** and mobile typecheck also passed after those corrections.
- Match runtime review exposed keyboard restoration after native date/time dialogs, real Android
  location/provider consents, and edit navigation while a preference sheet was present. Helpers now
  close only a visible native keyboard, handle actual consent dialogs, require preference-sheet
  opening/closure and target the real edit FAB. Real date/GPS and complete edit/delete diagnostic
  tails passed; **full rewritten Match remains pending**. Refreshed supporting checks: script
  policies **78/78**, Maestro CLI syntax **17/17**. Neither establishes native acceptance.
- The native crash signature matches the upstream Screens listener-lifetime race described in
  [Screens #4654](https://github.com/software-mansion/react-native-screens/issues/4654).
  Backported the official four-file Android/C++ fix from
  [Screens #4413](https://github.com/software-mansion/react-native-screens/pull/4413) through pnpm's
  managed patch, retaining **react-native-screens 4.26.2** and Expo-compatible versions. No renderer,
  animation, Sentry/privacy or acceptance checks were disabled. A fresh frozen graph installation
  passed after retaining interrupted Windows hoisted-layout modules privately. The new debug APK
  compiled successfully with local serialized native compilation after a retained compiler
  out-of-memory failure. Private Metro setup now excludes private Git/worktree archives from its
  file map; the first bundle then completed in 15 seconds. The complete **04-dark-mode** journey
  passed on that APK, with one verified successful non-skipped JUnit testcase. This is one real
  cold-start/logout pass, not proof that every intermittent crash is eliminated or that CI/full-suite
  acceptance is complete. Refreshed checks: **79/79** script policies, **175/175** mobile units,
  mobile typecheck, Expo compatibility, scoped Biome and diff checks. Owned-domain testing continues.
- Subsequent complete **09-group-invitations (574.833 seconds)** and
  **10-bgg-collection (264.602 seconds)** passed on the patched APK. Their distinct JUnit reports
  each contain one successful testcase and no failures, errors or skipped cases; XML validation
  also checked suite skip counts. The Game cafe favorite was created through actual Match UI before
  its feedback failure and retained through actual diagnostic-match deletion, not fabricated for BGG.
  Only full **06-match-wizard** still lacks a pass. Its save tap took 9.2 seconds while the feedback
  duration remains 4 seconds. A separate update/title/close diagnostic passed, but subsequent
  creation video proves a saved Match card followed by a delayed close tap opening the Profile
  button underneath the expired toast. A passed disappearance assertion alone is insufficient.
  Testing now compares hardware GPU rendering on the same owned emulator, retaining WHPX,
  viewport, APK, source, animations and toast duration. No successful full Match claim is made.
  These independent passes still do not establish one unchanged-source, clean ordered 13/13 run.
- **Historical operator pause.** The hardware-GPU Match attempt still failed on the transient close.
  Owned API/Metro processes were stopped; the owned emulator was already offline at pause
  verification. Fixture/database/AVD data and evidence remain preserved; original/shared resources
  were not changed. The operator's next scope explicitly removes native E2E disappearing-toast
  assertions/taps in favor of persisted feature outcomes. This supersedes the previous mandatory
  transient title/close acceptance requirement; product feedback/duration, durable inbox
  notifications and feature/authorization/permission coverage remain unchanged.
- **Explicitly resumed by operator; transient acceptance removed.** Native journeys no longer
  assert/tap disappearing mutation toasts, progress labels or short tap-settling overrides.
  Existing persisted match cards/headings, vote values/counts, roster changes and deletion outcomes
  remain mandatory, as do durable inbox notifications, actual native consent/dialog closure and
  domain date/time validation. Product feedback, duration and animations are untouched. Floors were
  reduced only by the removed feedback assertions (Contacts 3, Match 5, Invitations 1), without
  count padding. Same two Development fixtures re-attested; only owned services/AVD resume.
  Refreshed mobile units **175/175** and mobile typecheck pass. Initial database preparation was
  blocked by localhost MongoDB connection refusal and the absent Docker Linux daemon. Operator
  subsequently started Docker and explicitly authorized MongoDB startup: Mongo 7 now reuses the
  existing data volume, with replica set `rs0` writable and no automatic catalog import/deletion.
  Only the attested CI-pattern database and owned fixtures are reset for native runs.
- **Complete Match now passed (457.944 seconds).** Actual preference sheets use the titles
  Choose date/game/location, not the fallback Choose preference. Editing is verified in the list
  and reopened detail before destructive menu actions. Full creation, all three votes, unavailable
  confirmation, leaderboard, editing and cancel/confirm deletion passed with one successful
  non-skipped JUnit testcase. Earlier title/menu failures and the diagnostic tail remain retained;
  neither is counted as a full pass.
- Fresh ordered runs stopped at onboarding: text had reached the country search rather than the
  phone input. Country closure now targets the actual Search countries heading; native keyboard
  closure happens before selecting Germany/Italy and before Continue. The exact phone-input value
  remains mandatory, with all country/search/auth/onboarding assertions retained. A subsequent
  complete **02-login** passed; **80/80** policies, scoped Biome and syntax checks pass. The next
  ordered run passed Welcome/login/startup and stopped at Contacts' first permission prompt:
  retained Android user flags and Expo's `didAsk` cache no longer represented a fresh install.
  Owned preparation now resets only contacts/notification request-history metadata and denial
  flags, with the app stopped, permissions still denied, other preferences/auth/address book
  preserved and actual consent steps unchanged. The failed run is retained, not counted as green.
  Required next evidence remains one clean unchanged-source ordered 13/13 run. No new commit,
  push or CI dispatch.
- The next ordered attempt passed its first eight journeys, then failed at the contacts menu in
  **09-group-invitations**; it is not a 13/13 result. The controlled shared sheet no longer depends
  on layout of its own closed content. The managed HeroUI 1.0.9 source/distributed-JS patch now
  honors the controlled initial index and reports swipe closure only after actual pan activation;
  versions, feedback and animation settings are unchanged. Deterministic tests execute the real
  index expression and closure handler. Friendship setup uses real removal only if necessary,
  followed by unconditional request and acceptance. An initial private probe incorrectly expected
  Remove friend when the actual menu correctly offered Send friend request; diagnostic logs were
  removed before the clean cold-menu/back probe and **complete 09** passed, with one successful
  non-skipped testcase at `runs/1791979068286-09-group-invitations/report.xml` (private artifacts).
  Refreshed checks pass: **80/80** policies, **1,444** unit tests (mobile 176, web 512, API 541,
  schemas 92, shared 123), all four typecheck tasks and scoped intended-source Biome. The frozen
  serial installation recovered a temporary pnpm ENOENT import failure; no versions were upgraded.
  After real logout and attested isolated reset/denied-permission preparation, fresh ordered run
  `1791980052956` stopped at Match after six passes: Android ANR during native dialog focus change.
  Private bugreport shows the main thread waiting for RenderProxy and RenderThread blocked in the
  emulator's EGL window-surface creation; JavaScript was idle. Date/time checks remained required.
- **Clean ordered local native acceptance: 13/13.** At the operator's request, run `1791982842944`
  attempted all thirteen canonical journeys without fail-fast, after an owned-only restart with
  identical host GPU/WHPX/settings and fresh owned preparation. Every journey passed once; thirteen
  distinct JUnit reports were independently parsed, with zero failures, skips, timeouts or
  between-journey recoveries/retries. Source digest before/after is
  `b57b40fcad0da154150b2b34876538f77f23aed9d766ef76ee3529ba08b20ee5`; the installed APK matches
  `bb5b174d4b507237aacfabf9311688435db3e1e1cc4499f892cfe9c0e88efd09` and the patched local build.
  GPU renderer, product feedback, animations and date/time assertions were unchanged. Private
  report and verification artifacts remain under `.git/local-maestro/`; historical failures are
  retained and not aggregated. The operator subsequently authorized signed commit/push and
  exact-SHA PR CI monitoring/fixes; remote acceptance is still required.
- Local native work reuses the same two attested owned Development fixtures, isolated CI-pattern
  database and separately owned emulator. Original emulator, physical devices, shared MongoDB,
  private configuration and real accounts remain untouched. Local API 37 debug/WHPX execution
  does not replace CI API 34 release/KVM acceptance.
- Before this rewrite, the pushed head was `8553a0016aab1b098a37f59d5cdc2eec75a9ffcd`.
  PR run `38293771332` was cancelled after native failure: browser **83/83**, quality gates,
  integration, previews and both APK builds passed; native passed its first three journeys,
  then failed and lost the emulator. Owned fixture/database cleanup passed; publication and
  Telegram were cancelled. Branch run `38293768035` succeeded. These historical runs do not
  verify the rewrite. Local 13/13 is now recorded above; remaining evidence is exact-SHA PR CI
  through native/browser acceptance, cleanup and publication.
