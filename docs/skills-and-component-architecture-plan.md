# Skills and component architecture plan

Status: **plan only**. The local documentation commit does not remove/install skills, change
application behavior, reorganize components, provision OpenSandbox, or change secrets.

Branch: `feat/organizations-events`. Commit locally with the configured SSH signature; do not push,
open a PR, merge, or include unrelated staged changes.

## 1. Decisions and scope

Keep the current Next.js and Expo Router applications, HeroUI React/HeroUI Native, Tailwind CSS v4,
Uniwind, TanStack Query, Zustand, Lingui, and API boundaries. No new UI framework, package manager,
ESLint configuration, universal UI package, or speculative migration.

**Clerk Organizations and BGO organizations are different domains.** Clerk Organizations are Clerk
identity/tenancy constructs. BGO organizations, members, moderation, and events belong to the BGO
MongoDB/API domain. Keeping `clerk-orgs` for future use does not authorize connecting these domains,
replacing BGO membership/authorization with Clerk organization membership, or implementing tenancy.

The existing feature's runtime acceptance is still incomplete. This plan is not evidence that
Playwright, Maestro, native release builds, or external Inngest delivery have passed.

## 2. Project skill curation

Inventory on 2026-10-08: 73 installed project skill names, 74 entries in `skills-lock.json`.
`clerk-expo-patterns` is in the lock but absent on disk. Seventeen Mapbox entries in `.pi/skills`
are links to `.agents/skills`, not independent copies. Eight Clerk skills also exist globally;
five global/project copies differ. This task does not authorize removing global skills or Pi
packages used by other repositories.

### Keep the agreed 25-skill baseline

- React/web: `vercel-react-best-practices`, `vercel-composition-patterns`,
  `web-design-guidelines`.
- React Native: `vercel-react-native-skills`.
- Existing UI: `heroui-react`, `heroui-native`, `uniwind`.
- State: `tanstack-query-development`, `zustand-state-management`.
- Clerk: `clerk`, `clerk-nextjs-patterns`, `clerk-expo`, `clerk-backend-api`, `clerk-cli`,
  `clerk-custom-ui`, `clerk-testing`, `clerk-webhooks`.
- Expo: `expo-overview`, `expo-router`, `expo-animation`, `expo-data-fetching`,
  `expo-dev-client`, `expo-examples`, `expo-upgrade`.
- Distribution: `eas-app-stores`.

Also retain, as explicitly requested: `clerk-billing`, `clerk-orgs`, `clerk-setup`, `eas-update`,
`eas-update-insights`, and `expo-project-structure`. Retention is not permission to implement these
features. `expo-project-structure` applies to new projects, not a wholesale rewrite of this one.

Retain `expo-design-system` for detection, audits, composition, and incremental consistency only.
Its instruction to adopt an existing design system fits HeroUI/Uniwind. Do not copy its fallback
custom Button, spinner, platform palette, or separate `theme.ts` into this application. Existing
HeroUI tokens and CSS remain authoritative; native structural layout still uses explicit style
objects. Do not edit upstream skill files to make them appear compatible.

This gives **32 existing project skills to retain**.

### Remove from this project

- All 17 `mapbox-*` skills.
- Other Clerk frameworks: `clerk-android`, `clerk-swift`, `clerk-astro-patterns`,
  `clerk-nuxt-patterns`, `clerk-vue-patterns`, `clerk-react-patterns`,
  `clerk-react-router-patterns`, `clerk-tanstack-patterns`,
  `clerk-chrome-extension-patterns`.
- Unused EAS targets: `eas-hosting`, `eas-observe`.
- Other Expo scenarios: `expo-app-clip`, `expo-brownfield`, `expo-dom`, `expo-web-to-native`.
- Expo/module/skill development: `expo-module`, `expo-migrate-module`, `expo-skill-eval`,
  `expo-skill-feedback`.
- Alternative UI and completed migration: `expo-ui`, `heroui-migration`.

`expo-native-ui`, `eas-workflows`, and `eas-simulator` are already installed despite the discussion
phrasing "do not add". Interpret the user's rejection as removing them from the selected project
set; call out this interpretation before execution.

The resulting removal set is **41 installed project skills**. Reconcile the additional orphan
`clerk-expo-patterns` lock entry using the skills CLI, not a hand-edited integrity record. Preserve
links safely and verify actual Pi discovery; `Agents: not linked` alone does not prove absence.
Use project scope and explicitly select `--agent pi`. Do not install entire vendor collections.

### Verified additions and research results

