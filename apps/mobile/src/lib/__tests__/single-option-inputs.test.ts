import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../.maestro/helpers/single-option-inputs.js", import.meta.url),
  "utf8",
);
const path =
  "/events/11111111-1111-4111-8111-111111111111/tables/22222222-2222-4222-8222-222222222222";
const settings = (mask: number, mode = "join", locale = "en") => ({
  SINGLE_OPTION_FIXTURE_ACK: "owned-disposable-development-fixture",
  SINGLE_OPTION_BUILD_ACK: "owned-preview-build",
  SINGLE_OPTION_LOCALE: locale,
  SINGLE_OPTION_INPUT: JSON.stringify({
    mask,
    mode,
    path,
    name: "Owned Table",
    dates: Array.from({ length: mask & 1 ? 2 : 1 }, (_, i) => `2030-06-0${i + 3} 20:00`),
    locations: Array.from({ length: mask & 2 ? 2 : 1 }, (_, i) => `Club [${i}]`),
    games: Array.from({ length: mask & 4 ? 2 : 1 }, (_, i) => `Chess + (${i})`),
  }),
  output: {},
});
it.each(
  Array.from(
    { length: 32 },
    (_, value) => [value % 8, value & 8 ? "accept" : "join", value & 16 ? "it" : "en"] as const,
  ),
)(
  "requires actual fixture categories and literal accessible labels: %s/%s/%s",
  (mask, mode, locale) => {
    const context = settings(mask, mode, locale);
    runInNewContext(source, context);
    const output = context.output as {
      single: {
        mode: string;
        categories: Array<{ multiple: boolean; yes: string[]; no: string[] }>;
      };
    };
    expect(output.single.mode).toBe(mode);
    expect(output.single.categories.map((row) => row.multiple)).toEqual([
      Boolean(mask & 1),
      Boolean(mask & 2),
      Boolean(mask & 4),
    ]);
    const fixture = JSON.parse(context.SINGLE_OPTION_INPUT);
    for (const [index, key] of ["dates", "locations", "games"].entries()) {
      for (const [position, label] of fixture[key].entries()) {
        expect(
          new RegExp(output.single.categories[index].yes[position]).test(
            `${label}: ${locale === "it" ? "Sì" : "Yes"}`,
          ),
        ).toBe(true);
        expect(new RegExp(output.single.categories[index].no[position]).test(`${label}: No`)).toBe(
          true,
        );
        expect(
          new RegExp(output.single.categories[index].no[position]).test(`${label} unrelated: No`),
        ).toBe(false);
      }
    }
  },
);
it.each([
  "SINGLE_OPTION_FIXTURE_ACK",
  "SINGLE_OPTION_BUILD_ACK",
  "SINGLE_OPTION_LOCALE",
  "SINGLE_OPTION_INPUT",
])("fails closed when required input is absent: %s", (key) => {
  const context = settings(0) as Record<string, unknown>;
  delete context[key];
  expect(() => runInNewContext(source, context)).toThrow();
  expect(context.output).toEqual({});
});
it.each([
  { mask: -1 },
  { mask: 8 },
  { mode: "automatic" },
  { path: "https://board-game-organizer.com" },
  { name: "" },
  { dates: [] },
  { locations: ["", "venue"] },
  { games: ["Chess", "extra"] },
])("rejects invalid or incomplete fixture metadata: %j", (change) => {
  const context = settings(0);
  context.SINGLE_OPTION_INPUT = JSON.stringify({
    ...JSON.parse(context.SINGLE_OPTION_INPUT),
    ...change,
  });
  expect(() => runInNewContext(source, context)).toThrow();
  expect(context.output).toEqual({});
});
