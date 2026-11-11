# Web instructions

Read the [root instructions](../../AGENTS.md) first. These rules apply to `apps/web`.

`apps/web` uses Next.js App Router and server components by default. Add `"use client"` only for
interactive state or browser APIs. Auth middleware leaves `/`, sign-in, and sign-up public and
protects application routes.

Navigation and list eligibility follow the [unified contract](../../docs/groups-events-refactor.md#results-lists-and-transport)
and [Community](../../docs/community.md). Do not repeat page titles inside tab content.

Use `@heroui/react` and Tailwind CSS. When HeroUI provides an appropriate component, use it instead
of a custom or native substitute. For unsupported components, build a small accessible custom
component matching HeroUI styling.

HeroUI v3 uses React Aria composition:

- Do not use obsolete `startContent`, `endContent`, `flat`, `light`, or `solid` APIs.
- Put item icons inside item children.
- Attach `onAction` to each `Dropdown.Item`; menu-level `onAction` is not reliable here.
- `Dropdown.Trigger` renders an interactive button; do not nest another Button inside it.
- Prefer the existing custom portal dialog for controlled confirmation dialogs; the HeroUI composite
  modal previously left orphaned overlays.
- Check installed `.d.ts` files before introducing a HeroUI component API not already used.

HeroUI dark mode is class-based. `ThemeScript` bootstraps before hydration, then synchronizes the
root class and `data-theme` with the existing system/light/dark preference and live OS changes.
Clerk web appearance, custom surfaces, hints, focus rings, backdrops and shadows consume HeroUI
variables too. Compact action foreground overrides remain centralized in global CSS and use
HeroUI's contrast primitives; preserve readable text/icon contrast when changing theme pairs.

Use `lucide-react` icons only.

Read `NEXT_PUBLIC_*` variables inside this app and pass them to workspace helpers; Next.js does
not reliably inline those environment reads from shared package source. Keep web cache ownership
independent of the native MMKV adapter; use the same bounded cache-first policy without a web splash.

## Checks

From the root: `pnpm --filter web test`, `pnpm --filter web test:coverage`,
`pnpm --filter web typecheck`, `pnpm --filter web lint` and `pnpm --filter web build`.
`pnpm --filter web test:e2e` requires the matching API/Clerk target and real provisioned users.
Use specific API-loaded profile assertions and distinguish the intended dialog from open dropdowns.
