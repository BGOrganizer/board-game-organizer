# Web instructions

Read the [root instructions](../../AGENTS.md) first. These rules apply to `apps/web`.

`apps/web` uses Next.js App Router and server components by default. Add `"use client"` only for
interactive state or browser APIs. Auth middleware leaves `/`, sign-in, and sign-up public and
protects application routes.

Navigation and list eligibility follow the [unified contract](../../docs/groups-events-refactor.md#results-lists-and-transport)
and [Community](../../docs/community.md). Do not repeat page titles inside tab content.

Use `@heroui/react` and Tailwind CSS; icons use `lucide-react` only. Browser-owned components
remain in this app.

HeroUI v3 uses React Aria composition:

- Do not use obsolete `startContent`, `endContent`, `flat`, `light`, or `solid` APIs.
- Put item icons inside item children.
- Attach `onAction` to each `Dropdown.Item`; menu-level `onAction` is not reliable here.
- `Dropdown.Trigger` renders an interactive button; do not nest another Button inside it.
- Reuse `src/components/common/ui/ContactConfirmDialog.tsx` for controlled confirmations;
  replacing it with the HeroUI composite modal previously left orphaned overlays.
- Check installed `.d.ts` files before introducing a HeroUI component API not already used.

HeroUI dark mode is class-based. `ThemeScript` bootstraps before hydration, then synchronizes the
root class and `data-theme` with the existing system/light/dark preference and live OS changes.
Clerk web appearance, custom surfaces, hints, focus rings, backdrops and shadows consume HeroUI
variables too. Compact action foreground overrides remain centralized in global CSS and use
HeroUI's contrast primitives; preserve readable text/icon contrast when changing theme pairs.

Read `NEXT_PUBLIC_*` variables inside this app and pass them to workspace helpers; Next.js does
not reliably inline those environment reads from shared package source. Apply cache-first navigation without a web splash.

## Development and verification

Start with `pnpm --filter web dev` from the root; Next.js serves port 3000.
Use the [shared validation commands](../../AGENTS.md#3-workspace-and-commands).
Colocate component tests under their feature; browser acceptance lives in `e2e`.
Playwright needs the matching API/Clerk target and real provisioned users. Assert API-loaded profile
identity rather than header display names, and distinguish the intended dialog from open dropdowns.
Before changing Next.js APIs, read the relevant installed guide in `node_modules/next/dist/docs/`
resolved from this workspace and heed its deprecation notices.
