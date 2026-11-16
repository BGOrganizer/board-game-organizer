import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../.maestro/helpers/resource-artwork-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  groupId: "owned-group",
  eventId: "owned-event",
  tableId: "owned-table",
  groupName: "Owned (group)",
  eventName: "Owned event+",
  tableName: "Owned table?",
  logo: "generated",
};
function run(overrides: Record<string, unknown> = {}, input = fixture) {
  const output: { artwork: Record<string, string> } = { artwork: {} };
  runInNewContext(source, {
    ARTWORK_FIXTURE_ACK: "owned-preview-resource-artwork",
    ARTWORK_BUILD_ACK: "owned-preview-build",
    ARTWORK_LOCALE: "en",
    ARTWORK_THEME: "light",
    ARTWORK_MOTION: "normal",
    ARTWORK_INPUT: JSON.stringify(input),
    output,
    ...overrides,
  });
  return output.artwork;
}
it("retains actual routes and exact localized selectors without interpreting names as regex", () => {
  const en = run();
  expect(en.groupLink).toBe("bgo-dev:///group/owned-group");
  expect(en.eventLink).toBe("bgo-dev:///event/owned-event");
  expect(en.tableLink).toBe("bgo-dev:///event/table?eventId=owned-event&tableId=owned-table");
  expect(new RegExp(en.openEvent).test("Open event: Owned event+")).toBe(true);
  expect(new RegExp(en.openEvent).test("Open event: Owned eventtt")).toBe(false);
  expect(en.screenshot).toBe("artwork-generated-en-light-normal");
  const it = run({ ARTWORK_LOCALE: "it", ARTWORK_THEME: "dark", ARTWORK_MOTION: "reduced" });
  expect(it.events).toBe("^Eventi$");
  expect(it.tables).toBe("^Tavoli$");
  expect(new RegExp(it.openTable).test("Apri tavolo: Owned table?")).toBe(true);
  for (const logo of ["uploaded", "failed"]) {
    expect(run({}, { ...fixture, logo }).screenshot).toContain(`artwork-${logo}-`);
  }
});
it("requires explicit owned-build and configured-device acknowledgments", () => {
  for (const field of [
    "ARTWORK_FIXTURE_ACK",
    "ARTWORK_BUILD_ACK",
    "ARTWORK_LOCALE",
    "ARTWORK_THEME",
    "ARTWORK_MOTION",
  ]) {
    expect(() => run({ [field]: "invalid" })).toThrow(/Owned Preview APK/);
    expect(() => run({ [field]: undefined })).toThrow(/Owned Preview APK/);
  }
});
it("rejects missing names, invalid routes and unknown fixture cases before navigating", () => {
  for (const field of ["groupId", "eventId", "tableId"]) {
    for (const value of ["", "../production", 5, "x".repeat(129)]) {
      expect(() => run({}, { ...fixture, [field]: value })).toThrow(/Exact owned/);
    }
  }
  for (const field of ["groupName", "eventName", "tableName"]) {
    for (const value of ["", " ", 5, "x".repeat(201)]) {
      expect(() => run({}, { ...fixture, [field]: value })).toThrow(/Exact owned/);
    }
  }
  expect(() => run({}, { ...fixture, logo: "unknown" })).toThrow(/Exact owned/);
  expect(() => run({ ARTWORK_INPUT: "{" })).toThrow();
});
