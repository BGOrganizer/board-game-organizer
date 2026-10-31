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
