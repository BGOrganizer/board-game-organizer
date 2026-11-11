# Development reference

This guide holds implementation details linked from the [README](../README.md).
Read [AGENTS.md](../AGENTS.md) before changing code and the relevant domain contract before changing behavior.

## Client responsiveness defaults

Apply these best practices to every new or touched client flow; they are not optional optimizations
reserved for the game picker. Existing ownership, privacy and authorization rules in
[AGENTS.md](../AGENTS.md#6-data-and-state-ownership) remain authoritative.

- **Bound presentation independently from cache.** Keep source paging and virtualized rendering.
  On entry/reentry, expose a bounded cached page/window and reveal more cached pages before fetching.
  Derive only that window, not a full-cache flatten followed by a slice. Preserve cached pages,
  stable row keys/callbacks, accessibility and loading/error states. Reset-to-top is acceptable when
  the flow allows it. The mobile game picker exposes eight source items initially, retaining six-row
  render batches and its seven-screen window. It reveals cached chunks on scroll or an accessible
  load-more action, not on an automatic initial `onEndReached`. These are picker-specific budgets,
  not universal constants or fixed-height assumptions.
- **Optimistic feedback for explicit remote actions.** Use the shared scoped journal/intent layer
  on web and native: cancel conflicting reads, project owned cached state or pending intent,
  reconcile the real acknowledgment and roll back only the failed operation. Do not invent consent,
  capabilities, server IDs, frozen results or records for a cold cache. Unknown outcomes require
  verification, not blind replay. Reads, unsaved local edits and background/authentication workflows
  retain their existing behavior; they do not acquire user-action toasts merely to look optimistic.
- **Central encrypted MMKV persistence for eligible native Query data.** Reuse the account/API-owned
  adapter described in [Native cache and builds](#native-cache-and-builds), reviewing each query family's privacy and retention/budget eligibility.
  Persist canonical bases only; never optimistic overlays, credentials, raw contacts or transient
  provider searches. Restore does not grant authentication or permissions. Preserve logout/session
  purge safeguards. No separate feature cache, duplicated Query state or web MMKV adapter.
- **Measure both directions.** Faster list opening does not prove faster Back or selection return.
  Cached data can still require rebuilding an editor's native controls; cache snapshots can still
  require serialization. Profile JS work, React/native mount/commit and storage separately on a
  current native build. Do not hide costs with arbitrary delays, disabled animations or unbounded
  hidden lists. Unit/source checks and desktop timings are not device-frame acceptance.

## Native cache and builds

- Native cache-first restart: authoritative TanStack Query data persists in account/API-scoped,
  AES-256 MMKV with random device-only SecureStore keys. Restore waits for Clerk identity; it is not
  offline authentication. Snapshots retain up to 24 hours, 200 queries and an 8 MiB conservative
  serialized budget; older entries are evicted. Native infinite refreshes restart at page one.
  Combined personal Tables remains first in the existing three-worker priority warmup; four first
  datasets gate splash, never beyond five total seconds. Cached content stays visible during refresh.
  Logout/account or session changes purge owned disk/key and cancel RAM work. No optimistic intents,
  raw address-book scans, credentials or offline write replay persist. Storage failures retain usable
  RAM/network behavior and show a nonblocking localized warning.

Native MapLibre and MMKV/Nitro require a native build, not Expo Go or a JavaScript-only update.
Use the mobile package's `android` or `ios` script for local builds with the appropriate native toolchain.
Native performance and runtime acceptance are tracked in the [implementation checkpoint](implementation-progress.md).

## BoardGameGeek catalog

Local setup uses the rankings CSV described in [data/README.md](../data/README.md).
The Compose importer stages and validates CSV rows, then merges them into `boardGames` by BGG ID;
missing catalog games and XML-enriched fields remain intact. It does not replace the catalog.
Every container start repeats the import before becoming healthy. `docker compose down` preserves the volume.

Remote imports use [the catalog workflow](../.github/workflows/import-boardgames.yml) and
[the import CLI](../apps/api/scripts/import-boardgames.mjs). The direct database alternative is
[import-boardgames-direct.ts](../apps/api/scripts/import-boardgames-direct.ts).
These are operator tasks with explicit environment/credential checks, not application startup steps.
Both remote and direct import use the complete rankings CSV parser.

User synchronization requests owned games (`own=1`) in separate base-game and expansion partitions;
expansions are excluded from playable selection. Linking and synchronization require an API-side `BGG_TOKEN`.

Reading a collection page also enriches that page's missing/stale catalog durations and average weight (difficulty) through BGG
XML API2 (`thing?stats=1`), using the same shared one-request-per-five-seconds quota as search and game selection.
Only the visible page is requested, including its verified collection IDs absent from the local
catalog. A busy quota or unavailable provider keeps the cached page usable; there is no full-catalog
scan or provider request inside a transaction. HTTP 202/429 retain the shared one-minute backoff.
`metadataAttemptedAt` records parsed metadata attempts and prevents retrying unavailable/partial
metadata for five minutes. `weightCheckedAt` advances only for a finite BGG `averageweight` from 1 to 5; missing/zero
weight remains eligible after the existing retry delay. Weight is stored as `averageWeight` on
canonical games and returned by search, detail, collection and picker DTOs.
`durationCheckedAt` and `playerCountsCheckedAt` advance only when BGG
returns the corresponding complete valid pair. Existing verified values survive omitted/invalid
responses. Missing minutes are eligible even with a legacy fresh success timestamp; successful
complete metadata retains the existing seven-day freshness policy. Refresh happens on a subsequent
API read, not by polling or by automatically scanning later pages.

BGG player-count recommendations retain the complete `suggested_numplayers` poll as
`suggestedPlayers` (Best/Recommended/Not Recommended counts per exact or open-ended count,
per-row samples, provider total and fetched timestamp). Classification uses a strict unique
plurality; ties, absent rows and zero samples are unknown. These are community preferences,
not replacements for hard min/max players. Omitted/invalid polls preserve previous verified data
and do not acquire a new success timestamp. The existing quota, retry and HTTP 202/429 backoff apply.

After a complete successful remote CSV import, the import workflow script follows with bounded
enrichment of the first 200 base games with positive integer general rank, sorted by rank then ID.
Each API request hydrates at most 20 IDs under the shared quota; orchestration stays in the CLI.
Partial CSV runs do not start enrichment. Fresh records are skipped; incomplete batches report
counts and fail explicitly without rolling back the usable CSV. Rerunning resumes through the
metadata cache; other catalog games remain lazily enriched. No import is performed merely by
installing or testing this code. See [Event planning](groups-events-refactor.md#event-planning-settings-and-seat-order).

## Delivery

[Branch/PR CI](../.github/workflows/pr-ci.yml) runs quality, unit and MongoDB integration checks.
Without an open main-targeting PR it stops at branch checks. With one, the PR event owns the full pipeline;
the push run routes without duplicating it. Internal validation and Development publication have distinct dependencies.
PR browser/native E2E jobs are retained but explicitly disabled by current policy; a green CI does not prove E2E acceptance.
Main and manual mobile E2E workflow gates have been removed; local suites remain available.

[Main CI](../.github/workflows/main-ci.yml), [manual mobile builds](../.github/workflows/mobile-development.yml)
and [operational gates](organizations-events-operations.md) define actual deployment, isolation and release requirements.
Infisical is the deployment configuration source of truth. Keep test/production Clerk instances and runtime databases isolated.
Use signed Conventional Commits; open a PR only when requested.
