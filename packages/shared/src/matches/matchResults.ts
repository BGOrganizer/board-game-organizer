import type { MatchResults, RegisterMatchResultsInput } from "@board-game-organizer/schemas";

/** Keep signed decimal scores exact, including ties such as 1.5 and 1.50. */
export function normalizeMatchScore(value: string): string | null {
  const raw = value.trim().replace(",", ".");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || raw.length > 48) return null;
  const negative = raw.startsWith("-");
  const [integer, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const decimals = fraction.replace(/0+$/, "");
  const canonical = `${integer}${decimals ? `.${decimals}` : ""}`;
  return canonical === "0" ? "0" : `${negative ? "-" : ""}${canonical}`;
}

export function compareMatchScores(left: string, right: string): number {
  const [a, aFraction = ""] = left.split(".");
  const [b, bFraction = ""] = right.split(".");
  const width = Math.max(aFraction.length, bFraction.length);
  const asNumber =
    BigInt(a) * 10n ** BigInt(width) +
    BigInt(`${a.startsWith("-") ? "-" : ""}${aFraction.padEnd(width, "0") || "0"}`);
  const bsNumber =
    BigInt(b) * 10n ** BigInt(width) +
    BigInt(`${b.startsWith("-") ? "-" : ""}${bFraction.padEnd(width, "0") || "0"}`);
  return asNumber === bsNumber ? 0 : asNumber > bsNumber ? 1 : -1;
}

/** Sort participants by score, then optional explicit order *within* each tied group. */
export type ScoreDraftRow = { userId: string; rawScore: string; notParticipated: boolean };

export function previewMatchResults(
  rows: ScoreDraftRow[],
  lowerWins: boolean,
  requestedTieBreaks: RegisterMatchResultsInput["tieBreaks"],
) {
  const entries: RegisterMatchResultsInput["entries"] = rows.flatMap(
    (row): RegisterMatchResultsInput["entries"] => {
      if (row.notParticipated) return [{ userId: row.userId, score: null }];
      const score = normalizeMatchScore(row.rawScore);
      return score === null ? [] : [{ userId: row.userId, score }];
    },
  );
  const tieBreaks = requestedTieBreaks.filter((tie) => {
    const group = entries.filter((entry) => entry.score === tie.score).map((entry) => entry.userId);
    return (
      group.length >= 2 &&
      group.length === tie.orderedUserIds.length &&
      new Set(tie.orderedUserIds).size === group.length &&
      tie.orderedUserIds.every((id) => group.includes(id))
    );
  });
  return {
    entries,
    tieBreaks,
    ranked: rankMatchResults({ lowerWins, entries, tieBreaks }),
    valid: entries.length === rows.length && entries.some((entry) => entry.score !== null),
  };
}

export function rankMatchResults(input: RegisterMatchResultsInput): MatchResults["entries"] {
  const order = new Map(input.entries.map((entry, index) => [entry.userId, index]));
  const ties = new Map(
    input.tieBreaks.map((tie) => [tie.score, new Map(tie.orderedUserIds.map((id, i) => [id, i]))]),
  );
  const sorted = [...input.entries].sort((a, b) => {
    if (a.score === null)
      return b.score === null
        ? (order.get(a.userId) as number) - (order.get(b.userId) as number)
        : 1;
    if (b.score === null) return -1;
    const scoreOrder = compareMatchScores(a.score, b.score);
    if (scoreOrder !== 0) return input.lowerWins ? scoreOrder : -scoreOrder;
    const tieOrder = ties.get(a.score);
    return tieOrder
      ? (tieOrder.get(a.userId) as number) - (tieOrder.get(b.userId) as number)
      : (order.get(a.userId) as number) - (order.get(b.userId) as number);
  });
  return sorted.map((entry, index) => {
    if (entry.score === null) return { ...entry, rank: null };
    const previous = sorted[index - 1];
    const shared =
      previous?.score !== null && previous?.score === entry.score && !ties.has(entry.score);
    const rank = shared ? sorted.findIndex((item) => item.score === entry.score) + 1 : index + 1;
    return { ...entry, rank };
  });
}
