# Native acceptance

Android, Maestro CLI 2.11.0. `config.yaml` discovers only the same 13 canonical
journeys invoked by `.github/scripts/maestro-e2e.sh` and the three native CI jobs.
Run `maestro test apps/mobile/.maestro` after preparing the isolated fixtures.
Do not run the helpers directory or treat helpers as independent test reports.

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

Domain behavior remains defined in [organizations/events](../../../docs/organizations-events.md)
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
Run web with `pnpm --filter web exec playwright test --config e2e/table-schedule.config.ts`.
Missing inputs fail. Native screenshot review must verify actual avatar/user-row rendering, metadata
order below Settings, EN/IT, themes and enlarged text; syntax and VM checks do not prove these.

`15-card-metadata.yaml` is a manual real-device card scenario, outside the unchanged canonical
CI fixture set. Start already authenticated, with a PRIVATE Group, a Registered Event with two
proposed dates/venues, and a personal Table with two games. Supply `CARD_LOCALE` (`en`/`it`),
`CARD_GROUP_NAME`, `CARD_EVENT_NAME`, `CARD_TABLE_NAME`, `CARD_VENUE` (displayed venue substring),
`CARD_EVENT_DATE_LABEL` (localized long date) and `CARD_EVENT_TIME_LABEL` (localized clock).
Missing inputs fail. The flow filters real first-page rows, requires parent/date/venue/count text,
then captures Event-context Tables without repeated parent labels. Inspect its screenshots for
native typeface/size, icon order, wrapping and accent color in both themes/locales; parsing or VM
checks are not native geometry evidence. It neither creates fixtures nor writes votes/registrations.

Web parity has an explicit manual Playwright configuration, `apps/web/e2e/card-metadata.config.ts`.
Run `pnpm --filter web exec playwright test --config e2e/card-metadata.config.ts` against the isolated
Preview, with the same named fixture, `E2E_EMAIL`, Development Clerk test credentials,
`CARD_LOCALE`, `CARD_VENUE`, `CARD_EVENT_DAY` (`YYYY-MM-DD`) and `CARD_EVENT_TIME` (`HH:mm`).
It uses real auth/reads and computed typography at 390/1280px; no routes are mocked. The
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

## Evidence

YAML parsing and source-policy tests validate structure, not product acceptance.
Partial runs and diagnostic continuations do not establish a full suite pass.
Acceptance requires all 13 unique, non-skipped successful JUnit reports from one
clean ordered run of the same source; PR acceptance additionally requires its
exact-SHA CI run, cleanup and publication gates. A rewritten file is not a pass.