| Candidate | Source | Decision and guard |
| --- | --- | --- |
| `maptiler` | [MapTiler official skills](https://github.com/maptiler/maptiler-skills) | Approved. Applicable to web SDK/geocoding. Its React Native reference discusses MapLibre GL JS, not a version-matched guide for our `@maplibre/maplibre-react-native`; do not replace native maps or add Expo web. |
| `playwright-best-practices` | [Currents](https://github.com/currents-dev/playwright-best-practices-skill) | Approved. Review fixtures, multiuser auth, selectors, and debugging. No new testing architecture/dependencies, skipped acceptance, fake JUnit, or increased timeouts to hide failures. |
| `infisical-user-setup-guide` | [Infisical official skills](https://github.com/infisical/ai-skills) | Meets the requested development-injection scope. File is `skills/infisical-setup/SKILL.md`, but declared skill name is `infisical-user-setup-guide`; verify CLI discovery before selection. |
| `lingui-best-practices` | [Lingui official skills](https://github.com/lingui/skills) | Newly verified candidate, not an automatic full-suite install. Keep Lingui 6, EN/IT catalogs, web macros, and mobile runtime helpers. Do not add mobile Babel or the suggested ESLint plugin. |
| `sentry-react-native-sdk` | [Sentry official agent skills](https://github.com/getsentry/sentry-agent-skills) | Candidate for the existing mobile SDK, not permission to add Sentry to web/API. Check installed SDK 7.11 APIs and Expo 57 before using examples. |
| `tailwind-design-system` | [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/frontend-mobile-development/skills/tailwind-design-system) | Evaluated community v4 guide. Defer: its fresh token/theme system overlaps HeroUI. Existing HeroUI/Uniwind skills and Tailwind v4 documentation cover the current need. |
| `maestro-mobile-testing` | [tovimx community skill](https://github.com/tovimx/maestro-mobile-testing-skill) | Relevant candidate, not yet approved for installation. Review bundled references/scripts and validate commands against Maestro 2.11. Its adaptive auth and mock-API examples must not replace deterministic actor provisioning or real acceptance. |
| `limrun-maestro-testing` | [Limrun](https://github.com/limrun-inc/skills) | Do not select: requires Limrun cloud iOS workflows, not our local/CI Android and planned OpenSandbox setup. |
| `troubleshoot-sandbox` | [OpenSandbox official skill](https://github.com/opensandbox-group/OpenSandbox/tree/main/skills/troubleshoot-sandbox) | Defer until the sandbox integration task. Troubleshooting scope, not a complete deployment/security architecture. |

Repository/star/install popularity is supporting evidence, not a security or compatibility
certificate. MapTiler, Lingui, and Sentry's relevant skill repositories are relatively new; their
first-party ownership matters more than installation counts. Do not confuse Sentry's internal
`getsentry/skills` or `getsentry/sdk-skills` with application SDK integration skills.

Do not select the evaluated `axross/skills/vitest-testing`: it explicitly targets Vitest 4.x,
whereas this repository deliberately retains 3.2. External Inngest provisioning remains excluded;
no additional Inngest skill is needed for this curation task.

## 3. Development secret injection

Select Infisical's local-development CLI guidance, not `infisical-secret-syncs`. Prefer scoped
process environment injection with `infisical run -- <command>` over exporting plaintext files.
Use the project's actual development environment slug and per-application secret paths; do not
assume that slug is `dev` or inject every app's secrets into a root Turbo process.

- Developers use the existing authorized login workflow; automation uses least-privilege machine
  identities, preferring workload identity/OIDC where supported.
- Never log, serialize into tools/skills, commit, bake into Docker layers, or publish private keys.
- `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are public client configuration, even when Infisical
  or Vercel labels them Secret. Never put backend credentials behind these prefixes.
- Preserve the current Vercel remote-build design and run-scoped CI database overrides. Do not
  change Infisical projects, Production, CORS, or existing credentials as part of skill installation.
- Verify SDK/CLI behavior and native public-variable timing before changing development commands.

## 4. React architecture recommendation

The existing composition skill is a good general guide, but does not encode this repository's
platform boundaries, folder convention, or file ownership rule. Add a small **project-specific**
`bgo-component-architecture` skill, referencing rather than copying Vercel composition guidance.
Create it in the implementation phase; do not add an architecture library.

### Dependency and ownership boundaries

| Responsibility | Location |
| --- | --- |
| Next.js routes/layouts, RSC boundaries, browser APIs | `apps/web/src/app` and web-specific adapters |
| Expo Router routes/layouts, native permissions, navigation, haptics | `apps/mobile/src/app` and native-specific adapters |
| DOM/HeroUI web layouts and accessible controls | Web components |
| React Native/HeroUI Native layouts and accessible controls | Mobile components |
| Platform-independent business rules, DTO-facing helpers, reusable data hooks | `packages/shared` |
| Pure validation/models | `packages/schemas` |
| Remote data/cache | TanStack Query; identity-scoped keys and fresh request tokens |
| Local UI/draft state | Zustand/local React state; never mirror Query data |
| Database access, privileged auth, server-only secrets | API app; never client shared code |

"No JSX" does not mean "belongs in shared": `useCommunityApi` correctly stays in each app because
web uses Clerk/Next public env and mobile uses native session/config/feedback adapters. Share
platform-neutral behavior when there is real reuse, not every non-component file.

### Headless reuse: yes; a universal page renderer: no

Prefer, in order:

1. Pure function for deterministic behavior.
2. Shared hook for the same business workflow/data model on both platforms.
3. A headless provider/controller **only if several children need the same instance** of that
   workflow. It may render a React context provider, fragment, or its `children`, without host UI.

A shared controller can expose state/actions; web and mobile supply their own views. It must not
render `div`, `form`, `View`, `Text`, HeroUI controls, navigation, DOM/native refs, or layout classes.
A headless provider is behavior composition, not a container that can enforce cross-platform
spacing, pagination UI, accessibility semantics, or page structure.

Reuse layout patterns **within each app** using small `children`-based frames. Use render props
when passing data back requires them, not an unconditional ban. Do not build a `Page` abstraction
with platform flags, `cloneElement` contracts, many `renderX` props, or placeholder slots for future
screens. Share pagination state/API helpers, not a universal list renderer. Native rendering
remains virtualized and web rendering preserves its pagination/windowing strategy.

In Next.js, keep server pages server-capable. Put client hooks/providers behind a narrow client
boundary; never mark the entire shared package or all route files `"use client"`. Avoid request/user
state in module-level singletons and giant contexts that rerender unrelated screens.

### Component ownership rule

- One public/top-level component per file, named after that component.
- Additional private components may stay in the same module when only that component uses them.
- Define private component functions at module scope, not inside the parent's render function:
  redefining component identity can remount children and lose state.
- Move a private helper to its own feature file when another module needs it. Promote to `common`
  only when multiple features share a real interaction/layout contract.
- Local hooks, types, and short helpers may be colocated. Extract substantial reusable business
  logic, not every five-line function. Avoid circular dependencies and overgrown public barrels.
- Respect Next.js/Expo routing entry files, which have framework-mandated exports; the rule must
  not prohibit route metadata/configuration exports or require moving route files.

### Folder convention

Use feature folders **inside each app's existing components directory**, as requested:

```text
apps/web/src/
  app/                       # Next.js routing unchanged
  components/
    events/
      EventDetail.tsx
      EventHeader.tsx
      __tests__/
    organizations/
    matches/
    common/                  # actual cross-feature components
      ui/                    # needed HeroUI compositions, not a replacement kit

apps/mobile/src/
  app/                       # Expo Router unchanged
  components/
    events/
      EventDetail.tsx
      EventHeader.tsx
    organizations/
    matches/
    common/
      ui/                    # native-only implementation

packages/shared/src/
  events/                    # introduce only when migrating real shared code
    hooks/
    lib/
    providers/               # only if headless composition is justified
```

This is a destination convention, not permission to scaffold empty folders. Keep feature-private
parts with that feature. Avoid feature-to-feature private imports; use a stable public contract or
an actually shared primitive. Move existing flat shared helpers incrementally, not all at once.

## 5. Sentry, Lingui, and design safety gates

- Current native `Sentry.init` already has `sendDefaultPii: true` and development-only replay/
  feedback integrations to avoid known release/Fabric crashes. Audit privacy separately; do not
  silently change these settings or enable replay/feedback in production from a generic example.
  Never send Clerk tokens, secret values, phone/contact lists, or arbitrary request bodies to
  breadcrumbs/logs. Tracing/profiling/replay rates need explicit cost/privacy decisions.
- Keep Lingui outside HeroUI Native's portal host so overlays retain translation context. Keep
  mobile `useT`/`translate`, manual runtime-only catalog entries, and compiled EN/IT catalogs.
- HeroUI supplies the existing design language and accessible primitives. Tailwind/Uniwind provide
  styling, not justification for a second component library or native structural utility rewrite.

## 6. OpenSandbox: separate infrastructure workstream

[OpenSandbox](https://github.com/opensandbox-group/OpenSandbox) provides Docker/Kubernetes-backed
sandbox lifecycle APIs and an MCP server. The documented MCP interface offers sandbox creation,
command execution, and file operations; it does not automatically expose domain-specific Maestro,
Playwright, or MongoDB tools just because their binaries exist in an image.

Start with a proof of concept using existing MCP/SDK capabilities before writing a custom server.
Provide purpose-built images or controlled adapters only when a concrete operation needs them.
Pin images, bound CPU/memory/PIDs/time, restrict mounts/egress, use authenticated transport, and
clean resources by exact ownership/run ID. A sandbox is not unlimited authority to access host
files, GitHub secrets, private accounts, or Production.

| Workload | Feasibility and first check |
| --- | --- |
| Playwright | Good first candidate: pinned Node/Playwright/browser image, test-only actors, exact Preview URL, artifact retrieval and real exit/JUnit status. |
| MongoDB | Isolated ephemeral replica set for transactions; private network, per-run database/user, seed/cleanup guards, never Production fallback. |
| Maestro Android | CLI image alone is insufficient. Requires an emulator/device and ADB. Validate `/dev/kvm`/nested virtualization on the actual host, or use an owned external emulator through a restricted connection. Docker Desktop/Windows support is not assumed. |
| Maestro iOS | Simulator requires a macOS host; not a normal Linux Docker image. |

Do not expose Docker's socket or ADB unauthenticated. Do not mount the real host Docker socket
inside an agent-controlled sandbox to make Testcontainers work. Use control-plane-created sibling
services or a separately isolated trusted Docker runner; adapt tests only after proving the setup.

Keep CI database namespaces and user cleanup guarantees, protection bypass handling, artifact
privacy, and real report validation. Missing, skipped, mocked, or fabricated acceptance must fail
rather than become green. The image/provisioning task needs its own threat model and resource/
cleanup tests; this documentation does not install or launch containers/emulators/MCP servers.

## 7. Ordered implementation plan and exit gates

### Phase 1 — deterministic skill set

1. Back up inventory, links, lock, Git index, and existing staged/unstaged work.
2. Confirm removal of the three already-installed rejected optional skills, then apply the approved
   project-only removal/retention set through the CLI. Reconcile the orphan entry.
3. Install only MapTiler, Playwright, and the scoped Infisical setup guide with `--agent pi`.
4. Decide on the reviewed Lingui/Sentry candidates; do not install Maestro or Tailwind blindly.
5. Recheck CLI inventory, Pi startup diagnostics/discovery, sources/integrity, and global skills.

Exit: agreed skill names and reproducible sources match discovery; no credentials/global package
changes, app dependencies, or unrelated files in the local signed commit.

### Phase 2 — repository-specific architecture skill and rules

1. Write a short `bgo-component-architecture` skill with the boundaries/ownership rules above.
2. Add these rules and the Clerk/BGO domain distinction to `AGENTS.md`, including the design-system
   and candidate-specific safeguards. Do not rewrite upstream installed skills.
3. Make the custom skill reproducible/tracked. `.pi/` and `.agents` are currently ignored: use a
   narrow custom-skill exception or a managed source, not force-add private `.pi` settings/tokens.
4. Add no blanket lint/checker framework. Validate a small representative implementation first;
   automate component ownership enforcement only if repeated violations justify it.

Exit: correct skill discovery, no routing/UI/state ownership conflicts, no new runtime dependencies.

### Phase 3 — one feature pilot

Choose a bounded existing feature with proven duplicated behavior. Inspect both clients and every
caller. Move its platform components into feature folders; extract shared behavior only where
contracts match. Keep platform adapters, query ownership, UI/accessibility, error/loading states,
and navigation intact. Demonstrate a headless provider only if a hook alone is insufficient.

Exit: lint, typecheck, relevant unit/shared coverage, web Playwright and native Maestro acceptance
for changed behavior. Update imports, tests, and per-file coverage paths without lowering thresholds.
Do not use a static import/folder test as runtime UI acceptance.

### Phase 4 — incremental rollout

Migrate one feature per focused commit, after the pilot. No repository-wide rename intertwined
with behavior changes. Keep exports/imports bounded and tests colocated; delete obsolete duplicates
only after callers and behavioral parity are verified.

### Phase 5 — OpenSandbox proof of concept

Start with Playwright and an isolated MongoDB service, then prove Android device/KVM connectivity
before promising Maestro in Docker. Validate authenticated MCP access, secret injection, resource
limits, isolation, retries, artifact extraction, and guaranteed cleanup. Keep iOS separate.

All implementation commits remain local on `feat/organizations-events` until the user explicitly
authorizes a push. The first commit for this request contains this plan only.
