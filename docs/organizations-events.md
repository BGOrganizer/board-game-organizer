# Organizations and events — approved implementation contract

This feature branch is based on PR #22, as explicitly authorized. No new PR is opened.

## Organizations

- Community contains Groups / Organizations / Search tabs with common page spacing, labeled search/help, placeholders, conditional inline clear controls, and compact icon filters on web/native. Organization lists filter Admin / Invited / Accepted / Requested (own pending requests); discovery filters Groups / Organizations. Search is debounced 300 ms and requires four characters. Filters apply before server pagination.
- Events is a separate main navigation section; event creation is available only inside the owning organization to its administrator. Creation uses separate contextual pages, never a conversion or radio selector.
- Unique normalized name, 5–120 characters; mandatory logo and authenticated, verified MapTiler address. Name/logo help is in field popovers; the location uses the match-style address/favorite row. Submit stays fixed at the bottom with a send icon, no top separator, and extra bottom/safe-area clearance.
- One compact Upload command: browser file picker on web; native Camera/Photo library buttons on one row in a source sheet and system picker. No broad photo-library permission; camera permission is requested only after choosing Camera, with fresh permission/settings checks. JPEG/PNG/WebP, at most 5 MB (5,000,000 bytes); undistorted square preview, replace but no remove. MongoDB base64 assets, bounded uploads below Vercel's request limit; expired incomplete uploads cleaned up.
- One organization admin: creator, automatically confirmed member; no transfer. BGO moderators are verified freshly from Clerk `publicMetadata.bgoRole === ADMIN`, never client metadata or unverified claims. Moderator icon between notifications and profile.
- Private proposals: PENDING -> CREATED; approved edits become MODIFIED proposals. The approved revision remains operational while modifications are pending/rejected. Reject with reason; creator corrects/resubmits. Names are reserved across approved and proposed revisions.
- Details / Members / Events tabs on both clients. Details has a small status badge and admin edit FAB; Events embeds the searchable organization list with an admin-only creation FAB. Web tab selection is retained in the URL, including return from friend invitation.
- Approved details/published events visible to authenticated non-excluded users. Accepted members are visible only to confirmed members/admin; pending/excluded feeds are admin-only. The first row is an admin friend-invitation slot (disabled with an explanation before approval). Exhaust accepted pages (including creator first), then pending, then excluded; never fetch the whole roster. Show full name with smaller username, no email, and avatar-corner admin/request/invitation/exclusion badges.
- Member social controls reuse contacts actions and the vertical-ellipsis global-block menu. Enrichment is bounded to the authorized member page; expose viewer-owned block state, not incoming block flags. Social actions reconcile the viewer's member caches across organizations without changing membership. Repeated social submission is serialized; failure rolls back only affected social fields.
- Ordinary membership requests: any authenticated non-excluded user, no friendship requirement; admin approval. One request icon opens Accept / Reject / Ban from organization; this is not a friend-request or global-block operation. An admin's outgoing invitation has one cancellation icon and explicit confirmation. An invited recipient has one response icon opening Accept / Reject (also accessible from Members without revealing the private roster). Invitations: confirmed friends, acceptance confirms membership. Leaving and ordinary removal set LEFT and permit new requests/invitations. The removal confirmation offers Cancel / Remove from organization (Elimina) / Remove and exclude (Elimina-Blocca). Only explicit exclusion sets EXCLUDED until manual revoke, and only for this organization. Global social blocking is separate. None of removal, exclusion or revocation restores cancelled bookings automatically.
- No organization archival in this iteration. Existing group archival remains unchanged.

## Events and tables

