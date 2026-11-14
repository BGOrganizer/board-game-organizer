import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// Executes input validation/selector construction only; no Maestro or device acceptance.
const source = readFileSync(
  new URL("../../../.maestro/helpers/list-status-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  scheduled: { id: "00000000-0000-4000-8000-000000000001", name: "fixture scheduled (one)" },
  available: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "fixture available",
    kind: "public-outsider",
  },
  terminated: { id: "00000000-0000-4000-8000-000000000003", name: "fixture terminated" },
  history: {
    id: "00000000-0000-4000-8000-000000000004",
    eventId: "00000000-0000-4000-8000-000000000003",
    name: "fixture table",
    winnerHandles: ["@winner.one", "@winner-two"],
  },
  emptyQuery: "known-unmatched",
};
function run(overrides: Record<string, unknown> = {}) {
  const context = {
    STATUS_ACK: "owned-development-list-fixtures",
    STATUS_LOCALE: "en",
    STATUS_THEME: "light",
    STATUS_QUERY: "fixture",
    STATUS_INPUT: JSON.stringify(fixture),
    output: {} as { status?: Record<string, unknown> },
    ...overrides,
  };
  runInNewContext(source, context);
  if (!context.output.status) throw new Error("Missing built selectors");
  return context.output.status;
}
it.each(["en", "it"])("builds exact %s source selectors and separate winner rows", (locale) => {
  const output = run({ STATUS_LOCALE: locale });
  expect(output.scheduled).toBe(locale === "it" ? "^Schedulati$" : "^Scheduled$");
  expect(output.terminated).toBe(locale === "it" ? "^Terminati$" : "^Terminated events$");
  expect(output.history).toBe(locale === "it" ? "^Storico$" : "^History$");
  expect(output.scheduledCard).toBe(
    locale === "it"
      ? "^Apri evento: fixture scheduled \\(one\\)$"
      : "^Open event: fixture scheduled \\(one\\)$",
  );
  expect(output.historyCard).toBe(
    locale === "it" ? "^Apri tavolo: fixture table$" : "^Open table: fixture table$",
  );
  expect(output.winners).toEqual(["^@winner\\.one$", "^@winner-two$"]);
  expect(output.emptyQuery).toBe("known-unmatched");
});
it.each(["public-outsider", "private-member", "public-group-private-member"])(
  "accepts actual availability class %s",
  (kind) => {
    expect(
      run({
        STATUS_INPUT: JSON.stringify({ ...fixture, available: { ...fixture.available, kind } }),
        STATUS_THEME: "dark",
      }).query,
    ).toBe("fixture");
  },
);
it.each(["STATUS_ACK", "STATUS_LOCALE", "STATUS_THEME", "STATUS_QUERY", "STATUS_INPUT"])(
  "rejects missing %s",
  (key) => {
    expect(() => run({ [key]: undefined })).toThrow();
  },
);
it.each([
  { STATUS_ACK: "production" },
  { STATUS_LOCALE: "de" },
  { STATUS_THEME: "blue" },
  { STATUS_QUERY: "x".repeat(81) },
  { STATUS_INPUT: "{" },
])("rejects invalid execution inputs %j", (overrides) => {
  expect(() => run(overrides)).toThrow();
});
it.each([
  null,
  {},
  { ...fixture, scheduled: { ...fixture.scheduled, id: "bad" } },
  { ...fixture, scheduled: { ...fixture.scheduled, name: "unrelated" } },
  { ...fixture, scheduled: { ...fixture.scheduled, name: "fixture ".repeat(20) } },
  { ...fixture, available: { ...fixture.available, name: fixture.scheduled.name } },
  { ...fixture, available: { ...fixture.available, kind: "public-group-nonmember-private-event" } },
  { ...fixture, history: { ...fixture.history, eventId: "bad" } },
  { ...fixture, history: { ...fixture.history, winnerHandles: [] } },
  { ...fixture, history: { ...fixture.history, winnerHandles: ["invented name"] } },
  { ...fixture, history: { ...fixture.history, winnerHandles: ["@same", "@same"] } },
  { ...fixture, emptyQuery: "" },
  { ...fixture, emptyQuery: "x".repeat(81) },
])("rejects inconsistent fixture metadata %#", (input) => {
  expect(() => run({ STATUS_INPUT: JSON.stringify(input) })).toThrow();
});
