# Organizations/events implementation checkpoint

Status: **IMPLEMENTED; PR ACCEPTANCE INCOMPLETE**. Local quality gates and remote Branch CI
pass; full PR/native acceptance remains pending. Do not describe the feature as production-ready or claim full acceptance
coverage. The operator requested local feasible checks followed by signed commits/push and CI
iteration instead of further local-emulator cycles. Real Inngest provisioning/delivery is excluded.

## Authority and isolation

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
  notifications, five-minute recovery and read fallback. Publication fails closed without required
  configuration; local test configuration does not impersonate a registered production provider.
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

### Search inputs, filters and help reuse — local only

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
   scope. Keep missing-configuration publication fail-closed; do not claim provider delivery.
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