- The main Events list contains the viewer's confirmed bookings, pending requests/invitations, administered events and assigned demonstrations, not every event of every joined organization. The organization's Events list retains its existing visibility. Draft privacy, exclusions and every role/action restriction remain unchanged.
- Past/Future filters use the event end instant: ongoing events remain Future, and the exact end belongs to Past. Both periods start selected. Search/help/inline clear and compact icon filters follow the same platform-specific list pattern; filters are server-paginated.
- Organization admin only: information -> table editors -> review; save DRAFT or PUBLISHED. Draft admin-only. Publishing requires approved organization and at least one table. No return from published to draft.
- Event information has field help and an example name placeholder. Starts at / Ends at each use a single match-style calendar/date-time row; location uses the verified-address/favorite row (initially empty). Next stays at the screen bottom with an arrow and reserved scrolling/safe-area space. Time zone is not editable: creation uses the device/browser zone; editing retains the stored zone. The API still requires and validates it, rejecting nonexistent DST wall times and preserving unchanged seconds/repeated-hour instants.
- Booking deadline is a positive numeric elapsed-hour offset before start, with help and a default of 24 hours. Decimal point/comma are supported; it is converted to the exact ISO cutoff required by the API. Editing derives the existing offset, preserving sub-hour/second/millisecond cutoffs rather than resetting them to 24 hours. Deadline-only changes still reschedule closure without resetting participation.
- No table-count limit; paginated/virtualized rendering. Each table has name, min/max (min >= 2), one game, contained start/end, optional confirmed-member demonstrator and optional per-table GLOBAL OpenSkill. Admin/demonstrator do not automatically occupy seats.
- Confirmed members only book. One booking/user/table; multiple tables in the same event allowed only at non-overlapping times. Pending invitations and self-requests reserve seats; self-requests require admin approval. No waitlist. Minimum counts confirmed players only.
- Before deadline: event name preserves bookings; date/time/location resets affected bookings; deadline reschedules closure; ANY table change resets that table, including name/demonstrator/rating flag. Removal/cancellation cancels unfinished participation. Confirm destructive resets explicitly.
- At/after deadline ALL event/table/booking/invitation/approval modifications are blocked, including admin. No post-deadline additions or reactivation. One automatic minimum check: under-minimum tables cancelled, remaining table matches PLANNING -> CREATED. Fixed choices, no votes or ordinary match planning actions.
- Leaving/removal/ban before deadline cancels bookings and demonstrator assignments. After deadline rosters stay frozen, including departed/excluded players; they can be recorded as ND. Never rewrite historical results.
- Result registration remains available after closure to admin/demonstrator; admin covers a table without demonstrator. Reuse exact-decimal ranking, ties, ND and atomic OpenSkill engine. Optional GLOBAL per game/table, never organization scope; immutable results.
- Table matches show event badge; confirmed players only. Cancelled/revoked tables disappear from match list; no cancellation history UI. Organizations are not selectable as normal match groups.

## Cross-cutting guarantees

- TanStack Query owns remote state, scoped by API URL + Clerk user ID; resolve fresh token immediately before each request. Optimistic updates for existing owned cache, cancellation before changes, action-specific default toast, rollback and danger toast; never fabricate server-authoritative IDs/outcomes.
- EN/IT localization, HeroUI web/native, accessible labels, skeletons only for uncached data, pagination/virtualization and usable cached fields during revalidation.
- Inngest durable deadline worker with revision checks, idempotent transaction, signed endpoint, reliable delivery and environment/database isolation. API enforces time limits even if a worker is delayed.
- Web Playwright + native Maestro acceptance coverage, deterministic logic 100% Vitest thresholds, transactional integration/race tests. No silent skips or weakened gates.

## Implementation tracking

- [x] Models, validation and deterministic scheduling/booking policy (100% deterministic coverage)
- [x] Username mirror and freshly verified moderation role (100% changed logic coverage)
- [x] Assets and organization repositories/services/routes, bounded authenticated uploads and server image verification
- [x] Membership and authenticated discovery
- [x] Event/table repositories, booking transactions and versioned deadline worker implementation
- [x] Existing matches/results/rating integration
- [x] Shared scoped query hooks, optimistic rollback and notifications
- [x] Web screens/navigation/pickers and accessible community tab panels
- [x] Native screens/navigation/camera/gallery and owned-organization creation action
- [x] Localization, migrations and documented environment contract
- [ ] Complete actual Playwright/Maestro acceptance; partial runs are not full path coverage
- [ ] Isolated signed Inngest delivery/registration verification and MapTiler production entitlement
- [ ] Final review, signed commit and branch push (no new PR)

Current evidence and remaining gates: `docs/implementation-progress.md`.
