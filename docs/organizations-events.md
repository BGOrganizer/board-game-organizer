# Organizations and events — approved implementation contract

This feature branch is based on PR #22, as explicitly authorized. No new PR is opened.

## Organizations

- Groups and organizations share a navigation section with Groups / Organizations / Search tabs. Events replace the old Organizations main navigation item. Creation uses separate contextual pages, never a conversion or radio selector.
- Unique normalized name, 5–120 characters; mandatory logo and authenticated, verified MapTiler address. JPEG/PNG/WebP, at most 5 MB (5,000,000 bytes); undistorted square preview. Native camera/gallery, replace but no remove. MongoDB base64 assets, bounded uploads below Vercel's request limit; expired incomplete uploads cleaned up.
- One organization admin: creator, automatically confirmed member; no transfer. BGO moderators are verified freshly from Clerk `publicMetadata.bgoRole === ADMIN`, never client metadata or unverified claims. Moderator icon between notifications and profile.
- Private proposals: PENDING -> CREATED; approved edits become MODIFIED proposals. The approved revision remains operational while modifications are pending/rejected. Reject with reason; creator corrects/resubmits. Names are reserved across approved and proposed revisions.
- Approved details/published events visible to authenticated non-excluded users. Members visible only to confirmed members. Display Clerk username, not email; update user mirror/backfill.
- Ordinary membership requests: any authenticated non-excluded user, no friendship requirement; admin approval. Invitations: confirmed friends, acceptance confirms membership. Leaving permits normal re-request/re-invite. Removal/ban excludes until manual revoke, never restores cancelled bookings automatically.
- No organization archival in this iteration. Existing group archival remains unchanged.

## Events and tables

- Organization admin only: information -> table editors -> review; save DRAFT or PUBLISHED. Draft admin-only. Publishing requires approved organization and at least one table. No return from published to draft.
- Event name, day, same-day start/end, explicit verified location (initially empty). Deadline defaults to 24 hours before event start.
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
