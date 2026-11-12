# Mobile instructions

Read the [root instructions](../../AGENTS.md) first. These rules apply to `apps/mobile`.

`apps/mobile` is native-only Expo Router. `src/app/_layout.tsx` initializes Sentry before rendering.
Its provider nesting is:

```text
Sentry.ErrorBoundary
  GestureHandlerRootView
    I18nProvider
      HeroUINativeProvider
        NavigationTheme
          RootNavigator
            ClerkProvider
              MobileQueryProvider
                Expo Router Stack and startup/push coordinators
```

Keep `index.tsx` authentication navigation declarative with `<Redirect>`; an effect-driven
`router.replace` raced cold-start navigation.

HeroUI's sibling portal host must inherit Lingui context, including search-help components inside
Select overlays; preserve that context when changing the provider tree.

Use `heroui-native` and Uniwind classes; icons use `lucide-react-native` only. Use explicit React Native style
objects for structural layout (`flex`, row direction, gaps, dimensions) because generated utility
availability is not reliable at runtime. Use classes for theme-aware visual styling. Every text
element needs a visible theme-aware color or heroui-native's Typography default.

`global.css` must retain `@source "./src"` and the hoisted HeroUI library source; otherwise required
utilities are not generated.

`ThemeSync` maps Zustand `system | light | dark` to `Uniwind.setTheme`. `NavigationTheme` maps
resolved HeroUI tokens into Expo Router's navigation theme and system status-bar mode; headers,
scene backgrounds and bottom tabs must not fall back to a separate navigation palette. Inactive
tab icons use `muted`; selected mobile chips and tabs must visibly reflect active state. Resolve
native icon/style colors with `useThemeColor`, never captured palette constants.

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

[State, cache and startup](../../docs/state-and-cache.md) defines native persistence eligibility,
restore/purge behavior, startup workers and the five-second total splash budget. Apply that policy
when changing reads; no new permission prompt belongs in ordinary startup. An already granted
contacts permission may enable bounded address-book warmup as described there.

Public environment comes from `app.config.js` and `Constants.expoConfig.extra`.
FCM may use the private `GOOGLE_SERVICES_JSON` file-secret path; never commit the generated file.
MapLibre, MMKV/Nitro and permission/dependency changes require a fresh native build, not Expo Go or OTA alone.
Expo web is not a product target even though the package exposes a web script.

## Development and verification

`pnpm --filter mobile dev` starts Metro for a development client, not a native build.
Use `pnpm --filter mobile android` for local Android builds, or `pnpm --filter mobile ios` on macOS.
The [shared validation commands](../../AGENTS.md#3-workspace-and-commands) cover pure-logic Vitest
checks. Native component tests are not run in Vitest because React Native Flow source is not transformed.
Use [Maestro](.maestro/README.md) for actual device UI acceptance, covering permissions, keyboard,
Settings-return, startup and error paths. Preserve the root coverage and evidence requirements.
