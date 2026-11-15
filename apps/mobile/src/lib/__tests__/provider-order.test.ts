import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

it("keeps Lingui above HeroUI so its sibling portal host inherits translations", () => {
  const layout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");
  expect(layout).toMatch(/<I18nProvider i18n=\{defaultI18n\}>\s*<HeroUINativeProvider>/);
});
