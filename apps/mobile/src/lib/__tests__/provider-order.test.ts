import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

it("keeps the HeroUI portal host under localization, authentication and Query providers", () => {
  const layout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");
  expect(layout).toMatch(
    /<I18nProvider i18n=\{defaultI18n\}>\s*<ClerkProvider[^>]*>\s*<MobileQueryProvider[^>]*>\s*<RootNavigator/,
  );
  expect(layout).toMatch(/function RootNavigator[(][)] [\s\S]+?<HeroUINativeProvider>/);
});
