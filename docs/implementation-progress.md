# Organizations/events implementation checkpoint

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
