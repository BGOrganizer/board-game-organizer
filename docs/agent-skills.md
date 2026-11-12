# Agent skills

Skills are task-scoped guides, not authority to expand a task. Resolve conflicts in this order:

1. the explicit user request;
2. the root `AGENTS.md` and repository invariants;
3. current code, tests, workflows, installed package types, and official documentation;
4. skill guidance and generic examples.

Before implementation:

- Inventory with `bunx skills@1.8.1 list`. Verify actual skill paths and the intended agent's
  discovery/diagnostics; a lock entry or CLI success alone does not establish availability.
- Select explicit skill names and the intended agent on installation, in project scope; do not install
  whole vendor collections. Managed sources/integrity live in `skills-lock.json`.
  Repository-specific architecture rules live in [AGENTS.md](../AGENTS.md#4-architecture-and-ui-ownership),
  rather than an installed skill.
- Load the smallest applicable set. Read bundled references only as needed; inspect bundled scripts
  before executing them. Prefer first-party guides and verify community advice against installed
  versions. This file references guides; do not duplicate their full bodies here.
- If a global skill has the same name, inspect diagnostics and use the project's locked guide
  explicitly rather than assuming which copy `/skill:<name>` selected. Do not delete global skills
  or global agent packages as a project cleanup side effect.
- Do not hand-edit installed vendor skills or integrity records outside an explicit skill-management
  task. Retained guides must not be upgraded incidentally while installing another guide.
- No skill may add npm/yarn, ESLint, Prettier, Expo web, another UI system, duplicated server state,
  speculative abstractions, or unrequested packages/configuration. Generic routers may reference
  removed/uninstalled siblings: use the selected set or official docs, not an automatic reinstall.
- Installed for future use does not mean implemented, enabled, or authorized. Report the skill names
  actually used, not every available guide. Skill installation does not prove runtime acceptance.

## Project-wide programming baseline

`ponytail` from [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) is the default
programming guide for this repository, at **full** level. Read the installed
`.agents/skills/ponytail/SKILL.md` when implementing, fixing, refactoring, reviewing code or choosing
dependencies in any app, package, script or workflow. Combine it with the relevant domain/platform
guide below; it supplies implementation judgment, not framework APIs.

The guide favors the smallest change that fully completes the task: inspect callers and failure
cases, reuse existing implementations before adding code or dependencies, and avoid speculative
abstractions/options. This aligns with [architecture ownership](../AGENTS.md#4-architecture-and-ui-ownership)
and [verification](../AGENTS.md#7-verification); those rules stay the single source of project policy.

Apply these interpretations in BGO:

- Existing HeroUI components, Query ownership and platform adapters take precedence over generic
  standard-library/native-widget examples. Reuse must respect the web/native ownership boundary.
- A small diff still completes every authorized requirement, affected caller, EN/IT catalog and
  required test/acceptance path. The guide's small-test baseline does not replace project gates.
- Preserve useful comments explaining domain constraints, security and platform behavior; a short
  code change must remain readable and correct at edge cases.
- Report actual verification and material limits concisely. The guide's closing-note convention
  does not require repetitive warnings or a list of irrelevant things not done.

The operator can select `lite` or `ultra`, or disable Ponytail. `full` remains the project default;
`ultra` questioning is not enabled automatically. Only the core `ponytail` skill is installed:
review/audit/debt/gain/help companions and editor/plugin integrations are separate choices.

## Choosing guides

Read the applicable `SKILL.md` under `.agents/skills/<name>/` before applying it. Start with the
smallest relevant entry below, then load another guide only when the task crosses its boundary.
For example, a mobile translated form normally needs `expo-overview`, `heroui-native`, `uniwind`
and `lingui-best-practices`; add Query or navigation guidance only when those behaviors change.
A documentation-only task does not require the mobile stack.

Load skills by affected task:

| Task | Skills and repository-specific scope |
| --- | --- |
| Programming across the project | `ponytail` (full) as the baseline, then the applicable guides below |
| React/Next.js implementation and performance | `vercel-react-best-practices`; TanStack Query, not suggested SWR, owns remote data |
| Component architecture, extraction, or feature ownership | [AGENTS.md architecture rules](../AGENTS.md#4-architecture-and-ui-ownership), then `vercel-composition-patterns` and the relevant platform guide |
| Web UI/accessibility | `heroui-react` while implementing; `web-design-guidelines` for final review |
| React Native rendering/lists/performance | `vercel-react-native-skills`; no automatic FlashList, NativeWind, or alternative UI dependency |
| General Expo work/navigation | `expo-overview`, then `expo-router` only for touched routes/layouts/links/headers; generic `@expo/ui` routing is not applicable here |
| Native animation/gestures | `expo-animation` |
| Native requests/cache/offline/loaders | `expo-data-fetching` and `tanstack-query-development`; no SWR or duplicated server state |
| Native development clients/integration | `expo-dev-client`; `expo-examples` only for a version-matched official example |
| MapTiler maps/verified address search | `maptiler` and relevant platform guides; native MapLibre requires installed types/version-matched docs, not the guide's React Native GL JS tutorial |
| Expo/native dependency upgrade | `expo-upgrade`; Expo compatibility and exact mobile pins remain authoritative |
| EAS build/signing/store delivery | `eas-app-stores`; no provisioning or publication beyond requested scope |
| Mobile components/styling | `heroui-native`, `uniwind`; explicit structural style objects remain required |
| Native design consistency audit | `expo-design-system`, `heroui-native`, `uniwind`; extend existing CSS/tokens, never create a second theme or copy fallback custom controls/spinners |
| Clerk authentication | `clerk`, then only applicable `clerk-nextjs-patterns`, `clerk-expo`, `clerk-backend-api`, `clerk-cli`, `clerk-webhooks`, `clerk-testing`, or `clerk-custom-ui` |
| Query keys/hooks/mutations/paging/hydration | `tanstack-query-development`; preserve [state ownership](state-and-cache.md), fresh tokens, cancellation, and selective rollback |
| Local state/drafts | `zustand-state-management`; never mirror Query data |
| Web Playwright tests/debugging | `playwright-best-practices`; add `clerk-testing` for authenticated flows; mocks/skips/fabricated reports are not real acceptance |
| Native Maestro flows | `maestro-mobile-testing` (project-locked, reviewed against Maestro 2.11); current acceptance contracts/CI gates and version-matched official docs remain authoritative; no mocked acceptance, optional required steps, synthetic visibility markers, animation disabling, or Limrun/cloud dependency |
| Lingui/localization | `lingui-best-practices`; web macros, mobile `useT`/`translate`, EN/IT source and compiled catalogs; no mobile Babel or suggested ESLint plugin |
| Existing native Sentry integration | `sentry-react-native-sdk`; verify installed SDK/Expo APIs and existing release/Fabric safeguards; no new web/API instrumentation or SDK upgrade |
| Development secret injection | `infisical-setup`, with its CLI local-development reference; explicit per-app/environment scope, not a root Turbo process receiving every app's secrets |

## Repository safeguards

The [root security rules](../AGENTS.md#9-security-configuration-and-external-services) govern Clerk
versus BGO authority, MapTiler attribution/quotas, Sentry privacy and Infisical scope.
Use version-matched installed MapLibre APIs rather than the generic React Native GL JS examples.
HeroUI/Uniwind remain the UI system: no `@expo/ui` substitution, extra theme, custom spinner or
unrequested framework. Tailwind v4 web advice does not override native structural style requirements.

## Documentation

Use `create-readme` for README changes and `create-agentsmd` for repository instructions.
Both project-locked guides come from `github/awesome-copilot`. Generic examples never override
repository commands, safety or package choices. If a required guide is absent, report it and
use current code and official documentation where sufficient; do not automatically reinstall it.


## GitHub Actions

| Skill | When to use it | Application in BGO |
| --- | --- | --- |
| `github-actions-efficiency` | Investigate slow, queued, duplicated or expensive CI; change caching, concurrency, triggers or matrices | Measure runs and distinguish queue time, wall-clock time and runner minutes. Preserve required checks and existing deployment/acceptance gates. Separate static findings from live evidence. A suggested test push requires authorization under the current task. |
| `github-actions-hardening` | Review workflow security or design a workflow that handles credentials, artifacts or external contributions | Map actual trigger permissions and trust boundaries; inspect expression injection, token scopes, action pins, caches and artifact provenance. Audit findings first; do not silently change provider permissions or secrets. Verify broad skill claims against actual GitHub settings and official documentation. |
| `github-actions-templates` | Add a workflow or reusable job when existing local actions do not already cover the need | Adapt patterns to current repository versions, Bun, Biome and existing composite actions. Examples using npm, old Node/action versions, Kubernetes or external scanners are examples, not project requirements. |

For an existing CI change, start with the relevant efficiency or security guide; consult templates
only for a concrete missing pattern. For a new workflow, use templates for structure and hardening
for review. Read `.github/workflows`, their local actions/scripts and the affected app instructions
before editing. Installing these guides does not itself change workflows or prove live CI behavior.

## Authentication and provider operations

Use `clerk` to select a focused guide; do not load the entire collection.

| Skill | When to use it in this project |
| --- | --- |
| `clerk-nextjs-patterns` | Web/API Clerk middleware, server authentication and Next.js integration. |
| `clerk-expo` | Mobile Clerk flows, session integration and native OAuth. |
| `clerk-custom-ui` | Custom sign-in/sign-up flows or Clerk component appearance. |
| `clerk-cli` | Explicit Clerk inspection or administration through the installed CLI; inspect scope before mutations. |
| `clerk-backend-api` | Inspect or call Clerk REST endpoints when the task requires backend operations. |
| `clerk-webhooks` | Verify webhook signatures and synchronize the existing local user mirror. |
| `clerk-testing` | Test authenticated flows alongside the relevant Playwright or Maestro guide. |
| `clerk-setup` | A requested new Clerk integration; ordinary maintenance uses the existing integration guides. |
| `clerk-orgs` | Only an explicit Clerk tenancy task. BGO Groups, membership and moderation remain MongoDB/API concepts. |
| `clerk-billing` | Only an explicitly requested billing feature; availability does not mean BGO has billing enabled. |

## Additional Expo and EAS guides

| Skill | When to use it in this project |
| --- | --- |
| `expo-project-structure` | Scaffold a new Expo project only; do not reorganize this existing app to match a template. |
| `eas-update` | Configure or diagnose OTA updates, channels and runtime compatibility within an explicit update task. Native changes still require a new binary. |
| `eas-update-insights` | Inspect adoption, crashes and embedded-versus-OTA usage after a published update; do not infer health from a successful upload. |

`eas-app-stores`, covered above, owns production builds, signing and store submission.
`expo-dev-client` owns development builds. Neither guide authorizes publication, signing changes,
paid services or provider provisioning outside the requested task.

## Inventory and sources

`skills-lock.json` records exact source integrity. The tables above cover every locked skill;
this source index identifies where each family comes from. The installation is project-scoped,
not a global agent installation.

| Source repository | Guides |
| --- | --- |
| `github/awesome-copilot` | `create-readme`, `create-agentsmd`, `github-actions-efficiency`, `github-actions-hardening` |
| `wshobson/agents` | `github-actions-templates` |
| `dietrichgebert/ponytail` | `ponytail` |
| `clerk/skills` | All eleven `clerk` / `clerk-*` guides listed above |
| `expo/skills` | All nine `expo-*` and three `eas-*` guides listed above |
| `heroui-inc/heroui` | `heroui-react`, `heroui-native` |
| `infisical/ai-skills` | `infisical-setup` (formerly `infisical-user-setup-guide`) |
| `lingui/skills` | `lingui-best-practices` |
| `foreztgump/maestro-mobile-testing-skill` | `maestro-mobile-testing` |
| `maptiler/maptiler-skills` | `maptiler` |
| `currents-dev/playwright-best-practices-skill` | `playwright-best-practices` |
| `getsentry/sentry-agent-skills` | `sentry-react-native-sdk` |
| `uni-stack/uniwind` | `uniwind` |
| `axross/skills` | `tanstack-query-development` (canonical copy missing at this inventory) |
| `vercel-labs/agent-skills` | `vercel-composition-patterns`, `vercel-react-best-practices`, `vercel-react-native-skills`, `web-design-guidelines` (canonical copies missing at this inventory) |
| `mkgp-dev/codex-skills` | `zustand-state-management` (canonical copy missing at this inventory) |

Desktop inventory after the Clerk/Infisical repair: **44 locked guides, 38 present under `.agents/skills`,
6 missing canonical copies**. A missing canonical copy is not evidence that no global copy exists;
verify discovery and source before use. These six remain documented for their intended scope,
but are not presented as locally ready. Do not reinstall or upgrade them implicitly.

The version 2 lock records portable content hashes and a commit revision for every source.
Clerk's eleven skills use their current `skills/<name>/SKILL.md` paths; Infisical uses the
upstream `infisical-setup` name. Historical revisions for the other installed guides were
checked against their complete local contents, retaining their instructions rather than
upgrading them during this repair.
For a new checkout, restore the locked set with:

```bash
bunx skills@1.8.1 experimental_install --agent codex --frozen-lockfile
bunx skills@1.8.1 list --agent codex
```

A version 1 lock cannot be restored frozen on an empty installation with this CLI: its migration
needs existing files to derive version 2 hashes. Use the repaired version 2 lock rather than
disabling integrity checks. Existing upstream path/name changes require a scoped repair; do not
update unrelated guides just to make restore succeed. Restore existing skills before adding new
ones on another machine so their hashes remain verifiable.

To refresh the inventory, run `bunx skills@1.8.1 list --agent codex` (substitute the intended
agent), compare it with the lockfile and check the actual `SKILL.md` paths. Keep this guide current
when installing/removing guides. Preserve unrelated locked entries during a scoped installation;
CLI output alone is not proof that existing guide integrity was preserved.
