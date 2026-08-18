import type { LinguiConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

/**
 * LinguiJS configuration — one shared catalog (it + en) for both the web and
 * mobile apps, so the same message IDs cover the whole product.
 *
 * - `sourceLocale: en` — English is the source of truth; messages are written
 *   in code in English and extracted from `*.po` files.
 * - `extractParserOptions` uses the TypeScript parser so macros inside
 *   `.ts`/`.tsx` files are discovered.
 * - Both apps consume the compiled catalogs (`lingui compile` →
 *   `messages/{en,it}.js`) at runtime.
 */
const config: LinguiConfig = {
  locales: ["en", "it"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "messages/{locale}",
      include: ["apps/web/src", "apps/mobile/src", "packages/schemas/src"],
    },
  ],
  format: formatter({ lineNumbers: false }),
};

export default config;
