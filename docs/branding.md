# Mascot and app artwork

The approved [organizer mascot](assets/bgo-mascot-organizer.png) carries cards, a die,
resources, tokens and a checked calendar. It is used in the README and both native and
animated launch screens. Its transparent margins are intentional; never apply a circular crop.

Every colored export uses those exact approved pixels, never an independently generated
portrait or a redrawn face. Launcher/touch/notification icons resize the complete mascot.
Favicons use a tight square crop of its original face with the adjacent card/die edges.
The monochrome variant uses the original full-character alpha silhouette, preserving eye
glints and the smile as cutouts from the original pixels while removing other interior
details for Android notifications, web badges and themed icons. The original ImageGen
prompt is stored beside the master. Earlier approved mascot versions remain available.

Run from the repository root after installing the locked workspace dependencies:

```sh
node scripts/branding/export.mjs
node scripts/branding/export.mjs --check
```

Export uses the existing API Sharp dependency and Uniwind color parser, without adding
packages. It thresholds the approved artwork's alpha into a white silhouette and exports:

| Target | Export | Format |
| --- | --- | --- |
| iOS and legacy Android launcher | `apps/mobile/assets/icon.png` | Opaque 1024 px PNG |
| Android adaptive foreground / themed mask | `apps/mobile/assets/adaptive-icon-{foreground,monochrome}.png` | Transparent 1024 px PNG; artwork within the central safe zone |
| Android adaptive background | `apps/mobile/assets/adaptive-icon-background.png` | Opaque 1024 px PNG |
| Native and animated splash | `apps/mobile/assets/splash.png` | Transparent 1024 px PNG |
| Android notification | `apps/mobile/assets/notification-icon.png` | White 96 px alpha mask |
| Web notification icon / badge | `apps/web/public/branding/notification-{icon,badge}.png` | 192 px color icon / 96 px white alpha mask |
| Web favicon | `apps/web/src/app/favicon.ico` | 16, 32, 48 and 64 px PNG frames |
| Web icon / Apple touch icon | `apps/web/src/app/{icon,apple-icon}.png` | Transparent 32 px face crop / opaque 180 px mascot |

Native configuration requires literal hex colors. Export resolves the installed HeroUI
Native default `background` tokens (light/dark) and `accent` into the generated
`apps/mobile/assets/branding.json`. This file is a build artifact for OS configuration,
not a runtime UI palette. Regenerate after HeroUI token changes; keep runtime UI on
HeroUI tokens. No app theme variables are overridden.

Next.js discovers web icons through its [metadata file conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).
The web service worker uses separate notification icon and monochrome badge assets.
On iOS, notifications inherit the application icon; Android uses the configured
[notification alpha mask](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

Artwork changes need a fresh native binary. Check a release/preview build on Android
and iOS, including circular/themed launcher masks, notifications and light/dark cold
launches. Expo Go and development-client splash screens do not establish release
appearance; see [Expo splash guidance](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).
Local asset/configuration and unit checks do not establish device acceptance. Preserve
the existing five-second startup limit, bounded warmup and reduced-motion behavior.

Android 12 masks native splash artwork and cannot display the full 280 dp mascot there.
The Android native layer therefore shows the theme background with a transparent placeholder
(`splash-android.png`). As soon as the application overlay mounts, the complete mascot appears
at 280 dp with its existing animation; no smaller mascot precedes it. iOS retains its native
280 dp artwork. This configuration change requires a new Android binary, not only an OTA update.
