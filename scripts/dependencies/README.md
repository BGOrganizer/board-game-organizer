# Dependency source policy

Bun runs [registry-policy.mjs](registry-policy.mjs) before installing dependencies, through
`install.security.scanner` in the root `bunfig.toml`.

This preserves the registry-source boundary during the package-manager migration: resolved
packages must use HTTPS npm registry tarballs and exact registry versions. Git/GitHub, local
archives, remote non-registry sources and credential-bearing URLs fail the install. Workspace
links are project packages, not registry downloads. Review a requested source change explicitly.
The guard adds no external scanning service and does not claim CVE detection.

The root config also preserves the previous one-day release-age gate for newly resolved versions,
uses the hoisted linker, disables Bun's extra env loading and keeps Node shebangs on Node.
Existing lock entries remain pinned. The explicit `trustedDependencies` list is the install-script
allowlist; `cpu-features`, `protobufjs` and `ssh2` remain blocked. Do not broaden it with `bun pm trust --all`.

Run `bun install --frozen-lockfile` from the repository root. Tests live in
[the workflow-script suite](../../.github/scripts/__tests__/bun-policy.test.mjs).
