# GitHub automation

## Workflows

| File | Display name | Responsibility |
| --- | --- | --- |
| [pr-ci.yml](workflows/pr-ci.yml) | CI | Route branch/PR events, run shared checks, then independent isolated CI and Development publication lanes. |
| [main-ci.yml](workflows/main-ci.yml) | Release | Verify every merge, serialize version preparation, build the pinned APK, deploy and publish the verified release. |
| [pr-ci-fail-fast.yml](workflows/pr-ci-fail-fast.yml) | CI watchdog | Cancel only shared-quality failures; keep lane-specific failures isolated. |
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
- Native builds install dependencies unless the same checkout was already installed for APK inspection.
- Notification-only jobs set up tooling without installing the application workspace.
- APK discovery reads candidate IDs/revisions together, then verifies each candidate's relevant diff,
  successful build, unexpired artifact, embedded API/configuration and checksum.
- PR publication depends only on shared checks and the Development lane. Repeated current-head checks
  bracket external writes and must not be deduplicated away.
- Explicit-ID/run cleanup never performs an age sweep. Orphan cleanup only deletes marked, old users
  with a recognized completed owner; live Clerk keys, active reruns and unverifiable ownership are rejected or retained.

## Tool identities

Third-party Bun/Codecov actions use reviewed commit SHAs with major-version comments.
EAS CLI **27.7.2** and Vercel CLI **65.14.0** use exact Bun global installs.
Maestro **2.11.0** is downloaded from its tagged GitHub release and checked against the release asset's
SHA-256 before extraction. Updating these identities is an explicit dependency/tooling task;
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

GitHub required-check settings still need coordinated alignment with the short job labels;
a local YAML edit does not migrate branch protection or activate default-branch controllers.
