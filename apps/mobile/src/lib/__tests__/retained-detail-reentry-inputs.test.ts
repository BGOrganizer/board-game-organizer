import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../.maestro/helpers/retained-detail-reentry-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  groupId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  targetTableId: "33333333-3333-4333-8333-333333333333",
  groupName: "Group [one]",
  eventName: "Event (two)",
  targetTableName: "Table +three",
  tableCount: 20,
};
function run(patch: Record<string, unknown> = {}, input: object = fixture) {
  const output = { reentry: {} as Record<string, string> };
  runInNewContext(source, {
    NAVIGATION_BUILD_ACK: "owned-preview-build",
    NAVIGATION_FIXTURE_ACK: "owned-private-planning-event",
    NAVIGATION_API_URL: "https://api-development-pr-27-owned.vercel.app",
    NAVIGATION_LOCALE: "it",
    NAVIGATION_REENTRY_INPUT: JSON.stringify(input),
    ...patch,
    output,
  });
  return output.reentry;
}
it("opens only explicit owned routes and escapes the chosen existing row in both locales", () => {
  expect(run().eventLink).toBe(`bgo-dev:///event/${fixture.eventId}`);
  expect(new RegExp(run().openTable).test("Apri tavolo: Table +three")).toBe(true);
  expect(
    new RegExp(run({ NAVIGATION_LOCALE: "en" }).openTable).test("Open table: Table +three"),
  ).toBe(true);
  expect(new RegExp(run().openTable).test("Apri tavolo: Table three")).toBe(false);
});
it("fails closed before navigation for missing ownership, production or invalid fixture inputs", () => {
  for (const field of [
    "NAVIGATION_BUILD_ACK",
    "NAVIGATION_FIXTURE_ACK",
    "NAVIGATION_API_URL",
    "NAVIGATION_LOCALE",
    "NAVIGATION_REENTRY_INPUT",
  ])
    for (const value of [undefined, "invalid"]) expect(() => run({ [field]: value })).toThrow();
  for (const url of [
    "https://api.board-game-organizer.com",
    "https://api-development-pr-27-owned.vercel.app.evil.test",
  ])
    expect(() => run({ NAVIGATION_API_URL: url })).toThrow();
  for (const field of [
    "groupId",
    "eventId",
    "targetTableId",
    "groupName",
    "eventName",
    "targetTableName",
    "tableCount",
  ])
    for (const value of [undefined, "", 21])
      expect(() => run({}, { ...fixture, [field]: value })).toThrow();
});
