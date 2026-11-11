import { classifyPlayerCount } from "@board-game-organizer/schemas";
import { DOMParser } from "@xmldom/xmldom";
import { expect, it } from "vitest";
import { parsePlayerPoll } from "../bgg-player-poll";

const date = "2026-11-11T00:00:00Z";
const row = (players: string, best: number, recommended: number, no: number) =>
  `<results numplayers="${players}"><result value="Best" numvotes="${best}"/><result value="Recommended" numvotes="${recommended}"/><result value="Not Recommended" numvotes="${no}"/></results>`;
const parse = (body: string) =>
  parsePlayerPoll(
    new DOMParser().parseFromString(`<item>${body}</item>`, "text/xml").documentElement!,
    date,
  );
it("preserves all raw counts, samples and ranges without treating community preference as hard bounds", () => {
  const poll = parse(
    `<poll name="suggested_numplayers" totalvotes="12">${row("2", 8, 3, 1)}${row("7+", 1, 9, 2)}</poll>`,
  );
  expect(poll).toMatchObject({
    totalVotes: 12,
    fetchedAt: date,
    rows: [
      { players: 2, orMore: false, sampleCount: 12 },
      { players: 7, orMore: true, sampleCount: 12 },
    ],
  });
  expect(classifyPlayerCount(poll, 2)).toBe("BEST");
  expect(classifyPlayerCount(poll, 8)).toBe("RECOMMENDED");
  expect(classifyPlayerCount(poll, 5)).toBe("UNKNOWN");
});
it.each([
  "",
  '<poll name="suggested_numplayers" totalvotes="0"/>',
  `<poll name="suggested_numplayers" totalvotes="3">${row("2", 0, 0, 0)}</poll>`,
  `<poll name="suggested_numplayers" totalvotes="3">${row("2", -1, 2, 2)}</poll>`,
])("omitted, empty and malformed polls never become fetched: %s", (body) =>
  expect(parse(body)).toBeUndefined(),
);
it("ties remain unknown and exact rows override broader ranges", () => {
  const poll = parse(
    `<poll name="suggested_numplayers" totalvotes="12">${row("7+", 9, 1, 2)}${row("8", 5, 5, 2)}${row("9", 0, 0, 12)}</poll>`,
  );
  expect(classifyPlayerCount(poll, 8)).toBe("UNKNOWN");
  expect(classifyPlayerCount(poll, 9)).toBe("NOT_RECOMMENDED");
});

it.each([
  '<poll name="other"/>',
  '<poll name="suggested_numplayers" totalvotes="bad"/>',
  '<poll name="suggested_numplayers" totalvotes="3"/>',
  '<poll name="suggested_numplayers" totalvotes="3"><results/></poll>',
  '<poll name="suggested_numplayers" totalvotes="3">' + row("0", 1, 1, 1) + "</poll>",
  '<poll name="suggested_numplayers" totalvotes="3">' +
    row("99999999999999999999", 1, 1, 1) +
    "</poll>",
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best" numvotes=""/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best" numvotes="bad"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best" numvotes="1"/><result value="Best" numvotes="2"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Recommended" numvotes="1"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best" numvotes="1"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result value="Best" numvotes="1"/><result value="Recommended" numvotes="1"/></results></poll>',
  '<poll name="suggested_numplayers" totalvotes="3">' +
    row("2", 1, 1, 1) +
    row("2", 1, 1, 1) +
    "</poll>",
])("rejects incomplete or ambiguous provider poll without publishing a timestamp: %s", (body) =>
  expect(parse(body)).toBeUndefined(),
);
it("retains zero-sample rows as unknown when the poll has genuine samples elsewhere", () => {
  const poll = parse(
    '<poll name="suggested_numplayers" totalvotes="3">' +
      row("2", 0, 0, 0) +
      row("3", 3, 0, 0) +
      "</poll>",
  );
  expect(poll?.rows).toHaveLength(2);
  expect(classifyPlayerCount(poll, 2)).toBe("UNKNOWN");
});

it("rejects unnamed vote categories", () =>
  expect(
    parse(
      '<poll name="suggested_numplayers" totalvotes="3"><results numplayers="2"><result numvotes="3"/></results></poll>',
    ),
  ).toBeUndefined());
