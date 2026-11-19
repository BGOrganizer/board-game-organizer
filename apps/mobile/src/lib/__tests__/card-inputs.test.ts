import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it.each(["en", "it"])(
  "requires real known role fixtures for manual Card people acceptance in %s",
  (language) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/card-inputs.js", import.meta.url),
      "utf8",
    );
    const make = (person: object) => {
      const output: Record<string, string> = {};
      runInNewContext(source, {
        output,
        CARD_LOCALE: language,
        CARD_GROUP_NAME: "Group",
        CARD_EVENT_NAME: "Event",
        CARD_TABLE_NAME: "Table",
        CARD_EVENT_DATE_LABEL: "Date",
        CARD_EVENT_TIME_LABEL: "20:00",
        CARD_VENUE: "Venue",
        CARD_VENUE_ADDRESS: "Address",
        CARD_PEOPLE_INPUT: JSON.stringify(person),
      });
      return output;
    };
    const person = {
      username: "@known.user",
      groupRole: "moderator",
      eventRole: "moderator",
      tableStatus: "waiting",
    };
    const result = make(person);
    expect(new RegExp(result.cardPerson).test("@known.user")).toBe(true);
    expect(new RegExp(result.cardPerson).test("@knownXuser")).toBe(false);
    expect(result.cardOverview).toBe(language === "it" ? "^Dettagli$" : "^Details$");
    expect(result.cardRankingTab).toBe("^Ranking$");
    expect(
      new RegExp(result.cardEventRole).test(language === "it" ? "Moderatore" : "Moderator"),
    ).toBe(true);
    for (const patch of [
      { username: "" },
      { groupRole: "none" },
      { eventRole: "invented" },
      { tableStatus: "seated-without-proof" },
    ])
      expect(() => make({ ...person, ...patch })).toThrow();
  },
);
