# Native acceptance

Android, Maestro CLI 2.11.0. `config.yaml` discovers only the same 13 canonical
journeys invoked by `.github/scripts/maestro-e2e.sh`; see
[AGENTS.md](../../../AGENTS.md#8-git-and-delivery) for current CI enablement. Retained flows are not execution evidence.
Run `maestro test apps/mobile/.maestro` after preparing the isolated fixtures.
Do not run the helpers directory or treat helpers as independent test reports.

## Manual OTA startup

`34-ota-consent.yaml` covers a real compatible update with `OTA_CASE=later`, `update`,
`download-error` or `no-update`. Prepare independent owned fixtures for each case and both EN/IT.
Set the same build/channel/account guards described below and an `OTA_EXPECTED_TEXT` visible on
the main list in the expected bundle. The no-update case requires a channel with no newer update;
the other cases require a newer compatible update that is not already downloaded. Later must
survive Home/foreground and reappear after killing the process. The error case temporarily enables
airplane mode after checking, then retries online; restore connectivity manually if the flow fails.
Update/retry must show the changed text and preserve the account. This flow is opt-in and never
publishes or changes Production.

`32-ota-startup.yaml` is opt-in and does not publish updates. Use a fresh standalone Development
APK, an owned complete account and an already downloaded compatible update on `development-pr-N`.
Verify the installed native channel/runtime against the approved update before running. Set
`OTA_BUILD_ACK=owned-preview-build`, `OTA_CHANNEL`, `OTA_EXPECTED_TEXT` (unique updated profile
copy) and `OTA_ACCOUNT_NAME` (the owned profile identity). The flow opens Profile across two cold
launches without clearing state and checks updated copy and retained account. Prepare matching
EN/IT fixtures; this is Android Development only, never Production.

Separately verify no check/download/restart in editors, confirmation overlays, with keyboard,
pending selections, mutations or in background; if these appear during an accepted download,
return to the main list and require a fresh restart confirmation. Verify restart failure recovery
on a device capable of producing a real native reload failure (unit tests inject this fault),
offline/check-error fallback to the embedded/cached bundle and rejection of a different
channel or native runtime. An unavailable update must not force a restart or block startup;
application network errors retain their normal behavior. Neither this flow nor prebuild/unit checks
prove delivery until actually executed on a device. See [OTA configuration](../../../docs/development.md#mobile-ota-updates).

## Manual Group creation presentation

`31-group-creation.yaml` and `apps/web/e2e/group-creation.config.ts` are opt-in only.
Use an authenticated, complete Development account, an existing eligible friendship and an owned
JPEG/PNG/WebP image up to 5 MB. No provisioning, Group creation, invitations or final submission is
performed. **The upload stages a real owned logo asset.** Normal asset retention applies; no cleanup
or provider mutation is dispatched by these scenarios.

Required: `GROUP_CREATE_FIXTURE_ACK=owned-friends-and-photo`,
`GROUP_CREATE_WRITE_ACK=stage-owned-logo-only`, `GROUP_CREATE_API_URL` (Local/Preview root origin),
`GROUP_CREATE_LOCALE=en|it`, `GROUP_CREATE_THEME=light|dark`.
Web additionally requires `PLAYWRIGHT_BASE_URL`, `E2E_EMAIL`, existing Development Clerk inputs,
`GROUP_CREATE_FRIEND_NAME`, `GROUP_CREATE_FRIEND_QUERY` (at least four characters) and
`GROUP_CREATE_LOGO_FILE`; optional `GROUP_CREATE_WIDTH` defaults to 390.
Native requires `GROUP_CREATE_BUILD_ACK=owned-preview-build` after verifying the installed APK's
API/account, plus `GROUP_CREATE_INPUT` JSON with `friendName`, `friendQuery`, `imagePickerLabel`.
The latter is the exact verified accessible label of the preloaded photo in the actual system picker,
not an invented selector. Prepare matching app locale/theme before running.

Checks cover radio Cards/help, private friend selection, Public reset/disabled invitation action,
placeholder/permanent file hint, real logo upload, Change/cancel/Remove and retained mandatory Public
validation. The browser also checks unsupported MIME and 200% text. Native screenshots require
visual review for side-by-side geometry, selected surfaces, preview margins and button alignment;
repeat EN/IT, themes, narrow screens and enlarged text. Camera/permission/error paths retain their
existing acceptance obligations. Source/VM tests, exports and syntax checks are not device or
authenticated acceptance. Legacy Group conversion journeys do not define this immutable-type form.

## Manual Event access expansion

`30-event-access.yaml` and `apps/web/e2e/event-access.config.ts` are opt-in, not canonical CI.
Use current owned Development/Preview fixtures, authenticated as the actor required by each mode.
No provisioning, provider sync, application migration or automatic reset is performed. Run EN/IT,
light/dark and narrow/wide web variants separately; use fresh fixtures for writes.

Required: `EVENT_ACCESS_FIXTURE_ACK=owned-disposable-event-access`,
`EVENT_ACCESS_MODE=shared|denied|enroll|picker|finalize|draft|presentation`, `EVENT_ACCESS_LOCALE=en|it`,
`EVENT_ACCESS_API_URL`, and `EVENT_ACCESS_INPUT` JSON. Native also requires
`EVENT_ACCESS_BUILD_ACK=owned-preview-build`; verify the installed APK's API/account first.
Web requires `EVENT_ACCESS_THEME=light|dark`, `PLAYWRIGHT_BASE_URL`, `E2E_EMAIL` and existing
Development Clerk inputs; optional `EVENT_ACCESS_WIDTH` defaults to 390. Production is rejected.

JSON always includes `eventId`, `tableId`, `eventName`, `tableName`:

- `shared`: nonmember friend of an actual frozen player, private finalized opt-in Event, with
  `playerName` and `ndName` matching actual username-first result identities. Checks no Group/
  Participants/Ranking destination, retained played/ND results, and browser API projection/denials.
- `denied`: repeat the same source after externally removing the only qualifying friendship or
  adding either-direction block/Group ban. Detail must deny, not show cached authorized controls.
  The flow does not manufacture relationship/ban changes or swallow its required error assertions.
- `enroll`: never-member public outsider, open PUBLIC Event, singleton game and no existing
  registration. Native additionally needs `groupId`. Real SELF enrollment persists, including when
  queued; browser verifies ACCEPTED and unchanged Group membership. Native verifies Leave table
  and the Group's Request membership action, without submitting a membership request.
- `picker`: current manager editing a planning Event with exactly one persisted Table, published own collection and accepted
  participant collections. Supply `ownOnlyName`, `participantOnlyName`, `catalogOnlyName` and an
  `emptyQuery` (all at least four characters). Fixture titles must have exactly those source
  memberships and not already be selected Table options. Checks own, union, participants-only and
  catalog fallback, absent Search chip, empty focused input and return without saving.
- `draft`: current manager of a PLANNING Event with exactly one persisted Table, one named game,
  and initial Table counts 2/4. `catalogOnlyName` identifies a real catalog title with a verified BGG
  2–4 pair (for example Azul). Both clients open an unsaved Group form and inspect the localized
  name placeholder, then remove the fixture game's draft option, set 3/5, select the catalog game,
  verify immediate 3/4 and constrained buttons, and remove it again without saving. Web forbids
  Event/Group writes in this journey. Native captures before/focused-keyboard/after Group screenshots:
  **manually compare the FAB's physical bottom/Y**; focus and syntax checks alone do not prove it
  stayed fixed or that the placeholder was visually rendered. Use both OS platforms, EN/IT and themes.
  Never provision/reset fixtures or submit either draft for this check.
- `presentation`: accepted member of an owned Group with an accepted own registration at the target
  Table (so it also qualifies for the main Tables list). Supply exact `groupName` and `gameName`;
  native also needs `groupId` and `groupType=PRIVATE|PUBLIC`. The game must be an approved current
  choice, or the selected frozen game after confirmation, not a pending participant proposal.
  Both clients inspect horizontal Group/Event/Table cards, background detail identity before tabs,
  approved-game popovers in Event/main Tables, and the unchanged roster/coda under Participants.
  No domain mutation is submitted; ordinary pre-existing notification-read behavior remains.
  Native screenshots require actual visual review for background/horizontal geometry, large text,
  clipping and touch targets. Repeat EN/IT, light/dark, small/large screens; source/syntax is not proof.
  Existing enrollment, singleton-consent and Table/player journeys now explicitly open Participants
  before seat/queue/invitation actions. No action, consent or permission is relaxed.
- `finalize`: current manager of a private grouped CONFIRMED Event with every result draft complete.
  **Requires `EVENT_ACCESS_WRITE_ACK=irreversible-owned-disposable-finalization`.** Checks sharing
  default-off, toggle/cancel/reopen reset, then commits sharing-on finalization. Scores/ratings and
  sharing become immutable. Never rerun against the same finalized fixture; never auto-reset it.

These scenarios are not execution evidence until run on actual fixtures. Additional native manual
acceptance still needs camera permission/capture/square-crop/cancel/upload, required conditional
labels, all top-tab icons in both themes, physical game-count bounds and entry/Back frame timings.
Source/VM tests and Maestro syntax do not prove device permission, keyboard, font or rendering paths.

## Manual participant proposals

`28-event-proposals.yaml` and `apps/web/e2e/event-proposals.config.ts` are opt-in only.
They do not change canonical discovery/CI. Use authenticated, owned disposable PRIVATE
PLANNING fixtures and the matching current Development/Preview builds. Every submission
or accept/reject is a real write and may survive a later failure; no fixture provisioning,
provider synchronization, application migration or automatic reset is performed.

Required: `EVENT_PROPOSAL_FIXTURE_ACK=owned-disposable-event-proposals`,
`EVENT_PROPOSAL_LOCALE=en|it`, `EVENT_PROPOSAL_INPUT` JSON. Native additionally requires
`EVENT_PROPOSAL_BUILD_ACK=owned-preview-build`; web requires `EVENT_PROPOSAL_API_URL`,
`PLAYWRIGHT_BASE_URL`, `E2E_EMAIL` and normal Development Clerk test inputs. Production
hosts/keys are rejected by the web scenario. APK ownership/API isolation is an explicit
native operator prerequisite, not inferred from the fixture acknowledgment.

JSON fields: `eventId`, `groupId` (web), `tableId`, `mode: submit-game|accept|reject`,
`gameId`, `gameName`, `proposalOffset` (0–24). Submission also needs a unique catalog
`gameQuery` of at least four characters. Review needs `proposalId` and username-first
`proposerName`. Names must match the current EN/IT UI, not emails or provider-ID fallbacks.
Use a fresh pending candidate for each destructive review run. For grouped-game coverage, supply
`proposerNames` with every displayed username in source order (at least two); `proposerName` still
identifies the representative. One Accept/Reject resolves all pending requests for that game/Table,
not only the representative. Browser readback checks every pending receipt/version; native checks the
single grouped row. Repeat with a candidate already proposed by a different player: it must remain
selectable until accepted, while an actor's own submitted game is excluded on picker reentry.

- `submit-game`: ordinary accepted Group member with an actual own-Table seat, game proposals
  enabled, candidate absent from canonical games and an empty own queue. Opening/searching
  then cancelling writes nothing; reopening and selecting the candidate directly creates one private
  PENDING proposal, without an intermediate editor/Send. The pending row has no Pending label.
  Search must retain focus after debouncing; reopening the picker must exclude that own suggestion.
- `accept|reject`: current manager, no automatic seat assumed; target is pending at the declared
  source offset and its proposer still has its own Table seat. Enable the game category for this UI
  journey; disabled categories retain server history but hide their section. Pages are fixed at five records.
  Cancel preserves the request, then one versioned decision updates that exact server-ID row.
  Acceptance adds the canonical game; rejection does not. Browser checks canonical receipts,
  unchanged existing ballots and exactly one proposal POST. Native status assertions target the
  real proposal row, never a generic Pending/Accepted label elsewhere in the roster.

These are game-path execution scenarios, not exhaustive runtime acceptance. Actual authenticated
runs, native date/location pickers, role-loss/offline/cache restoration, all themes/text sizes and
platform layout/focus behavior still require owned runtime acceptance. Unit/API/disposable-Mongo
and Maestro syntax results do not substitute for those runs.

`33-proposal-visibility.yaml` is a separate read-only, opt-in check for an owned private Event/Table.
Set `PROPOSAL_BUILD_ACK=owned-preview-build`, `PROPOSAL_LOCALE=en|it`, Event/Table IDs and display
selectors as `PROPOSAL_EVENT_ID`, `PROPOSAL_TABLE_ID`, `PROPOSAL_EVENT_NAME`, `PROPOSAL_TABLE_NAME`.
`PROPOSAL_MASK=0..7` must match the actual flags (date=1, location=2, game=4); repeat all combinations
for manager and ordinary participant fixtures with minimal single-option detail pages, bringing
each category's area into view when inspecting absent headings. Disabled sections have no header or empty label;
enabled empty queues retain their empty state. The browser proposal scenario checks actual API flags
on both detail pages. Neither path changes flags or creates fixtures; repeat with owned preconfigured
records, including historical missing flags and re-enabled retained requests.
For browser visibility-only fixtures, select `--grep 'detail proposal sections'` with the existing
proposal config so the submission/review journey is not run against disabled categories.

## Manual Group moderator actions

`23-group-moderators.yaml` is explicit opt-in, outside canonical jobs. Use a verified
Development/Preview APK and a signed-in Group creator with one ordinary accepted target.
Ban/Remove confirmations are cancelled; promotion/demotion changes real server state.
Failure can leave the target promoted; creator must inspect and restore its original role.
No provisioning, reset or Production use is authorized by running this flow.

Required: `GROUP_ROLE_FIXTURE_ACK=owned-development-moderator-group`,
`GROUP_ROLE_BUILD_ACK=owned-preview-build`, `GROUP_ROLE_LOCALE=en|it`,
`GROUP_ROLE_GROUP_ID`, `GROUP_ROLE_GROUP_NAME`, `GROUP_ROLE_TARGET_NAME` (confirmation
`@username`, or actual known fallback) and `GROUP_ROLE_TARGET_MENU_NAME` (existing username-first
action-sheet label, without adding a prefix). Run the explicit
flow with Maestro 2.11. Web counterpart: `apps/web/e2e/group-moderators.config.ts`,
with the same fixture ACK/locale/Group ID plus `GROUP_ROLE_API_URL`,
`GROUP_ROLE_TARGET_ID`, `E2E_EMAIL` and normal owned Playwright/Clerk inputs. Neither
syntax/discovery nor isolated component layouts prove authenticated/device acceptance.
Moderator/peer protection, live Event authority, immutable results and transactional
revocation are also covered by service and disposable-Mongo tests; device execution remains required.
The web scenario additionally reads the real ranking endpoint and checks identity/role popovers and
contained picker bounds in light/dark at 390px. Its owned Group needs a rated game with a name of at
least four characters and a currently accepted ranked player on their bounded first source pages.
No intercepted API response is acceptance evidence.

`32-group-rankings.yaml` is a separate read-only native flow, outside canonical jobs. Use an already
onboarded, authorized actor and run ADMIN/MODERATOR/MEMBER fixtures separately in both locales/themes.
Set `GROUP_RANKING_FIXTURE_ACK=owned-development-group-ranking`,
`GROUP_RANKING_BUILD_ACK=owned-preview-build`, `GROUP_RANKING_LOCALE=en|it` and
`GROUP_RANKING_INPUT` JSON with `groupId`, `groupName`, `gameName`, `userId`, `username`, `role`.
These are actual current fixture facts, not desired membership or fabricated rating rows. The game
must occur on the initial source page and have at least four name characters; the player needs real
rated Table history and that current accepted role. The flow searches with the keyboard visible,
selects the game, source-scrolls to the actual player and opens its role badge. Inspect the captured
picker/keyboard bounds on a real device; syntax, VM tests and screenshots not yet taken prove none
of those geometry paths. It performs no provisioning, role change, result write or reset.

## Manual singleton consent

`25-single-option-consent.yaml` and web `apps/web/e2e/single-option-consent.config.ts` exercise
real cancel/reopen, absent singleton voting tabs, all-NO rejection for multiple choices and explicit
join/invitation acceptance. They remain outside canonical CI; no provider mocks or resets.
Run all **eight masks × join/accept × EN/IT**, using a fresh disposable fixture per execution;
web additionally uses widths 390 and 1280. Run native light/dark and enlarged text on a current build.
These flows change real registrations; inspect partially completed fixtures before retrying.

Require `SINGLE_OPTION_FIXTURE_ACK=owned-disposable-development-fixture`,
`SINGLE_OPTION_LOCALE=en|it` and `SINGLE_OPTION_INPUT` JSON. Native additionally requires
`SINGLE_OPTION_BUILD_ACK=owned-preview-build` and an already authenticated matching account.
Web requires `SINGLE_OPTION_WIDTH=390|1280`, `E2E_EMAIL`, normal Development Clerk inputs and an
explicit local/Preview `PLAYWRIGHT_BASE_URL`; missing inputs fail closed.

Each fixture: non-admin accepted PRIVATE Group member, one future PLANNING Event/Table, max two
players, owner already accepted, no other Table participation for the test actor. Join starts with
one free place; accept starts with the actor's PENDING invitation reserving that place.
JSON fields: `mask` (date=1, location=2, game=4; zero means all singleton), `mode` (`join|accept`),
`path` (`/events/<event UUID>/tables/<table UUID>`), and `name` (Table name). Native also requires
`dates`, `locations`, `games`: exact arrays of one or two accessible option labels matching each
mask bit. Date vote labels use local `YYYY-MM-DD HH:mm`; location/game labels use their names.
Names containing punctuation are escaped literally. Web verifies actual authorized API option
counts, captures the real versioned request and checks singleton maps remain empty.

See [current consent contract](../../../docs/groups-events-refactor.md#events-and-tables).
Syntax, VM callbacks, bundles and disposable-Mongo tests do not replace authenticated browser/native
execution. No provisioning or Production mutation is authorized by adding these scenarios.

## Fixtures and order

This is an **ordered integration journey**, not 13 independently seeded tests.
The runner owns an isolated database, Development Clerk accounts, device contacts,
photo-library image, permissions and night-mode preparation. It must attest those
resources before reset and clean them afterward. Missing inputs fail; no production
fallback, mock response, ignored failure, retry or fabricated report is permitted.

Required runtime inputs: `EMAIL`, `PASSWORD`, `EMAIL_2`, `PASSWORD_2`. Primary and
target are different provisioned accounts, mirrored into MongoDB. Primary starts
without the mobile-number onboarding value. Target already completed onboarding.
The initial social graph and ordinary match/group/organization/event lists are empty.
Primary has the seeded `bgg-e2e` collection and Cascadia catalog/rating fixture.
The owned device address book contains target, unregistered contact and paging rows
through `ZZ Page 43`. Initial contacts and notification permissions are denied.

| Canonical report | Required entry | Acceptance and resulting state |
| --- | --- | --- |
| 01-launch-welcome | Signed out, clean owned app | Cold launch, welcome/sign-in, no authenticated header; real permissions remain ungranted. |
| 02-login | Primary onboarding unset | Real Clerk identifier/password/Device Trust; required onboarding; empty country search, Germany/Italy, arbitrary non-empty number; exact primary email. |
| 02-startup-deep-link | Primary authenticated, no matches | Cold-start Community deep link, usable navigation back to empty Matches. |
| 05-contacts-follow-block | Primary, clean social graph | Permission deny/cancel/allow; help and both legends; address-book paging and share sheet; request confirm/cancel/resend/reject/accept; unread clearing; notification deletion 2→2→1→0; friendship removal, follow/unfollow, block/unblock. Ends primary on Contacts, no relationship with target. |
| 03-profile-logout | Primary on Contacts | Header profile navigation, API-loaded identity/stats/BGG attribution, scrollable logout, authenticated header disappears. |
| 07-reauth-after-logout | Signed out, onboarding complete | Real reauthentication, no repeated onboarding, exact primary profile identity. |
| 06-match-wizard | Primary, no ordinary matches | Name/date/slot validation, native date and time, public visibility, verified GPS/address, favorites, players, game search/help/clear/catalog metadata, persisted creation/card/search/filter, three votes/legend, unavailable confirmation, roster/leaderboard, atomic editing, delete cancel/confirm. Match removed; verified Game cafe favorite retained. |
| 08-groups | Primary, no active group | Wizard/back/name/privacy/invitation-picker, create/list/search/filter, empty leaderboards, edit/back, optional match-group selector, archive cancel/confirm. Archived group absent from list. |
| 09-group-invitations | Primary, target not friend | Real two-actor friendship setup; invitation slot remove/re-add; pending removal cancel/confirm; notification routing, recipient-only acceptance and roster/leaderboard; leave cancel/confirm. Ends target, primary's group retained. |
| 10-bgg-collection | Seeded primary BGG and Game cafe favorite | Explicit primary switch and identity; API stats/attribution; collection-only picker toggling in unsaved wizard; disconnect cancel/confirm; username dialog cancel. Ends primary; no match created, BGG disconnected. |
| 12-organizations | Primary, owned image seeded, camera denied | List filters/search/help, real camera denial, required native image upload, verified address, pending proposal/member restrictions, versioned edit, combined discovery empty search/clear. Pending Maestro community club updated retained. |
| 13-event-draft | Primary owns 12's pending organization | Event filters/search, contextual creation/help, actual calendar/time and bounded table rejection/correction, game and persisted ratings switch; pending-org publication rejected; draft saved, read-only table/help/roster/privacy, editor header navigation, table removal and reset cancel/confirm. Saved detail and parent list prove draft has zero tables/participants. |
| 04-dark-mode | Primary authenticated; runner enabled night mode | Authenticated cold launch, explicit logout without clearing app state, welcome/sign-in remain usable. Ends signed out. |

Domain behavior remains defined in [Groups/Events/Tables](../../../docs/groups-events-refactor.md)
and [operational gates](../../../docs/organizations-events-operations.md), not this test plan.

## Synchronization and selectors

- Each committed action waits for its real confirmation to disappear; each route
  waits for a destination control. Text already visible behind an overlay is not
  navigation evidence.
- `switch-actor.yaml` completes real logout/sign-in and asserts the exact next
  account email in the API-backed profile. Setup uses existing app deep links;
  header navigation is separately exercised by `03-profile-logout`.
- Stable existing IDs first, semantic text next. A contact can appear in both API
  results and the address book: search completion is scoped below Search results
  and above Device Contacts, never inferred from the already-visible suggestion.
  Native date/time uses Android resource IDs. No coordinates, synthetic visibility
  markers or animation disabling.
- Contact-search setup uses the existing `contacts?tab=search` route and waits for
  `contact-search-input`, not a tab label visible on every Contacts view. An existing
  query is cleared with the real Clear search action; empty state is required before
  typing and the actual input must equal the escaped literal fixture email afterward.
- Shared subflows contain real operations, not mocked state. Required steps never
  use `optional: true`. Conditional branches only handle a known native/provider
  or initial-query state and always converge on a mandatory observable result.
- Indices are limited to duplicate real notification rows, extra wizard slots,
  native gallery image selection and fixed confirmation action IDs. Notification
  count is asserted before and after deletion; matching a heading is insufficient.
- Search clear is tested with the keyboard open where required. Do not issue an
  extra `hideKeyboard` after a search already hid it: Android may navigate Back.
- Fixed event footer actions are tapped directly, never scrolled to the center.
- Wait for durable feature outcomes: saved cards/detail headings, vote values,
  roster changes, and removed records. Never assert/tap disappearing toasts,
  transient progress text, or depend on short tap-settling windows. No fixed sleeps.
  Bounded waits for real navigation, native consent and overlays remain; product
  feedback and continuous animations stay unchanged. Durable inbox notifications
  and domain date/time/cutoff rules remain covered.

## Additional isolated scenarios

`17-profiles.yaml` covers real social View profile navigation, owner-only controls, ordinal GLOBAL
rating, visible/private activity filtering, an empty subject and both block directions. `18-profile-bgg-logout.yaml`
uses a separately acknowledged owned UNLINKED Development/Preview account for real provider failure,
publication, disconnect consent and confirmed cache-safe logout. Inputs and web counterpart are defined in
[Profiles](../../../docs/profiles.md#acceptance). Run EN/IT, both themes and enlarged text; missing inputs fail.
No canonical journey or CI job is replaced/enabled by these files. Syntax/VM/discovery checks are not
real provider, authenticated or native-device acceptance.


`20-list-status.yaml` and `apps/web/e2e/list-status.config.ts` cover combined lifecycle/name filters
without mocks, saves or resets. Use owned Development/Preview fixtures: the actor has a Registered
Event and personal Table in each of CONFIRMED, PLANNING, TERMINATED, with names containing the same
`STATUS_QUERY` (1–120 characters). Supply `STATUS_LOCALE` (`en`/`it`); native additionally needs
`STATUS_EVENT_CONFIRMED`, `STATUS_EVENT_PLANNING`, `STATUS_EVENT_TERMINATED`,
`STATUS_TABLE_CONFIRMED`, `STATUS_TABLE_PLANNING`, `STATUS_TABLE_TERMINATED` (unique first-page names).
Web requires `STATUS_API_URL` (local/Preview), `STATUS_THEME` (`light`/`dark`), `E2E_EMAIL` and existing
Development Clerk test credentials. Run `bun run --filter web exec playwright test --config e2e/list-status.config.ts`.
Every state fixture is mandatory; all-off must remain empty after clearing search. Repeat native
EN/IT, light/dark and enlarged text. Profile flows 17/18 now enter Collection explicitly; 17 also
checks that clearing the selected game removes its chart. Syntax/discovery is not runtime acceptance.

`19-table-player-ux.yaml` and `apps/web/e2e/table-player-ux.config.ts` inspect real waiting states,
usernames, localized Profile statistics and unsaved Table drafts; no save/enrollment or mocks.
Use an owned Development/Preview actor in the selected `TABLE_UX_LOCALE` (`en`/`it`). Supply
`TABLE_UX_FREE_PATH`, `TABLE_UX_FULL_PATH`, `TABLE_UX_CONFIRMED_PATH` as `/events/<uuid>/tables/<uuid>`:
FREE belongs to an editable, valid future PLANNING Event with one small Table and available places;
FULL is a small full PLANNING Table where the actor can join/invite; CONFIRMED includes a first-page
player with `TABLE_UX_USERNAME` and `TABLE_UX_EMAIL`. Web additionally requires `E2E_EMAIL` and existing
Development Clerk test keys. Run `bun run --filter web exec playwright test --config e2e/table-player-ux.config.ts`.
Missing inputs fail. Repeat both themes and enlarged text; syntax/discovery is not device acceptance.
The draft inspection advances through Event and Dates / Locations, then expands the fixture Table
inside the four-step editor. `24-game-picker-reentry.yaml` follows the same navigation and checks
that its open Table survives picker cancellation and selection. Retained legacy draft journeys are
not evidence of the current unified editor's runtime acceptance.

`16-table-schedule.yaml` and `apps/web/e2e/table-schedule.config.ts` are explicit manual,
read-only detail scenarios, outside canonical suites/jobs. Use an isolated Development API and an
already onboarded actor authorized for four real fixtures: an included CONFIRMED PUBLIC Table with
known selected duration and demonstrator; an included PRIVATE Table with unknown selected duration;
an excluded CONFIRMED Table; and a PLANNING Table. No seeding, reset, consent bypass or API mocks.
Maestro additionally needs unique `SCHEDULE_PUBLIC_NAME`, `SCHEDULE_PRIVATE_NAME`,
`SCHEDULE_EXCLUDED_NAME`, `SCHEDULE_PLANNING_NAME` to wait for the correct detail after each link.
Both use `SCHEDULE_LOCALE` (`en`/`it`), `SCHEDULE_PUBLIC_PATH`, `SCHEDULE_PRIVATE_PATH`,
`SCHEDULE_EXCLUDED_PATH`, `SCHEDULE_PLANNING_PATH` (each `/events/<uuid>/tables/<uuid>`), localized
`SCHEDULE_PUBLIC_DATE`, `SCHEDULE_PRIVATE_DATE`, `SCHEDULE_PUBLIC_TIME`, `SCHEDULE_PRIVATE_TIME`
and `SCHEDULE_DEMONSTRATOR`. Maestro also needs the complete localized `SCHEDULE_DURATION_LABEL`;
web needs numeric `SCHEDULE_MINUTES`, `E2E_EMAIL` and existing Development Clerk test keys.
Run web with `bun run --filter web exec playwright test --config e2e/table-schedule.config.ts`.
Missing inputs fail. Native screenshot review must verify actual avatar/user-row rendering, metadata
order below Settings, EN/IT, themes and enlarged text; syntax and VM checks do not prove these.

`15-card-metadata.yaml` is a manual real-device card scenario, outside the unchanged canonical
CI fixture set. Start already authenticated, with a PRIVATE Group, a Registered Event with two
proposed dates/venues, and a personal Table with two games. Supply `CARD_LOCALE` (`en`/`it`),
`CARD_GROUP_NAME`, `CARD_EVENT_NAME`, `CARD_TABLE_NAME`, `CARD_VENUE` (displayed venue substring),
`CARD_VENUE_ADDRESS` (the exact formatted address shown by the client, without its IANA zone),
`CARD_EVENT_DATE_LABEL` (localized long date) and `CARD_EVENT_TIME_LABEL` (localized clock).
Both clients additionally require `CARD_PEOPLE_INPUT` JSON with `username`,
`groupRole=admin|moderator|member`, `eventRole=admin|moderator|participant` and
`tableStatus=participant|awaiting|waiting`. This named person must exist in the actual first visible
Group/Event/Table roster windows; prepare eligible source-authorized fixtures, never invent a role or
expose another person's private pending invitation. Missing inputs fail. Use matching API/client builds
with complete authorized schedule/participant-role projections. The flow filters real first-page rows
and requires the actor's accepted participation. Event cards show Group ·
localized Table count with the prior schedule preview/counts inside status help. Table cards show
accepted-seat / capacity and local date/location/game popovers; both Table feeds retain Group · Event.
Group cards show accepted members plus the sole admin (moderators counted once) · authorized Events,
with role, visibility and public-only review controls. Inspect complete left Landscape/Constellation/
Planets artwork and logos, title/count ordering and single-row cumulative controls (horizontal scrolling
when the full Card width is insufficient), 28px frames/16px glyphs and 44px targets. Admin is warning;
moderator is accent. List artwork canvases match their Card surface. Location popovers pair MapPin
icons with addresses only; Table status uses Unconfirmed players. The flow also opens all three detail
identities and real list-style parent cards. Review fully vivid artwork without a whole-image scrim,
with left title and right controls on the same row and a localized bottom contrast caption, not a
nested surface Card. Inspect Details/Ranking labels, @handles, membership/Event roles, Event avatar
overlays and Table consent/queue subtitles in both locales/themes and at enlarged font sizes. Parsing/VM checks are not native geometry evidence. No fixtures, votes or
registrations are created; existing container/notification reads retain their ordinary behavior.

Web parity has an explicit manual Playwright configuration, `apps/web/e2e/card-metadata.config.ts`.
Run `bun run --filter web exec playwright test --config e2e/card-metadata.config.ts` against the isolated
Preview, with the same named fixture, `E2E_EMAIL`, Development Clerk test credentials,
`CARD_LOCALE`, `CARD_VENUE`, `CARD_VENUE_ADDRESS`, `CARD_EVENT_DAY` (`YYYY-MM-DD`) and `CARD_EVENT_TIME` (`HH:mm`).
It uses real auth/reads, computed typography/full-height artwork and informational popovers at
390/1280px, with no domain writes or mocked routes. The
`.scenario.ts` extension keeps it out of default canonical suites; both real manual runs remain
separate acceptance requirements, not claims inferred from isolated component previews.

`14-query-cache.yaml` is a manual scenario outside the unchanged 13-report CI fixture set.
Use a freshly built MMKV/Nitro APK, two isolated already-onboarded EN accounts and a device with
working Android airplane-mode controls. Actor A starts authenticated with unique visible first-page
`CACHE_TABLE_NAME`, `CACHE_GROUP_NAME` (Private), and `CACHE_EVENT_NAME` (Registered). Actor B uses
`EMAIL_2` / `PASSWORD_2` and has empty personal Tables, Private Groups and Registered Events.
Run the flow directly; missing inputs fail. It records the three main tab strips, kills the actual
process without clearing data, requires the same real rows after an offline restart, reconnects,
then performs real logout/sign-in and requires B's completed empty responses without A's rows.
Confirm airplane mode really disables networking on the owned device; Clerk must restore a known
identity before any private cache can appear. The completion hook restores networking on exit.
Screenshots require native geometry/inline-dot review; source/VM tests and screenshots from a web
fixture are not substitutes. Repeat visual review in IT/light/dark and with enlarged text. Storage
corruption/key loss, deferred responses, pending mutations, selective rollback and deadlines also
have deterministic adapter/lifecycle tests; these are not device acceptance.

`11-match-join-requests.yaml` is explicitly outside the 13-report CI fixture set.
Run it with an isolated primary-owned PUBLIC PLANNING match (`PUBLIC_MATCH_LINK`),
free capacity, no target invitation, and the four actor inputs above. It exercises
voluntary request/pending privacy, administrator approval/removal, re-request and
rejection. Missing fixture or authentication fails.

`helpers/organization-invitation.yaml`, `organization-members.yaml` and
`organization-review.yaml` require additional owned approved/pending fixtures and
real recipient/creator/moderator identities. Their required inputs are documented
in file headers. They are not silently skipped or represented by canonical reports.
Do not claim these scenarios passed without their own real runtime evidence.

## Provisional Table results — manual, mutating

`21-table-results.yaml` and web `e2e/table-results.config.ts` are explicitly outside canonical
suites/jobs. They **save scores and irreversibly finalize an owned disposable Event**; never run
against Production. Verify the APK/web API target first. Supply an authenticated administrator,
selected `RESULTS_LOCALE` (`en`/`it`), `RESULTS_EVENT_ID`, `RESULTS_TABLE_ID`,
`RESULTS_EXCLUDED_TABLE_ID`, and `RESULTS_FIXTURE_ACK=owned-unfinalized-development-event`.
The confirmed fixture must contain exactly one included, unsaved two-player Table and one excluded
Table, with distinct mirrored player names and no blocking; every run needs a fresh fixture.
The scenario never seeds/resets data or bypasses consent. Real score inputs/navigation actions have
stable test IDs; no synthetic visibility markers or animation overrides are introduced.

Native additionally requires `RESULTS_BUILD_ACK=owned-preview-build`, `RESULTS_EVENT_NAME`,
`RESULTS_TABLE_NAME`, `RESULTS_EXCLUDED_NAME`, `RESULTS_PLAYER_1_ID`, `RESULTS_PLAYER_2_ID`.
It checks excluded-action absence, saves, restarts without clearing authentication, reloads/edits
saved scores, then finalizes from the Event header and opens immutable Results.
Web additionally requires `RESULTS_API_URL`, `E2E_EMAIL` and Development Clerk test keys:
`bun run --filter web exec playwright test --config e2e/table-results.config.ts`.
It checks cancellation, persistence/editing across reload, unchanged player statistics before
finalization, excluded Table non-contribution, and updated statistics after finalization.
Missing/invalid inputs fail. Syntax/discovery/helper checks are not authenticated/device acceptance;
repeat actual runtime review in both locales/themes and with enlarged text.

## Community — manual, read-only

Flow `22-community.yaml` uses an already authenticated owned Development/Preview build and the
selected EN/IT locale. No provider provisioning, social writes, database reset or API mocks.
Set `COMMUNITY_BUILD_ACK=owned-development-preview-build`, `COMMUNITY_LOCALE=en|it`,
`COMMUNITY_EVENT_ID`, `COMMUNITY_TABLE_ID`, `COMMUNITY_TABLE_TEXT`, `COMMUNITY_VISIBLE_TEXT`,
`COMMUNITY_ACTIVITY_KIND` (one of the seven canonical kinds), `COMMUNITY_FILTERED_TEXT`,
`COMMUNITY_PRIVATE_TEXT` and `COMMUNITY_BEFORE_TEXT`. Texts are literal, escaped by the helper.
The visible and kind-filtered texts belong to their post-relation first pages; the recent private/pre-relation fixtures would otherwise fall
inside that first page. Use a friend-only peer, a following-only peer and an incoming-only follower.
The linked approved PUBLIC Group Event/Table must be owned fixtures of a Group this viewer has
never joined; the scenario waits for real read-only detail data before asserting action absence.
It covers tabs, activity-kind filtering of the friend/follow union, preserved navigation selections,
restart/cache restore and source privacy. Review screenshots for adjacent row surfaces and compact
centered tab bars without an empty tail; repeat with enlarged text. Viewer-specific fixture narratives
use Tu/You and the actual actor/recipient's grammar.

Web: `bun run --filter web exec playwright test --config e2e/community.config.ts` additionally requires
`COMMUNITY_THEME=light|dark`, `COMMUNITY_API_URL`, `E2E_EMAIL`, Development Clerk test keys,
`COMMUNITY_FRIEND_ID`, `COMMUNITY_FOLLOWED_ID`, `COMMUNITY_INCOMING_ID`, `COMMUNITY_PRIVATE_TEXT`,
`COMMUNITY_BEFORE_TEXT`, `COMMUNITY_PUBLIC_EVENT_PATH`, `COMMUNITY_PUBLIC_TABLE_PATH` and
`COMMUNITY_TABLE_TEXT`. Canonical paths are `/events/<uuid>` and `/events/<uuid>/tables/<uuid>`.
Have at least 11 authorized activities, with friend-only/followed-only examples on their respective
first pages. It compares real source pages, checks distinct cursors, privacy, filter restoration,
public read-only details and 390/1280-width layouts. Run both locales/themes and enlarged native text.
Syntax/discovery, helper VM tests and isolated browser fixtures are not runtime acceptance.
Canonical suites/jobs and their existing acceptance policy remain unchanged.

## Game picker reentry — manual, unsaved draft only

Flow `24-game-picker-reentry.yaml` requires an already authenticated owned Development/Preview
account, a published linked BGG collection with >250 games and an editable PLANNING Event with
one Table. Do not synchronize/link the collection or save the Event during this flow.
Set `PICKER_BUILD_ACK=owned-development-preview-build`,
`PICKER_FIXTURE_ACK=owned-planning-event-linked-collection`, `PICKER_LOCALE=en|it`,
`PICKER_EVENT_ID`, `PICKER_EVENT_NAME`, `PICKER_FIRST_GAME` and `PICKER_LATER_GAME`.
The first name is the first selectable collection result; the later unique name must lie beyond
at least ten source pages. Neither game may already be selected in the fixture Table.
The flow first closes/reopens without scrolling, waits for the actual search input to disappear
before checking the Table configuration, then loads later pages, closes/reopens from the start,
traverses cached chunks again, selects one game into the unsaved client draft and verifies exclusion
when reopening. Stop discards that
client-only edit; no Save action, API mutation, provider setup or environment reset is performed.
Run both locales/themes and enlarged text. Record JS/UI frame timings on the actual device with
1/10/40 loaded pages when comparing entry, immediate Back and fast scrolling. Initial presentation
is capped at eight source items; initial layout callbacks do not expand it before a drag, and an
accessible load-more action also works when those items fit without scrolling. Check that action on
a tall viewport as well as normal scrolling. Unit callback checks and screenshots do not establish
a frame-time improvement. Do not disable animations or replace cache
contents to make the flow pass. Canonical acceptance suites/jobs remain unchanged.

## Manual Profile collection

`26-profile-collection.yaml` reads an already synchronized owned Development/Preview account;
no sync, provider write, provisioning, reset or notification acknowledgment occurs. Set
`COLLECTION_FIXTURE_ACK=owned-synchronized-bgg-collection`,
`COLLECTION_BUILD_ACK=owned-preview-build`, `COLLECTION_LOCALE=en|it`, and
`COLLECTION_INPUT` to JSON:

```json
{"owner":"owned-username","withoutExpansions":40,"withExpansions":45,"wishlist":7,"ratedGame":"Exact rated title","rating":8.5,"unratedGame":"Exact unrated title","laterGame":"Exact later-page title","laterOffset":30,"emptyQuery":"known-unmatched-filter"}
```

Values must match the full published snapshot, not owned-only or filtered counts. Use distinct
unambiguous rated/unrated titles, the expected displayed personal rating (at most two decimals),
and a known title at source offset >=25 (zero-based name/id order).
The flow verifies counters, personal rather than public rating, N/A, automatic filtering, empty
results, clear and scrolling beyond the first API page. Run EN/IT, light/dark, normal/enlarged text
and normal/tall viewports. Both few-result and empty-search screenshots must show input/chips above the actual keyboard,
not a collapsed offscreen list; blur preserves text and clear preserves Wishlist. Also verify the
accessibility paging action on a viewport where initial rows fit; no visible load-more button or logout
belongs in Collection. Syntax/unit checks are not device acceptance.
Flows17/18 now read the sync card on main Profile; Collection requires a published snapshot.

## Manual shared Collection filters

`29-shared-collection.yaml` uses already authenticated read-only Development/Preview fixtures. Set
`COLLECTION_SHARED_FIXTURE_ACK=owned-synchronized-readonly-profiles`,
`COLLECTION_BUILD_ACK=owned-preview-build`, `COLLECTION_LOCALE=en|it`, and
`COLLECTION_SHARED_INPUT` to JSON:

```json
{"subjectId":"user_subject","subjectName":"synced-peer","unsyncedId":"user_empty","unsyncedName":"unsynced-peer","expansionName":"Exact expansion","wishlistName":"Exact wishlist title","emptyQuery":"known-unmatched-filter","viewerSynced":true,"commonName":"Exact common BGG title"}
```

Use both `viewerSynced` modes (omit `commonName` when false), with already published fixture snapshots.
Both subjects must be visible to the viewer without blocks; the synced subject needs the exact
expansion/wishlist/common items in the selected first filtered pages. Wishlist is tested with both
Games and Expansions off: it must still show both wished types. Turn Wishlist off to restore type logic. No provider write/provisioning or
application mutation occurs. Run EN/IT, themes and enlarged text; review empty keyboard screenshots and
counter alignment. Behavior follows [Profile](../../../docs/profiles.md), including disabled common
filter without a viewer snapshot and hidden Collection on the unsynced subject.

Web read-only scenario: `bun run --filter web exec playwright test --config e2e/collection-filters.config.ts`
uses the same JSON/fixture acknowledgment, plus `COLLECTION_THEME=light|dark`, `COLLECTION_API_URL`,
explicit local/Preview `PLAYWRIGHT_BASE_URL`, `E2E_EMAIL` and Development Clerk keys. It checks real
source filters at 390/1280 widths, counts/common scopes and absence of owner controls/writes. Fixture
parsing/discovery is not authenticated runtime evidence. Canonical suites/jobs remain unchanged.

## Manual Event participants

`27-event-participants.yaml` and web `event-participants.config.ts` use already owned disposable
Development/Preview fixtures. Remove/ban are real destructive actions: use a **fresh fixture per mode**;
no provisioning, reset, new users or provider operations run automatically.

Set `EVENT_PEOPLE_FIXTURE_ACK=owned-disposable-event-participants`, `EVENT_PEOPLE_LOCALE=en|it`,
`EVENT_PEOPLE_INPUT` to JSON below, and native `EVENT_PEOPLE_BUILD_ACK=owned-preview-build`.
Web additionally requires `EVENT_PEOPLE_API_URL`, explicit local/Preview `PLAYWRIGHT_BASE_URL`,
Development Clerk and `E2E_EMAIL`.

```json
{"eventId":"11111111-1111-4111-8111-111111111111","groupId":"22222222-2222-4222-8222-222222222222","eventName":"Owned planning event","groupName":"Owned group","targetId":"user_owned_target","targetName":"@unique-target-name","firstTableName":"First table","targetOffset":30,"mode":"remove"}
```

Use a PRIVATE PLANNING Event, current creator/moderator without an accepted seat, and an ordinary
accepted Group target with accepted Event attendance. Target must lie beyond the first20 source
rows; web requires offset20–49 and >50 distinct accepted/frozen attendees, checked with one bounded
50-row read. Names are username-first; no email/Clerk-ID display fallbacks. Native uses the same
fixture with its Event/Group/Table display names. Repeat with `mode=ban` on another disposable fixture.

Both paths verify top tabs, the Details-only edit action, later-page attendance, canceled
confirmation and one explicit destructive action. Native remove checks retained Group membership;
web reads authoritative membership/roster afterward and asserts exactly one Event DELETE **or** one
Group-ban POST, never a non-atomic chain. Existing role/frozen-duty guards remain mandatory. Run EN/IT,
light/dark, narrow/desktop (web), enlarged text and tall viewports. Separately exercise public read-only,
empty, nonmanager, stale/revoked role, network/rollback and immutable-history paths on owned fixtures;
unit/Mongo cases do not replace that runtime matrix. Syntax is not acceptance.

## Avatar badges, resource notices and detail scrolling

The opt-in flows `35-user-badges.yaml`, `36-notification-popover.yaml` and
`37-detail-document-scroll.yaml` use an already authenticated Development build and owned fixtures.
Run both EN/IT, light/dark and enlarged text. Their web counterparts are
`user-badges.config.ts`, `notification-popover.config.ts` and `detail-scroll.config.ts` under
`apps/web/e2e`; use the existing Development Clerk setup and an explicit local/Preview web URL.
Read the guards and input validation in each scenario before running it. These scenarios do not
provision users or fixtures and do not run in the canonical CI suites.

- Badges: native requires `BADGE_LOCALE`, `BADGE_GROUP_ID`, `BADGE_EVENT_ID`,
  `BADGE_TABLE_ID`, `BADGE_RELATIONSHIP_LABEL`, `BADGE_RELATIONSHIP_EXPLANATION`,
  `BADGE_GROUP_ROLE_LABEL` and `BADGE_ROLE_LABEL`. Use a manager-owned table with an editable
  seat; the flow toggles the lock and discards the draft. Verify the 22px circle, 13px glyph,
  internal plus and separate 44px targets on device, including an avatar with both badges.
  Web uses `BADGE_GROUP_PATH=/groups/<id>` and
  `BADGE_TABLE_PATH=/events/<eventId>/tables/<tableId>` instead of the three native IDs.
- Notices: set `NOTIFICATION_ACK=owned-disposable-notifications`, `NOTIFICATION_KIND`,
  `NOTIFICATION_ID`, `NOTIFICATION_EVENT_ID` for tables, `NOTIFICATION_LOCALE`,
  `NOTIFICATION_EXPECTED_TEXT` and `NOTIFICATION_CASE=empty|read|mixed|pending|read-error`.
  Mixed fixtures also need `NOTIFICATION_PENDING_TEXT`. Read cases really acknowledge notices;
  use a fresh disposable fixture per case. The read-error case toggles airplane mode: restore
  connectivity if interrupted. Web uses `NOTIFICATION_POPOVER_ACK=owned-disposable-notifications`,
  `NOTIFICATION_POPOVER_API_URL` and validated `NOTIFICATION_POPOVER_INPUT` JSON. It additionally
  exercises overflow and query failure, checks retained inbox history and protects unrelated notices.
- Scrolling: set `DETAIL_SCROLL_ACK=owned-preview-build`, `DETAIL_SCROLL_KIND`,
  `DETAIL_SCROLL_ID`, `DETAIL_SCROLL_EVENT_ID` for tables, `DETAIL_SCROLL_TAB` and
  `DETAIL_SCROLL_LAST_ROW`. Web uses equivalent `DETAIL_SCROLL_INPUT` JSON with
  `kind`, `id`, optional `eventId`, `tab`, `lastRow` and `mode=list|static`. Choose a last row
  beyond the first source page. Check that the detail card leaves the viewport and later pages
  load without a second vertical scroller, including empty/error and tab reentry paths.

Browser geometry checks with a controlled component model, YAML parsing and source/unit tests do
not establish authenticated product acceptance or native frame timing.

## Evidence

YAML parsing and source-policy tests validate structure, not product acceptance.
Partial runs and diagnostic continuations do not establish a full suite pass.
Acceptance requires all 13 unique, non-skipped successful JUnit reports from one
clean ordered run of the same source; PR acceptance additionally requires its
exact-SHA CI run, cleanup and publication gates. A rewritten file is not a pass.
