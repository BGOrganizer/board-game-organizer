import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// This is pure validation of the shipped Maestro input script, not a React renderer.
it("requires owned native fixtures and escapes real game names rather than treating them as selectors", () => {
  const script = readFileSync(
    new URL("../../../.maestro/helpers/game-picker-inputs.js", import.meta.url),
    "utf8",
  );
  const base = {
    PICKER_LOCALE: "en",
    PICKER_BUILD_ACK: "owned-development-preview-build",
    PICKER_FIXTURE_ACK: "owned-planning-event-linked-collection",
    PICKER_EVENT_ID: "11111111-1111-4111-8111-111111111111",
    PICKER_EVENT_NAME: "Event [owned]",
    PICKER_FIRST_GAME: "First [game]",
    PICKER_LATER_GAME: "Later (game)",
  };
  const run = (overrides: Partial<Record<keyof typeof base, string>> = {}) => {
    const context = { ...base, ...overrides, output: { picker: {} as Record<string, string> } };
    runInNewContext(script, context);
    return context.output.picker;
  };
  for (const locale of ["en", "it"]) {
    const result = run({ PICKER_LOCALE: locale });
    expect(new RegExp(result.first).test(base.PICKER_FIRST_GAME)).toBe(true);
    expect(new RegExp(result.first).test("First game")).toBe(false);
    expect(new RegExp(result.later).test(base.PICKER_LATER_GAME)).toBe(true);
    expect(new RegExp(result.tables).test(locale === "en" ? "2. Tables" : "2. Tavoli")).toBe(true);
  }
  for (const invalid of [
    { PICKER_LOCALE: "xx" },
    { PICKER_BUILD_ACK: "production" },
    { PICKER_FIXTURE_ACK: "" },
    { PICKER_EVENT_ID: "bad" },
    { PICKER_FIRST_GAME: "" },
    { PICKER_LATER_GAME: base.PICKER_FIRST_GAME },
  ])
    expect(() => run(invalid)).toThrow();
});
