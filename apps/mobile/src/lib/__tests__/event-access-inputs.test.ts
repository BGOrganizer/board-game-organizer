import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../.maestro/helpers/event-access-inputs.js", import.meta.url),
  "utf8",
);
const input = {
  eventId: "11111111-1111-4111-8111-111111111111",
  tableId: "22222222-2222-4222-8222-222222222222",
  groupId: "33333333-3333-4333-8333-333333333333",
  eventName: "Owned event [x]",
  tableName: "Owned table +",
  playerName: "player [x]",
  ndName: "nd +",
  ownOnlyName: "Own only",
  participantOnlyName: "Participant only",
  catalogOnlyName: "Catalog only",
  emptyQuery: "NeverMatches",
};
function run(change = {}, env = {}) {
  const output: { access?: Record<string, string> } = {};
  runInNewContext(script, {
    EVENT_ACCESS_FIXTURE_ACK: "owned-disposable-event-access",
    EVENT_ACCESS_BUILD_ACK: "owned-preview-build",
    EVENT_ACCESS_MODE: "shared",
    EVENT_ACCESS_LOCALE: "en",
    EVENT_ACCESS_API_URL: "https://owned-preview.vercel.app",
    EVENT_ACCESS_WRITE_ACK: "",
    EVENT_ACCESS_INPUT: JSON.stringify({ ...input, ...change }),
    ...env,
    output,
  });
  if (!output.access) throw new Error("Missing real control selectors");
  return output.access;
}
it.each(["en", "it"])(
  "escapes actual names, retains explicit route scope and supports locale %s",
  (locale) => {
    const result = run({}, { EVENT_ACCESS_LOCALE: locale });
    expect(new RegExp(result.eventName).test(input.eventName)).toBe(true);
    expect(new RegExp(result.player).test(input.playerName)).toBe(true);
    expect(new RegExp(result.player).test("player x")).toBe(false);
    expect(result.tableLink).toContain(`eventId=${input.eventId}&tableId=${input.tableId}`);
  },
);
it.each(["denied", "enroll", "picker", "finalize", "draft"])(
  "requires an explicit, non-optional journey: %s",
  (mode) => {
    expect(
      run(
        {},
        {
          EVENT_ACCESS_MODE: mode,
          EVENT_ACCESS_WRITE_ACK: "irreversible-owned-disposable-finalization",
        },
      ).mode,
    ).toBe(mode);
  },
);
it.each(["en", "it"])(
  "requires named owned presentation fixtures and escapes popup selectors in %s",
  (locale) => {
    const result = run(
      { groupName: "Owned group [x]", groupType: "PRIVATE", gameName: "Game +" },
      { EVENT_ACCESS_MODE: "presentation", EVENT_ACCESS_LOCALE: locale },
    );
    expect(
      new RegExp(result.gamesHelp).test(
        (locale === "it" ? "Giochi da tavolo: " : "Board games: ") + input.tableName,
      ),
    ).toBe(true);
    expect(new RegExp(result.approvedGame).test("Game +")).toBe(true);
    expect(result.groupListTab).toBe(locale === "it" ? "^Privati$" : "^Private groups$");
    expect(new RegExp(result.entry).test(locale === "it" ? "Posto libero" : "Free place")).toBe(
      true,
    );
    expect(() => run({}, { EVENT_ACCESS_MODE: "presentation" })).toThrow(/presentation fixture/);
    expect(() =>
      run(
        { groupName: "Group", groupType: "OTHER", gameName: "Game" },
        { EVENT_ACCESS_MODE: "presentation" },
      ),
    ).toThrow();
  },
);
it.each([
  { EVENT_ACCESS_FIXTURE_ACK: "" },
  { EVENT_ACCESS_BUILD_ACK: "" },
  { EVENT_ACCESS_API_URL: "https://api.board-game-organizer.com" },
  { EVENT_ACCESS_MODE: "unknown" },
  { EVENT_ACCESS_LOCALE: "fr" },
  { EVENT_ACCESS_MODE: "finalize" },
])("rejects unsafe/missing acknowledgments or targets: %j", (env) =>
  expect(() => run({}, env)).toThrow(),
);
it.each([{ eventId: "bad" }, { tableName: "" }, { playerName: "" }, { ndName: "" }])(
  "rejects incomplete shared-result fixtures: %j",
  (change) => expect(() => run(change)).toThrow(),
);
it("rejects incomplete picker/public enrollment fixtures rather than skipping required assertions", () => {
  expect(() => run({ groupId: "bad" }, { EVENT_ACCESS_MODE: "enroll" })).toThrow();
  expect(() => run({ catalogOnlyName: "" }, { EVENT_ACCESS_MODE: "picker" })).toThrow();
  expect(() => run({ catalogOnlyName: "" }, { EVENT_ACCESS_MODE: "draft" })).toThrow();
  for (const locale of ["en", "it"]) {
    const result = run(
      { catalogOnlyName: "Azul [owned]" },
      { EVENT_ACCESS_MODE: "draft", EVENT_ACCESS_LOCALE: locale },
    );
    expect(
      new RegExp(result.gameSelect).test(
        (locale === "it" ? "Seleziona: " : "Select: ") + "Azul [owned]",
      ),
    ).toBe(true);
    expect(result.groupDraftLink).toBe("bgo:///group/wizard");
    expect(
      new RegExp(result.maximumFour).test(
        locale === "it" ? "Giocatori massimi: 4" : "Maximum players: 4",
      ),
    ).toBe(true);
  }
});
