import type { PlayerPoll } from "@board-game-organizer/schemas";
import type { Element } from "@xmldom/xmldom";
/** Parse the complete poll atomically; malformed or empty polls cannot erase verified data. */
export function parsePlayerPoll(item: Element, fetchedAt: string): PlayerPoll | undefined {
  const polls = item.getElementsByTagName("poll");
  for (let i = 0; i < polls.length; i++) {
    const poll = polls[i];
    if (poll.getAttribute("name") !== "suggested_numplayers") continue;
    const totalVotes = Number(poll.getAttribute("totalvotes"));
    if (!Number.isSafeInteger(totalVotes) || totalVotes <= 0) return;
    const rows: PlayerPoll["rows"] = [];
    const results = poll.getElementsByTagName("results");
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const label = result.getAttribute("numplayers") ?? "";
      if (!/^\d+\+?$/.test(label)) return;
      const players = Number(label.replace("+", ""));
      if (!Number.isSafeInteger(players) || players < 1) return;
      const counts = new Map<string, number>();
      const entries = result.getElementsByTagName("result");
      for (let k = 0; k < entries.length; k++) {
        const entry = entries[k];
        const value = entry.getAttribute("value") ?? "";
        const raw = entry.getAttribute("numvotes");
        const n = Number(raw);
        if (
          raw === null ||
          raw.trim() === "" ||
          !Number.isSafeInteger(n) ||
          n < 0 ||
          counts.has(value)
        )
          return;
        counts.set(value, n);
      }
      const best = counts.get("Best"),
        recommended = counts.get("Recommended"),
        notRecommended = counts.get("Not Recommended");
      if (best === undefined || recommended === undefined || notRecommended === undefined) return;
      rows.push({
        players,
        orMore: label.endsWith("+"),
        best,
        recommended,
        notRecommended,
        sampleCount: best + recommended + notRecommended,
      });
    }
    if (
      !rows.length ||
      !rows.some((row) => row.sampleCount > 0) ||
      new Set(rows.map((row) => row.players + ":" + row.orMore)).size !== rows.length
    )
      return;
    return { totalVotes, rows, fetchedAt };
  }
}
