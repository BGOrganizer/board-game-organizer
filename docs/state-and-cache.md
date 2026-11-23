# State, cache and startup

## TanStack Query

TanStack Query owns all server data: profiles, contacts, relationships, suggestions, groups,
memberships, exclusions, events, tables, registrations, games, notifications, and invite results.

Scope authenticated Query keys by API URL, stable Clerk user ID, and resource parameters, not a
rotating session JWT. Clear/cancel private caches when the user or session changes. Clerk session
JWTs rotate: shared hooks receive `getToken` and resolve a fresh token immediately before every
request.

Do not retain a token snapshot for later network calls.
Group social controls reuse the canonical Contacts mutations without mounting relationship-list or
search observers; the Contacts screen retains its own paginated reads.

Paginated contact lists and suggestions share canonical keys across screens, warmup and mutations.
Infinite queries accept only compatible paginated snapshots.

On an ordinary authenticated mobile launch, prioritize the first pages of History, Groups, Scheduled Events
and the profile with three warmup workers; only those four datasets gate early splash release.
Keep the existing five-second **total** splash limit: unfinished requests continue without blocking
navigation. After release, one background worker warms each social list, BGO suggestions, favorite
locations, BGG account/available collection and bell/inbox first pages, then bounded Event details/
Tables and authorized Group members/Events. Share canonical query factories with their screens.
Warm the first local address-book page only if permission was already granted; never request contacts
permission at startup. A deep link prioritizes its own detail instead; other reads warm afterward.
Do not invent search terms, scan the BGG catalog, call privileged/retired endpoints or start provider
synchronizations. Paginate API lists at source; fetch subsequent pages on demand, not all records
during bootstrap. A partial address-book scan must never replace the complete server contact
snapshot: finish the scan before syncing in the background.

Apply the same bounded, cache-first navigation policy on web without adding a web splash.

Native main-list, Contacts, Community, Profile and resource-detail panels mount a tab on first
access and retain visited views with React Activity. Hidden children disconnect their effects and
Query observers; shared parent owners remain live. Native scroll/layout/end
callbacks must also check their active-panel lease. Keep separate HeroUI tab roots for retained
scroll containers, so hidden layout measurements cannot resize the visible tab bar. Scope retained
views by API, user and resource, and remove panels when their permission or lifecycle no longer
allows them. Retention never grants capabilities or copies remote data into local state.
Group tab selection updates before a first-visit panel mounts in interruptible React work; current
capabilities still gate both the selected destination and any deferred panel immediately.
Shared native tab bars reveal only clipped selections rather than recentering already visible tabs.
Their indicators retain HeroUI's default animation; clipped-tab reveal scrolls without a second
animation when retained panels hand off their separate headers. Hidden-panel layout and scroll
callbacks cannot alter the active bar's geometry.

List presentation windows reset on deactivation or owner changes while authoritative Query pages
remain cached. Reject callbacks from an earlier activation, including late fetch completions; reveal
cached pages progressively again on reentry. Event Tables reset their presentation when leaving the
Tables panel because their data hook belongs to the shared detail owner.
Profile Collection additionally pins its published snapshot and is removed when collection access
is revoked. Vote-category panels retain their list and validation owner while the consent form
remains the single owner of votes, submission and validation attempts.
Table Details and Participants keep separate native scroll presentations beneath a single seat-order
and roster owner. Leaving Participants resets its bounded roster presentation, including pending
streams and queued callbacks, while retaining the editor model and authoritative Query pages.

Native persistence ignores fetch, retry, pause, invalidation and observer-only metadata events.
New data, errors, explicit state replacements and removals still update the owned disk snapshot.

Native Query data additionally persists through the mobile-only encrypted MMKV adapter. This is
an application-wide default for eligible server data, not an optional per-screen optimization: new
or touched query families must reuse the central persistence policy and review owner isolation,
privacy, retention and budget eligibility. Never add screen-local MMKV instances or parallel stores
of Query data; web keeps its own Query cache, not a native MMKV adapter. Restore
only after Clerk identifies its API/user owner, before ordinary reads; restore never grants auth,
consent or capability. Persist authoritative journal bases, not optimistic overlays or mutations;
exclude credentials, raw address-book scans and transient provider searches. Logout, definitive
session termination and account/session switches cancel RAM work and purge the owned disk/key;
late callbacks must never recreate purged data. Keep the total five-second splash limit and refresh
restored data in the existing bounded workers. The mobile adapter revokes old storage leases before
any queued logout/open work. With MMKV 4.3.2 it clears live encrypted instances rather than deleting
them: native foreground/memory-warning listeners otherwise retain a freed pointer
([upstream issue](https://github.com/margelo/react-native-mmkv/issues/1082)). Purged values and their
SecureStore key are removed; empty encrypted files/one native handle per opened ID remain for the
runtime, and cold purge/key-loss recovery physically deletes files before opening a handle.
Reopening a live ID explicitly re-encrypts with its current AES-256 key. See [native cache and builds](development.md#native-cache-and-builds) for retention and native-build limits.

Reuse cached data between lists and details when the server-authorized response actually contains
all required fields. Fetch missing Event/Table/Group detail through its individual endpoint, prefetch likely next
details with bounded concurrency, and keep cached fields visible while missing fields load.

Keep per-resource stale and retention times deliberate. Revalidate stale data in the background on
navigation, rather than polling every list. Notifications alone watch for unrelated remote events
proactively; presence heartbeat and polling while an explicitly started BGG sync is in progress are
narrow exceptions. Relevant notification events may mark affected data stale without fetching every
inactive query.

Every relationship mutation must mark the `['contacts']` prefix stale; if search is active,
`useContacts` must rerun the last query so action state updates without manual refresh. Event/Table/registration
mutations reconcile the affected `['events']` and `['groups']` scopes.
Optimistic feedback is the project-wide default for explicit remote mutations on both clients,
not a screen-by-screen opt-in. Reuse the existing scoped journal/intent layer: update owned Query
caches when cached state exists, cancel conflicting requests first, then reconcile from the server
response and refetch only affected active data when necessary. When authoritative facts cannot be
projected safely, show action-specific pending intent rather than inventing accepted consent, roles,
IDs, frozen rosters or final results. Cold caches do not justify fabricating server records. Show an action-specific
default toast after the optimistic update; on failure restore affected cache snapshots and show an
action-specific danger toast.

Do not invent server-authoritative results or bypass validation. Notification reads,
push-subscription synchronization, logout, profile completion, and background synchronization do not
show user-action toasts.

Notification reads never grant consent. Pending invitations remain unread until their actual response;
container entry, time, focus, scrolling and successful votes never acknowledge information.
Reads/decision acknowledgments reconcile related active and inactive caches immediately, preserving
later/unshown changes and selective rollback. The source-backed selection, dots, resource popovers, inbox and
partial-read rules live in [Notification attention](groups-events-tables.md#notification-attention).

## Zustand

Zustand owns local UI state and unsaved form state only:

- theme preference;
- selected tabs and open/closed UI;
- event-wizard draft values;
- transient optimistic flags.

Never mirror Query data into Zustand.
