import { describe, expect, it } from "vitest";
import { parseBoardGamesCsv } from "@/app/lib/boardGames.csv";

const header =
  "id,name,yearpublished,rank,bayesaverage,average,usersrated,is_expansion,abstracts_rank,cgs_rank,childrensgames_rank,familygames_rank,partygames_rank,strategygames_rank,thematic_rank,wargames_rank";
const row = '1,"Game, with ""quotes""",2024,0,0,7.25,42,0,,1,,,,,2,';

describe("BGG rankings CSV", () => {
  it("imports every column, preserves zeros and handles quoted names and empty ranks", () => {
    expect(parseBoardGamesCsv(`${header}\r\n${row}\r\n`)).toEqual([
      {
        id: 1,
        name: 'Game, with "quotes"',
        yearPublished: 2024,
        rank: 0,
        bayesAverage: 0,
        average: 7.25,
        usersRated: 42,
        isExpansion: false,
        abstractsRank: null,
        cgsRank: 1,
        childrensGamesRank: null,
        familyGamesRank: null,
        partyGamesRank: null,
        strategyGamesRank: null,
        thematicRank: 2,
        warGamesRank: null,
      },
    ]);
    expect(
      parseBoardGamesCsv(`${header}\n2,Expansion,-100,12,5.1,7,10,1,,,,,,,,`)[0],
    ).toMatchObject({
      isExpansion: true,
      yearPublished: -100,
    });
  });

  it.each([
    ["", "columns"],
    [`${header.replace("is_expansion", "unused")}\n${row}`, "columns"],
    [`${header}\n${row.replace(",0,,1,", ",2,,1,")}`, "game"],
    [`${header}\n${row.replace(",7.25,", ",bogus,")}`, "average"],
    [`${header}\n${row.replace(",7.25,", ",-1,")}`, "average"],
    [`${header}\n${row.replace(",2024,", ",,")}`, "yearpublished"],
    [`${header}\n${row.replace('1,"Game', '1.5,"Game')}`, "id"],
    [`${header}\n${row.replace('1,"Game', '9007199254740992,"Game')}`, "id"],
    [`${header}\n${row.replace(",,1,,,,,2,", ",,0,,,,,2,")}`, "cgs_rank"],
    [`${header}\n${row.slice(0, -1)}`, "row"],
    [`${header}\n${row}\n${row}`, "game"],
    [`${header}\n1,"open quote`, "Unclosed"],
    [header, "no games"],
  ])("rejects malformed CSV before writing chunks (%s)", (csv, error) => {
    expect(() => parseBoardGamesCsv(csv)).toThrow(error);
  });
});
