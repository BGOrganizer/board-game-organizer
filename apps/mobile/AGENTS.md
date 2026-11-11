# Mobile instructions

Read the [root instructions](../../AGENTS.md) first. These rules apply to `apps/mobile`.

`apps/mobile` is native-only Expo Router. Root provider order is:

```text
Sentry initialization
GestureHandlerRootView
I18nProvider
HeroUINativeProvider
ClerkProvider
QueryProvider
Expo Router Stack
```

Keep `index.tsx` authentication navigation declarative with `<Redirect>`; an effect-driven
`router.replace` raced cold-start navigation.

Keep `I18nProvider` above `HeroUINativeProvider`: HeroUI's sibling portal host must inherit Lingui
context, including search-help components rendered inside Select overlays.

Use heroui-native components and Uniwind classes. When HeroUI Native provides an appropriate
component, use it instead of a custom or React Native substitute. Use explicit React Native style
objects for structural layout (`flex`, row direction, gaps, dimensions) because generated utility
availability is not reliable at runtime. Use classes for theme-aware visual styling. Every text
element needs a visible theme-aware color or heroui-native's Typography default.

`global.css` must retain `@source "./src"`; otherwise app utility classes are not generated.

`ThemeSync` maps Zustand `system | light | dark` to `Uniwind.setTheme`. `NavigationTheme` maps
resolved HeroUI tokens into Expo Router's navigation theme and system status-bar mode; headers,
scene backgrounds and bottom tabs must not fall back to a separate navigation palette. Inactive
tab icons use `muted`; selected mobile chips and tabs must visibly reflect active state. Resolve
native icon/style colors with `useThemeColor`, never captured palette constants. Keep the hoisted
HeroUI library source in global CSS and retain `@source "./src"`.

Use `lucide-react-native` icons only.

Address-book suggestions require explicit `expo-contacts` permission. Sync emails and phone numbers
to `POST /api/contacts/sync`; persist only unambiguous registered matches in `contactLinks` and
discard unmatched address-book values. Repeated denials lead to an open-settings path, not silent
permission loops. After every native permission action and whenever the app returns active from
system settings, re-read the native permission and refresh permission-gated UI immediately; never
rely on stale local permission state. When mobile notification permission is askable, pressing the
notification bell requests it directly; do not add a second enable button.

HeroUI Native Skeleton has no intrinsic size. Give each skeleton explicit width, height, and border
radius, and keep parent rows stretched to full width.

Do not add a custom mobile Babel configuration. React Native's Babel/runtime combination and
worklets previously caused release builds to crash at launch. Mobile localization intentionally uses
runtime helpers instead of Lingui Babel macros.

## State, environment and native builds

Read [State, cache and startup](../../docs/state-and-cache.md) before modifying reads or query families.
Reuse the encrypted account/API-owned MMKV adapter for eligible canonical data; no screen-local cache,
optimistic persistence, offline write replay or permission bypass. Keep the five-second total splash limit,
three priority workers and permission-free startup; do not warm a raw address book without prior permission.

Public environment comes from `app.config.js` and `Constants.expoConfig.extra`.
FCM may use the private `GOOGLE_SERVICES_JSON` file-secret path; never commit the generated file.
MapLibre, MMKV/Nitro and permission/dependency changes require a fresh native build, not Expo Go or OTA alone.
Expo web is not a product target even though the package exposes a web script.

## Checks

From the root: `pnpm --filter mobile test`, `pnpm --filter mobile test:coverage`,
`pnpm --filter mobile typecheck` and `pnpm --filter mobile lint`.
Vitest covers pure logic; React Native Flow source is not transformed for component tests.
Use [Maestro](.maestro/README.md) for real native UI acceptance, without mocked acceptance, optional
required steps, synthetic visibility markers, disabled animation or increased waits to hide defects.
Keep platform-specific auth/permissions/keyboard/Settings-return and error paths covered.
