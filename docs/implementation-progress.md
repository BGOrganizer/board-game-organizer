# Verification and runtime acceptance

This guide defines how to assess an implementation. Current behavior belongs in the
[domain contract](groups-events-refactor.md), [Profiles](profiles.md), [Community](community.md)
and [state/cache guide](state-and-cache.md). Commands and delivery requirements belong in
[AGENTS.md](../AGENTS.md#7-verification), [development](development.md) and
[operational gates](organizations-events-operations.md). Read current source and workflow files
before using older reports. Historical implementation journals and their superseded designs remain
in Git history; this document is not a roadmap or a running test-count ledger.

## Automated verification

- Run checks appropriate to the changed behavior and affected callers: scoped Biome/typecheck,
  relevant unit/coverage and replica-set API integration tests, builds and applicable UI acceptance.
  Preserve the required coverage thresholds and web/native acceptance paths.
- Record the tested source revision, command, configuration, exit status and report location.
  Inspect failure, error and skip counts. A missing suite, intentional CI skip, interrupted process
  or successful test discovery does not establish a passing journey.
- Unit, source-contract and mocked-provider checks establish only the behavior they execute.
  TypeScript compilation, JavaScript exports and isolated browser layout checks do not establish
  authenticated UI, native rendering, permissions, provider delivery or device performance.
- MongoDB integration requires an isolated replica set. Transactions, authorization, privacy,
  concurrent writes and immutable results need their actual integration coverage; do not substitute
  an in-memory mock or an application database reset.
- CI evidence must match the intended PR head or pinned release source and actual execution event.
  A routing-only push run, stale successful head or similarly named check does not prove PR readiness.
  Workflow files and remote required-check settings determine the effective delivery gate.

## Browser and native acceptance

Retain Playwright and Maestro coverage for user-visible success, empty, failure and action paths on
both clients, including authorization, invitations, cutoff rules, immutable results, accessibility,
EN/IT and light/dark behavior where applicable. Follow each scenario's documented fixture contract.
Do not silently skip missing authenticated configuration or report controlled responses as live
API/provider evidence.

Native checks use a compatible binary and its actual API/environment. JavaScript-only changes may
use a compatible OTA; native dependency, permission or configuration changes require a fresh binary.
Verify APK source/checksum, channel and runtime before attributing installed behavior to an update.
A successful OTA upload does not prove installation, startup, user consent or recovery on a device.

For list and editor responsiveness, measure entry/reentry and Back/selection return on the native
build. Cache hits, desktop timings and source/VM checks do not prove native frame timing. Keep real
permission dialogs, keyboard/overlay behavior, animations and navigation guards in acceptance.
Do not hide failures with optional required assertions, synthetic markers or longer arbitrary waits.

One unchanged-source full-suite result requires its complete set of successful, non-skipped reports.
Do not combine independent diagnostic runs, source revisions, binaries or retries into that claim.
Preserve failed/interrupted evidence and state the practical limit of each executed check.

## Ownership and external operations

Use only explicitly owned test accounts, fixtures, databases, processes and devices. Keep
Development/Preview and Production credentials and targets separate. Test setup and cleanup must
verify their exact owner and environment; preserve unrelated accounts, data and device state.
Never put credentials, raw contacts, generated private environments or private reports in Git.

Documentation, skill installation and historical reports authorize no migration/reset, provisioning,
credential change, provider synchronization, publication, branch-protection change or merge.
Obtain the current task's scope and apply its authorized operations through the existing safeguards.
Local tests alone do not attest deployed provider configuration or production/device acceptance.
