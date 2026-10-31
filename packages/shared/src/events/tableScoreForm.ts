import type { FinalizeEventInput } from "@board-game-organizer/schemas";
import { previewMatchResults, type ScoreDraftRow } from "../matches/matchResults";
export type TableScoreInput = Omit<FinalizeEventInput["results"][number], "tableId">;
export type ScorePlayer = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};
export function previewTableResults(
  rows: ScoreDraftRow[],
  lowerWins: boolean,
  ties: TableScoreInput["tieBreaks"],
) {
  const preview = previewMatchResults(rows, lowerWins, ties);
  return { ...preview, valid: rows.length > 0 && preview.entries.length === rows.length };
}
