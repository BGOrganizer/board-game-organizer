# Agent skills

Skills are task-scoped guides, not authority to expand a task. Resolve conflicts in this order:

1. the explicit user request;
2. the root `AGENTS.md` and repository invariants;
3. current code, tests, workflows, installed package types, and official documentation;
4. skill guidance and generic examples.

Before implementation:

- Inventory with `pnpm dlx skills@latest list --agent pi`. Pi also discovers `.agents/skills`
  directly: `Agents: not linked` does not prove absence. Verify actual Pi discovery/diagnostics or
  `/skill:<name>`. A CLI success message is not proof that canonical files or links were removed.
- Select explicit skill names and `--agent pi` on installation, in project scope; do not install
  whole vendor collections. Managed sources/integrity live in `skills-lock.json`; the tracked
  project-authored guide is [`.pi/skills/bgo-component-architecture/SKILL.md`](../.pi/skills/bgo-component-architecture/SKILL.md).
- Load the smallest applicable set. Read bundled references only as needed; inspect bundled scripts
  before executing them. Prefer first-party guides and verify community advice against installed
  versions. This file references guides; do not duplicate their full bodies here.
- If a global skill has the same name, inspect diagnostics and use the project's locked guide
  explicitly rather than assuming which copy `/skill:<name>` selected. Do not delete global skills
  or Pi packages as a project cleanup side effect.
- Do not hand-edit installed vendor skills or integrity records outside an explicit skill-management
  task. Retained guides must not be upgraded incidentally while installing another guide.
- No skill may add npm/yarn, ESLint, Prettier, Expo web, another UI system, duplicated server state,
  speculative abstractions, or unrequested packages/configuration. Generic routers may reference
  removed/uninstalled siblings: use the selected set or official docs, not an automatic reinstall.
- Installed for future use does not mean implemented, enabled, or authorized. Report the skill names
  actually used, not every available guide. Skill installation does not prove runtime acceptance.

Load skills by affected task:

| Task | Skills and repository-specific scope |
| --- | --- |
| React/Next.js implementation and performance | `vercel-react-best-practices`; TanStack Query, not suggested SWR, owns remote data |
| Component architecture, extraction, or feature ownership | `bgo-component-architecture`, then `vercel-composition-patterns` and the relevant platform guide |
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
| Development secret injection | `infisical-user-setup-guide`, with its CLI local-development reference; explicit per-app/environment scope, not a root Turbo process receiving every app's secrets |

**Clerk Organizations are never BGO organizations.** BGO organizations, moderation, membership,
permissions, and events belong to the BGO MongoDB/API domain. Do not load `clerk-orgs` for a BGO
organization task or map BGO membership/authorization onto Clerk tenancy without an explicit domain
change request. Shared naming is not shared identity or authority.

Use MapTiler and installed MapLibre APIs, not Mapbox integration examples. Verified addresses and
attribution remain mandatory. This product is noncommercial; comply with applicable quotas and
storage/plan terms rather than inventing a commercial-subscription requirement.

HeroUI and Uniwind supply the existing design system. Generic Expo examples for `@expo/ui`, native
palette files, custom Buttons, or spinners do not supersede available HeroUI controls, existing
CSS/tokens, or skeleton/cached-content policy. Tailwind v4 CSS advice does not apply indiscriminately
to native structural layout. Use current library docs and established flows.

Sentry examples do not authorize PII collection, replay/profiling/logging changes, sample-rate
increases, or enabling replay/feedback in production. Preserve existing release/Fabric safeguards.
Existing `sendDefaultPii: true` requires a separate explicit privacy review, not silent change from
skill installation. Never put tokens, secrets, address-book data, or arbitrary request bodies in
logs/breadcrumbs. Infisical injection likewise does not authorize credential rotation, Production,
CORS, Vercel-sync, or identity/permission changes. Never log/export/commit private values or bake
secrets into images. Client `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` values are public even if labeled Secret.

## Documentation

Use `create-readme` for README changes and `create-agentsmd` for repository instructions.
Both project-locked guides come from `github/awesome-copilot`. Generic examples never override
repository commands, safety or package choices. If a required guide is absent, report it and
use current code and official documentation where sufficient; do not automatically reinstall it.
A lockfile entry alone does not establish installation or agent discovery.
