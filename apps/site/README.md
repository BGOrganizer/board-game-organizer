# Board Game Organizer public site

The informational site runs as its own Next.js app. The Italian landing page is at `/` and the English page at `/en`. Both routes render without signing in and provide canonical URLs and language alternatives. The event, table and OpenSkill examples use illustrative data. Links to sign in point to the Web application for the selected environment.

```sh
bun run --filter site dev
bun run --filter site test:coverage
bun run --filter site build
```

Local development is available at <http://localhost:3001>. Set `NEXT_PUBLIC_BGO_WEB_ORIGIN` if you want the sign-in links to point to a different HTTPS Web origin. A local run without it links to the existing live Web app. Vercel builds require the configured origin.

For public browser acceptance, start the built app with `bun run --filter site start`, then run `bun run --filter site test:e2e` with Playwright Chromium installed. `PLAYWRIGHT_BASE_URL` can select a deployed Site. Set `NEXT_PUBLIC_BGO_WEB_ORIGIN` in the test process to the matching Web target. These tests check language navigation, artwork controls, information popovers and the OpenSkill demo without authenticating or editing any product data.

## Vercel and GitHub Actions

1. Create a separate Vercel project from the same team as Web and API. GitHub Actions deploys the monorepo source with the shared Vercel action, so leave direct Git deployments disconnected and leave the Root Directory at the repository root. The action supplies the Site build command and its `.next` output.
2. Add the same Project ID as the `VERCEL_SITE_PROJECT_ID` secret under GitHub's `development` and `production` environments. The deploy jobs reuse the existing environment-scoped `VERCEL_TOKEN` and `VERCEL_ORG_ID`.
3. If the Site project has no deployments, initialize it with a temporary static deployment on its default Vercel hostname. For example, run `vercel deploy --project <site-project-name> --prod` from a temporary directory containing only an `index.html`. Vercel classifies the first deployment as Production. The Site build checks Vercel's reported environment to prevent a Preview build from publishing with Development links to the Production alias. Keep Vercel's system environment variables enabled. [Vercel first-deployment behavior](https://vercel.com/docs/cli/deploy#prod)
4. Open a trusted PR to build a Site preview. Its **Accedi** and **Apri l’app Web** links use the exact Development Web deployment produced by that PR run. Main deploys Site independently of the product APK, OTA and release version, with Web sign-in on `https://app.board-game-organizer.com`.

Prepare the Web subdomain and verify Clerk sign-in, API CORS, and Web Push under that origin before switching the root domain. Leave `board-game-organizer.com` assigned to Web until the cutover. Verify the Site on its Vercel URL first. The domain switch also needs old Web path redirects and updates to the Web URL used in Production smoke checks, GitHub releases and Telegram.

## Assets and localization

Keep the app-owned Italian and English copy together in [the Site catalog](src/lib/copy.ts). The authenticated application's Lingui catalogs are separate.

The mascot and APK icon use the repository's approved BGO artwork. Resource illustrations are static and animated renders of the shared BGO DiceBear styles. Demo portraits use [DiceBear Clay](https://www.dicebear.com/styles/clay/) (CC0 1.0). The [Azul](https://boardgamegeek.com/boardgame/230802/azul) and [Hegemony](https://boardgamegeek.com/boardgame/321608/hegemony-lead-your-class-to-victory) cover thumbnails retain their original rights. Resource and cover provenance are described in the repository's [branding guide](../../docs/branding.md).

## Netlify

GitHub Actions also supports deploying this app to the separate Netlify Site projects. The
Development Site links to its run's Netlify Web deployment. The Production Site links to
the canonical Clerk Production Web domain. See
[parallel Netlify deployment](../../docs/organizations-events-operations.md#parallel-netlify-deployment).
