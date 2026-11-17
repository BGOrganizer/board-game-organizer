import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const common = {
  NAVIGATION_BUILD_ACK: "owned-preview-build",
  NAVIGATION_API_URL: "https://api-development-pr-27-example.vercel.app",
};
const detail = {
  groupId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  tableId: "33333333-3333-4333-8333-333333333333",
  groupName: "Group [one]",
  eventName: "Event (two)",
  tableName: "Table +three",
};
function run(kind: "tab" | "detail" | "history", patch: Record<string, unknown> = {}) {
  const context = {
    ...common,
    NAVIGATION_COLLECTION: "present",
    NAVIGATION_DETAILS_INPUT: JSON.stringify(detail),
    NAVIGATION_HISTORY_INPUT: JSON.stringify({ ...detail, winnerUsername: "@winner" }),
    NAVIGATION_LOCALE: "it",
    ...patch,
    output: {} as Record<string, Record<string, unknown>>,
  };
  runInNewContext(
    readFileSync(
      new URL(`../../../.maestro/helpers/cached-${kind}-navigation-inputs.js`, import.meta.url),
      "utf8",
    ),
    context,
  );
  return context.output;
}
it("requires explicit Preview ownership and a declared collection capability", () => {
  expect(run("tab").navigation.collection).toBe(true);
  expect(run("tab", { NAVIGATION_COLLECTION: "absent" }).navigation.collection).toBe(false);
  for (const kind of ["tab", "detail", "history"] as const)
    for (const patch of [
      { NAVIGATION_BUILD_ACK: undefined },
      { NAVIGATION_BUILD_ACK: "production" },
      { NAVIGATION_API_URL: undefined },
      { NAVIGATION_API_URL: "https://api.board-game-organizer.com" },
      { NAVIGATION_API_URL: "https://api-development-pr-27-example.vercel.app.evil.test" },
    ])
      expect(() => run(kind, patch)).toThrow();
  for (const value of [undefined, "", "unknown"])
    expect(() => run("tab", { NAVIGATION_COLLECTION: value })).toThrow();
});

it("requires real completed-game identities and a known locale for winner popovers", () => {
  expect(run("history").history.winner).toBe("^@winner$");
  expect(run("history").history.terminated).toBe("^Terminata$");
  expect(run("history", { NAVIGATION_LOCALE: "en" }).history.terminated).toBe("^Terminated$");
  for (const value of [undefined, "", "unknown"])
    expect(() => run("history", { NAVIGATION_LOCALE: value })).toThrow();
  for (const input of [undefined, "not-json", "{}"])
    expect(() => run("history", { NAVIGATION_HISTORY_INPUT: input })).toThrow();
  for (const field of ["eventId", "tableId", "eventName", "tableName", "winnerUsername"])
    for (const value of [undefined, "bad", "@"])
      expect(() =>
        run("history", {
          NAVIGATION_HISTORY_INPUT: JSON.stringify({
            ...detail,
            winnerUsername: "@winner",
            [field]: value,
          }),
        }),
      ).toThrow();
  expect(() =>
    run("history", {
      NAVIGATION_HISTORY_INPUT: JSON.stringify({ ...detail, winnerUsername: "@two names" }),
    }),
  ).toThrow();
});
it("uses exact owned detail IDs and escapes literal names without provisioning resources", () => {
  const output = run("detail").details;
  expect(output.groupLink).toBe(`bgo-dev:///group/${detail.groupId}`);
  expect(output.tableLink).toContain(`tableId=${detail.tableId}`);
  expect(output.groupName).toBe("^Group \\[one\\]$");
  for (const input of [undefined, "not-json", "{}"])
    expect(() => run("detail", { NAVIGATION_DETAILS_INPUT: input })).toThrow();
  for (const field of ["groupId", "eventId", "tableId", "groupName", "eventName", "tableName"])
    for (const value of [undefined, "bad", "x".repeat(31)])
      expect(() =>
        run("detail", { NAVIGATION_DETAILS_INPUT: JSON.stringify({ ...detail, [field]: value }) }),
      ).toThrow();
});
