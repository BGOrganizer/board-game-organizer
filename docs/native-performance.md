# Native performance capture

Use Perfetto to investigate Android frame completion and input handling around a focused Maestro
journey. Use [Reassure](render-performance.md) separately for React render/update commits. These
measurements answer different questions; neither a cached API response nor a passing component
benchmark establishes native responsiveness.

## Tools and prerequisites

The project pins the official Linux Perfetto binaries and Android recorder in
`scripts/performance/perfetto.sh`. The wrapper verifies release checksums before installing into
ignored `.tools/perfetto/`; it supports Linux ARM64 and x86-64. The official native executable and
Python recorder are used directly, without an npm CLI substitute. Maestro is likewise
[project-pinned](../apps/mobile/.maestro/README.md).

```sh
bun run perfetto:install
bun run perfetto --version
bun run maestro:install
bun run maestro --version
```

Before capture, verify the physical device's serial, installed Development APK/source version,
API URL, authenticated account and existing owned fixture. Do not infer APK provenance from an
OTA version alone. Both the binary and active update configuration matter. The capture helper
checks authorization, awake/unlocked state and the foreground Development package; its explicit
acknowledgment is an operator assertion, not automatic proof of API/account provenance.

Use an already authenticated Development account and an owned Preview API. Never point a flow
at Production as a fallback. `adb` and Python 3 must be available; USB access and device
authorization must already be configured. The helper does not unlock the device, change system
settings, clear app data or install an APK.

## Focused capture

For the Group Members/Events interaction, open the exact owned Group before starting. Its existing
Event must appear in the default list. Provide the fixture input accepted by
`cached-detail-navigation-inputs.js` (the same contract as the retained-detail Maestro flow).
This read-only flow makes two Members/Events cycles and asserts actual selected tabs and content.

```sh
export PERFETTO_BUILD_ACK=owned-preview-build
export NAVIGATION_API_URL=https://api-development-pr-27-board-game-organizers-projects.vercel.app
bun run perfetto:maestro --serial <adb-serial> \
  --flow apps/mobile/.maestro/flows/53-group-tabs-perfetto.yaml \
  --seconds 90 \
  -e 'NAVIGATION_DETAILS_INPUT=<owned-fixture-JSON>'
```

Use the actual verified Preview URL and fixture, not the illustrative values above. Check the
helper's required acknowledgment variables in the selected flow before running it. Do not put
credentials or invitation codes in fixture input. `--env NAME=value` forwards explicit Maestro
inputs; device/build/API guard overrides are rejected.

Capture accepts 10–120 seconds with a 16 MiB ring buffer. It waits for recorder readiness before
starting Maestro and reserves five seconds at the end. The complete flow must fit inside the
capture window; use a shorter journey rather than claiming a partial trace covers a long flow.
Only owned subprocesses are stopped. SQL analysis runs after capture/automation, keeping them
within the Raspberry's single-heavy-job budget. Do not run Chrome, another build or another
device test concurrently.

## Reports and interpretation

Private output lives under ignored `apps/mobile/build-output/perfetto/<timestamp>/`: trace,
recorder/automation logs, Maestro JUnit, capture metadata and SQL summaries. Keep these artifacts
private; traces can reveal process and device information. A failed, empty or skipped Maestro
report is incomplete acceptance, even if a trace was captured.

`android-summary.sql` scopes app samples to `com.bgo.boardgameorganizer.dev` and distinguishes:

- frame completion durations from Android's combined frame timeline;
- availability of actual FrameTimeline surface records;
- input dispatch-to-acknowledgment time;
- input-to-associated-frame presentation time, when Android supplies that association.

Missing samples remain `unavailable` with null durations. Trace errors or data loss invalidate the
measurement. A capture without app frame samples fails rather than reporting zero latency.
Input acknowledgment is not visible-screen readiness, and a frame duration is not FPS or the
complete navigation interval. Correlate trace slices with the actual interaction and destination
assertions before attributing a delay to JavaScript, Fabric, rendering or backend work.

To analyze a preserved trace again:

```sh
bun run perfetto -q scripts/performance/android-summary.sql <private-capture.pftrace>
```

Compare entry, cached reentry, tab changes and Back/selection transitions with the same fixture,
binary/runtime, device and motion settings. Record run counts and observed variation. Debug
profiling can explain work but does not establish release-build latency; repeat acceptance on the
distributed release APK before claiming the user-visible problem is resolved.

PR and Main verify the pinned Perfetto CLI and parse all Maestro flows as static tooling checks.
They do not execute the disabled mobile E2E suite or capture a device trace.
