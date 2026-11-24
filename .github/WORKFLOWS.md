# GitHub automation

## Workflows

| File | Display name | Responsibility |
| --- | --- | --- |
| [pr-ci.yml](workflows/pr-ci.yml) | CI | Route branch/PR events, run shared checks, then independent isolated CI and Development publication lanes. |
| [main-ci.yml](workflows/main-ci.yml) | Release | Verify every merge, serialize version preparation, build the pinned APK, deploy and publish the verified release. |
| [pr-ci-fail-fast.yml](workflows/pr-ci-fail-fast.yml) | CI watchdog | Wait for all mandatory test suites before cancelling remaining work after shared-quality failures; keep lane-specific failures isolated. |
| [pr-ci-cleanup.yml](workflows/pr-ci-cleanup.yml) | CI cleanup | Recover resources after an unsuccessful PR run, using trusted default-branch code. |
| [e2e-user-cleanup.yml](workflows/e2e-user-cleanup.yml) | Test users | Hourly/manual orphan cleanup after verifying the owning run has completed. |

Trigger, permission, publication and controller activation contracts live in
[operational gates](../docs/organizations-events-operations.md). PR E2E remains explicitly disabled;
green source tests do not establish authenticated browser/native acceptance.

## Actions and script boundaries

Local actions own reusable runner setup, Vercel deployment, APK builds, emulator/Maestro phases,
E2E provisioning and publication/notification entrypoints. Workflows describe dependencies and
credential scope; scripts implement routing, provenance, publication and recovery logic.

- Deployment actions prepare their own minimal tooling; callers do not install unused app dependencies.
- EAS publication jobs install the locked workspace dependencies: even uploading an existing APK resolves Expo config plugins.
- Each PR has one public Development prerelease, never marked Latest. Telegram links directly to
  its verified APK and Web app, and to the PR and full GitHub release. API links stay in the release.
  Uploads retain revision/checksum verification and EAS remains optional only for its known quota exception.
- Native builds install dependencies unless the same checkout was already installed for APK inspection.
- Notification-only jobs set up tooling without installing the application workspace.
- APK discovery reads candidate IDs/revisions together, then verifies each candidate's relevant diff,
  successful build, unexpired artifact, embedded API/configuration and checksum.
- PR publication depends only on shared checks and the Development lane. Repeated current-head checks
  bracket external writes and must not be deduplicated away.
- Site has its own coverage and build job. A trusted PR deploys a Site preview linked to that run's
  Development Web. Main deploys Site independently of the app release. See the
  [Site Vercel setup](../apps/site/README.md#vercel-and-github-actions).
- Explicit-ID/run cleanup never performs an age sweep. Orphan cleanup only deletes marked, old users
  with a recognized completed owner; live Clerk keys, active reruns and unverifiable ownership are rejected or retained.

## Tool identities

Third-party Bun/Codecov actions use reviewed commit SHAs with major-version comments.
EAS CLI **27.7.2** and Vercel CLI **65.14.0** use exact Bun global installs.
Maestro's version is pinned in [`.maestro-version`](../.maestro-version), downloaded from its tagged
GitHub release and checked against the reviewed release asset's SHA-256 before extraction. Local
[Maestro commands](../apps/mobile/.maestro/README.md) use the same installer. Updating these identities is an explicit dependency/tooling task;
never replace them with moving tags, `@latest` or a remote installer piped into a shell.

## Local verification

From the repository root, with locked dependencies installed and Node.js 26:

```sh
node --test .github/scripts/__tests__/*.test.mjs
```

The script tests use Node's test runner and mocked providers. Shell regressions need Bash, Git,
curl, jq and standard Linux tools; run on Linux/WSL or in a suitable disposable container.
They do not dispatch workflows, create/delete provider users or publish builds.

Validate workflow expressions with `actionlint`; check changed Bash scripts with `bash -n`.
Run Biome on changed JavaScript. Keep workflow contract tests aligned with script behavior,
including negative paths, without weakening required checks or mocking E2E acceptance.
Both CI lanes enforce 90% line, function and branch coverage for the shared release/Telegram
formatters through Node's test coverage flags on the same contract suite.
Branch, PR and Main unit jobs use each workspace's `test:coverage` command, enforcing at least
90% lines, functions, branches and statements through the same Vitest configuration used locally.
The API coverage command includes its unit and MongoDB integration projects in one report;
the separate integration job remains an independent required check.
Reassure measurements are paused by explicit operator request. Both complete web/mobile job
matrices and their paired baseline/current definitions remain retained with `if: ${{ false }}`,
but are absent from active deployment/release/readiness dependencies and watchdog requirements.
No skipped benchmark is reported as a passing performance measurement. Comparator, paired-helper
and other tooling unit tests remain active within ordinary tests.

The existing five-workspace 90% coverage matrix, real MongoDB integration, lint, typecheck, builds,
native tooling, release provenance and cleanup gates remain active. The retained rendering jobs
preserve same-runner sequencing, approved refs, strict samples/count caps and the documented
initial-main bootstrap policy for explicit resumption; see
[rendering benchmarks](../docs/render-performance.md#paired-statistical-ci-checks). There is no
fabricated old baseline or claim that the interrupted local measurement completed.

Native tooling checks verify pinned CLI identities and parse every Maestro flow without running a
device, emulator or E2E journey. Test matrices finish their other suites after a sibling failure.

Verify live GitHub required-check settings against the current workflow contexts and app identity.
A local YAML edit does not migrate branch protection or activate default-branch controllers;
settings changes require explicit scope and preservation of reviews and unrelated protections.

## Parallel Netlify deployment

`Deploy Netlify (Development)` and `Deploy Netlify (Production)` run alongside the existing
Vercel jobs when enabled. The Netlify action verifies the GitHub source and team-owned project
IDs, deploys API, Web and Site, and records their links in the job summary. It also deploys the
MCP gateway on Main and for the selected Development PR. Follow the
[Netlify setup and isolation rules](../docs/organizations-events-operations.md#parallel-netlify-deployment).
