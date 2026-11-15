import type { Db } from "mongodb";
import { BoardGamesRepository } from "./boardGames.repository";

type GameCover = { id: number; imageUrl: string | null };
type CoverRecord = {
  gamesDetail?: GameCover[];
  game?: GameCover;
  items?: CoverRecord[];
  proposal?: CoverRecord;
  proposals?: CoverRecord[];
};
/** Enrich already-authorized record DTOs AFTER their transaction; never hold locks for provider I/O. */
export async function enrichRecordGameCovers(db: Db, value: unknown) {
  if (!value || typeof value !== "object") return;
  const root = value as CoverRecord;
  const rows = [
    root,
    ...(root.items ?? []),
    ...(root.proposals ?? []),
    ...(root.proposal ? [root.proposal] : []),
  ];
  const missing = rows
    .flatMap((row) => [...(row.gamesDetail ?? []), ...(row.game ? [row.game] : [])])
    .filter((game) => !game.imageUrl);
  if (!missing.length) return;
  const games = await new BoardGamesRepository(db).findByIds([
    ...new Set(missing.map((game) => game.id)),
  ]);
  const images = new Map(games.map((game) => [game.id, game.image ?? null]));
  for (const game of missing) game.imageUrl = images.get(game.id) ?? null;
}
