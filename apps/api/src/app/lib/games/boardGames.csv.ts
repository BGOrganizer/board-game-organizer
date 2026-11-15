import type { BoardGameCsv } from "@board-game-organizer/schemas";

const columns = [
  "id",
  "name",
  "yearpublished",
  "rank",
  "bayesaverage",
  "average",
  "usersrated",
  "is_expansion",
  "abstracts_rank",
  "cgs_rank",
  "childrensgames_rank",
  "familygames_rank",
  "partygames_rank",
  "strategygames_rank",
  "thematic_rank",
  "wargames_rank",
] as const;

/** Parse the complete BGG rankings dump before writing any chunk to the API. */
export function parseBoardGamesCsv(text: string): BoardGameCsv[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quoted field");
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  const header = rows.shift()?.map((value) =>
    value
      .trim()
      .replace(/^\uFEFF/, "")
      .toLowerCase(),
  );
  if (
    !header ||
    header.length !== columns.length ||
    columns.some((name) => !header.includes(name))
  ) {
    throw new Error(`Invalid BGG CSV columns: ${header?.join(", ") ?? "missing header"}`);
  }
  const index = (name: (typeof columns)[number]) => header.indexOf(name);
  const games: BoardGameCsv[] = [];
  const seen = new Set<number>();
  for (const [offset, fields] of rows.entries()) {
    const line = offset + 2;
    if (fields.length !== header.length) throw new Error(`Invalid BGG CSV row ${line}`);
    const value = (name: (typeof columns)[number]) => fields[index(name)].trim();
    const number = (name: (typeof columns)[number], nullable = false): number | null => {
      const raw = value(name);
      if (raw === "" && nullable) return null;
      const parsed = Number(raw);
      if (raw === "" || !Number.isFinite(parsed) || (name !== "yearpublished" && parsed < 0)) {
        throw new Error(`Invalid ${name} at row ${line}`);
      }
      return parsed;
    };
    const integer = (name: (typeof columns)[number], nullable = false): number | null => {
      const parsed = number(name, nullable);
      if (
        parsed !== null &&
        (!Number.isSafeInteger(parsed) || (name.endsWith("_rank") && parsed === 0))
      ) {
        throw new Error(`Invalid ${name} at row ${line}`);
      }
      return parsed;
    };
    const id = integer("id") as number;
    const name = value("name");
    const isExpansion = value("is_expansion");
    if (id <= 0 || !name || seen.has(id) || (isExpansion !== "0" && isExpansion !== "1")) {
      throw new Error(`Invalid game at row ${line}`);
    }
    seen.add(id);
    games.push({
      id,
      name,
      yearPublished: integer("yearpublished") as number,
      rank: integer("rank") as number,
      bayesAverage: number("bayesaverage") as number,
      average: number("average") as number,
      usersRated: integer("usersrated") as number,
      isExpansion: isExpansion === "1",
      abstractsRank: integer("abstracts_rank", true),
      cgsRank: integer("cgs_rank", true),
      childrensGamesRank: integer("childrensgames_rank", true),
      familyGamesRank: integer("familygames_rank", true),
      partyGamesRank: integer("partygames_rank", true),
      strategyGamesRank: integer("strategygames_rank", true),
      thematicRank: integer("thematic_rank", true),
      warGamesRank: integer("wargames_rank", true),
    });
  }
  if (!games.length) throw new Error("BGG CSV has no games");
  return games;
}
