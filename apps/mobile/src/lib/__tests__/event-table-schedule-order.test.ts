import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source composition guard only; actual native schedule rendering has RNTL coverage.
it("keeps the frozen table schedule after its identity and before personal context sections", () => {
  const source = readFileSync(
    new URL("../../components/events/EventTableOverview.tsx", import.meta.url),
    "utf8",
  );
  expect(source.indexOf("<EventTableScheduleCard")).toBeGreaterThan(
    source.indexOf("<EventTableInfo"),
  );
  expect(source.indexOf("<EventTableScheduleCard")).toBeLessThan(
    source.indexOf('context === "personal"'),
  );
});
