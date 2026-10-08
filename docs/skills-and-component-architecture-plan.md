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

`expo-native-ui`, `eas-workflows`, and `eas-simulator` are already installed. Remove them from the
selected project set under the user's rejection of these optional skills; "do not add" does not
mean retaining the already-installed copies. Do not install replacements.

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
- Keep component implementations focused and reasonably concise. Roughly 400 lines in a component
  is a signal to review responsibilities, branching, repeated markup, and readability, not a hard
  limit or an automatic CI failure. Use judgment: extract cohesive subcomponents/hooks/pure logic
  when that improves understanding and testing. Do not split code mechanically, hide complexity
  in indirection, or add abstractions merely to get below a line count. Count implementation
  complexity, not just total file lines including comments, types, or private helpers.
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

## 6. OpenSandbox: skill evaluation only

The user has already implemented the OpenSandbox integration. **No Docker images, MCP server,
network/device setup, deployment, proof of concept, or infrastructure migration belongs to this
plan.** Do not repeat that work or treat the earlier architecture notes as an implementation task.

The verified official candidate is
[`troubleshoot-sandbox`](https://github.com/opensandbox-group/OpenSandbox/tree/main/skills/troubleshoot-sandbox).
It covers diagnostics such as logs, inspect/events, OOM, crashes, image pulls, and networking via
OpenSandbox CLI/HTTP API. It is a troubleshooting skill, not a general application architecture
skill. Keep it task-scoped, review its referenced commands against the existing integration, and
obtain explicit selection before installation. An installed diagnostic skill does not grant
permission to create/delete sandboxes or reconfigure the running integration.

## 7. Detailed implementation plan and exit gates

This task covers the selected skill set, the project architecture skill, and agent instructions.
**It does not move/refactor application components.** The folder convention applies to new work
and later explicitly requested refactors; no pilot or repository-wide migration is required here.

### Phase 1 — preflight and protected baseline

1. Stay on `feat/organizations-events`; do not rebase onto main, push, or open a PR.
2. Record the project inventory, canonical paths/link targets, source lock, and Pi-discovered names.
   Record global duplicates separately without changing them.
3. Back up the Git index and both staged/unstaged patches. Preserve private environment/MCP files.
   Separate task changes from existing changes to `.gitignore`, `AGENTS.md`, and `skills-lock.json`.
4. Inspect skills CLI removal/selection behavior before modifying the project set. A CLI listing
   alone is not the acceptance check for Pi discovery.

Exit: recoverable baseline and exact project-only scope; no runtime, secret, or global changes.

### Phase 2 — curate the existing set

1. Remove exactly the 41 installed project skills listed in Section 2, including the three rejected
   optional skills. Safely reconcile Mapbox's canonical files and links, not unrelated directories.
2. Reconcile the orphan `clerk-expo-patterns` lock entry through the CLI.
3. Retain the 32 agreed skills, including future Clerk features, OTA, project structure, and the
   guarded `expo-design-system`. Do not refresh every retained skill as an incidental upgrade.
4. Use project scope and explicit `--agent pi`; verify no global Pi package/tool was removed.

Exit: 32 retained project names before additions, no stale removed links, and a consistent lock.

### Phase 3 — install narrow, verified guides

1. Install only the approved `maptiler` and `playwright-best-practices` selections.
2. Select `infisical-user-setup-guide` because its local-development injection scope meets the
   user's condition. Verify the declared name rather than selecting by its folder name.
3. Recommend only `lingui-best-practices` and `sentry-react-native-sdk` from their verified official
   collections. Obtain selection for these newly researched candidates; do not install all Lingui
   setup/migration tools or all Sentry frameworks.
4. Do not install the evaluated Tailwind guide or either Maestro candidate by default. Keep the
   community Maestro guide pending a narrower compatibility/script review, not an invented claim
   that no Maestro skill exists.
5. Handle `troubleshoot-sandbox` only if explicitly selected, as a skill addition, never an
   infrastructure workstream. Do not add Inngest setup or provision its external service.

Exit: each selected name has the correct source, reproducible integrity, and actual Pi discovery;
no application dependency, authentication, telemetry, secret, or environment changes.

### Phase 4 — write the small BGO architecture skill

1. Create `bgo-component-architecture`, applying only to BGO component ownership, feature folders,
   platform boundaries, and proven headless reuse. Reuse the existing Vercel composition guide.
2. Encode one public component per file, private module-scope helper exceptions, feature ownership,
   and promotion to `common/ui` only for real cross-feature reuse. Add a component concision review:
   around 400 implementation lines is a warning to inspect complexity, never a hard line ceiling.
3. Encode shared pure logic/hooks and optional headless providers without universal page layout,
   native/browser/routing imports, duplicated Query state, or request-scoped module singletons.
4. Give the custom source a narrow tracked exception or managed source. Do not expose the rest of
   `.pi`, tokens, settings, generated skills, or caches in Git.
5. Check the guide against representative current files without moving those files or creating
   example components/providers. Do not introduce a linter, checker framework, or architecture
   dependency just to enforce the convention.

Exit: portable discovery and actionable rules that match the current repository and its invariants.

### Phase 5 — clarify AGENTS.md, not duplicate the skill bodies

The existing `Agent skills` section already has precedence, loading rules, and a task-to-skill
matrix. Extend that section rather than creating a second competing instruction system.

Add the following explicit safeguards:

- Skills do not override the explicit request, repository invariants, installed versions, tests,
  or current workflow requirements; retention for future use is not activation or scope approval.
- Clerk Organizations are not BGO organizations. `clerk-orgs` may be loaded only for an explicitly
  requested Clerk tenancy task, never because a BGO organization screen/API is being changed.
- Next.js and Expo routing/UI stay in their apps. Not every non-JSX hook belongs in shared.
  Shared headless behavior does not impose a universal page/container or accessibility contract.
- One public component per file with private module-level helpers allowed; feature folders inside
  each app's components directory; `common/ui` is not a dumping ground or replacement UI library.
- Components should not become excessively verbose. Around 400 implementation lines merits a
  responsibility/readability review, not a mandatory split or lint/CI limit. Extract coherent
  behavior/UI pieces when useful; do not game line counts or replace clarity with abstractions.
- HeroUI and Uniwind remain the design system. Generic Expo examples must not introduce `@expo/ui`,
  NativeWind, another theme, custom replacements for available HeroUI controls, or spinners where
  repository loading policy requires skeletons.
- Generic Vercel recommendations for SWR, new native list libraries, or alternative styling do not
  replace the installed TanStack Query/Uniwind/virtualized-list ownership conventions.
- MapTiler's GL JS React Native tutorial does not replace installed native MapLibre APIs. Preserve
  verified geocoding, attribution, current SDK versions, and the noncommercial product context.
- Lingui's preferred macros apply on web, not to mobile's runtime helper exception. No mobile Babel
  or suggested ESLint plugin. Preserve provider/portal context and EN/IT source/compiled catalogs.
- Sentry examples do not authorize PII, additional tracing/replay/logging, production replay, SDK
  upgrades, or instrumentation on other platforms. Preserve the current release/Fabric safeguards
  and request explicit review for existing privacy settings.
- Infisical development injection is scoped per app/environment; no secret changes, plaintext
  committed exports, production changes, or public-prefix leakage from reading/installing a skill.
- Mock API/auth-adaptive examples are not real E2E acceptance. Preserve deterministic actor setup,
  device permission tests, real reports, errors/skips checks, and the current Vitest 3.2 baseline.
- Generic routers may refer to removed/uninstalled sibling skills. Do not reinstall them or add
  dependencies just because a retained router suggests them; use the selected set and official docs.
- OpenSandbox troubleshooting remains diagnostic and subject to the user's runtime-operation
  authorization; its integration is already implemented and outside this plan.

Extend the existing task matrix with short routing references, not copies of upstream tutorials:

| Task | Guide to load, once selected/installed | Repository guard |
| --- | --- | --- |
| Component architecture/feature ownership | `bgo-component-architecture`, then `vercel-composition-patterns` and the relevant platform guide | No routing/UI migration as a side effect |
| Native design consistency audit | `expo-design-system`, `heroui-native`, `uniwind` | Extend existing tokens; no second system |
| MapTiler web/geocoding | `maptiler` plus relevant web guide | Native MapLibre needs installed types/version-matched docs |
| Playwright tests/debugging | `playwright-best-practices`; `clerk-testing` for authenticated flows | No fabricated/skipped/mocked acceptance |
| Lingui/localization | `lingui-best-practices` | Web macros; mobile runtime helpers; EN/IT; Biome |
| Existing native Sentry | `sentry-react-native-sdk` | Version/privacy/release safeguards; no auto-configuration |
| Development secret injection | `infisical-user-setup-guide` | Explicit app/environment scope; never print secrets |
| Existing OpenSandbox diagnostics | `troubleshoot-sandbox`, only if selected | No infrastructure provisioning or destructive operations by default |
| Future Clerk billing/tenancy, OTA, new Expo project | Only the matching retained guide after an explicit task request | Installed does not mean implemented or enabled |
| Native Maestro flows | Existing repository flows/CI rules and version-matched official docs | No unreviewed community skill substitution |

Use portable skill names and references; `skills-lock.json` records managed sources. Do not put
machine-specific paths or full skill contents into `AGENTS.md`. Load the smallest relevant set,
read bundled references on demand, inspect scripts before execution, and report guides actually used.

Exit: one source of truth for loading and conflicts; no confusing future-feature or platform routing.

### Phase 6 — validate and commit locally

1. Compare CLI inventory, actual Pi discovery, canonical paths, sources, and integrity. Verify the
   retained future guides and all removals. Keep global settings/packages untouched.
2. Validate custom frontmatter/name/description, skill references, tracked-source exceptions,
   Markdown/whitespace, and the exact staged diff. Ensure private configuration remains excluded.
3. Review AGENTS.md and the architecture guide against both platform adapters and representative
   component files. No app tests/native builds are required for instruction-only changes; if scope
   later includes behavior changes, run the relevant existing lint/typecheck/unit/E2E gates.
4. Make focused signed local commits for curation and architecture/instructions. Include only task
   changes, preserving unrelated staged/unstaged work. Verify signatures and show committed paths.
5. Report the final selected/discovered set and any intentionally deferred candidates. Do not push,
   open a PR, install infrastructure, or claim that unfinished feature acceptance is now green.

All implementation commits remain local on `feat/organizations-events` until the user explicitly
authorizes a push. Documentation revisions for this request contain the plan only; implementation
of the plan is a separate step.
