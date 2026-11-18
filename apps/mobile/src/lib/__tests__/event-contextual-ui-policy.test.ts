import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Native composition policy only. Actual callbacks, keyboard bounds and source
// query behavior are tested with real RN/HeroUI in EventGroupSelect.native.
it("keeps group search inside its virtualized option header with external keyboard avoidance", () => {
  const source = readFileSync(
    new URL("../../components/events/EventGroupSelect.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toMatch(/ListHeaderComponent=\{[\s\S]*<SearchInput/);
  expect(source).toContain('keyboardAvoidance="external"');
});
