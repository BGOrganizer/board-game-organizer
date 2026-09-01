import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { BoardGameGeekClient } from "bgg-client";

/**
 * Thin wrapper around `bgg-client` (BoardGameGeek XML API2).
 *
 * - The BGG client requires an API key (BGG_API_KEY env). When the key is
 *   missing we return an explicit error instead of crashing the API.
 * - bgg-client rate-limits to 1 req/5s to comply with BGG's suggested rate.
 *   Search results are intentionally minimal (id + name) — details (image,
 *   year) are fetched via `thing` only when a game is selected, so the
 *   search list stays fast.
 */

let client: BoardGameGeekClient | null = null;

function getClient(): BoardGameGeekClient {
  if (!client) {
    const key = process.env.BGG_API_KEY;
    if (!key) {
      throw new Error("BGG_API_KEY is not configured");
    }
    client = new BoardGameGeekClient(key);
  }
  return client;
}

export async function searchGames(query: string): Promise<BggSearchItem[]> {
  const c = getClient();
  const results = await c.search(query, { type: "boardgame" });
  return results
    .map((r) => ({ id: r.id, name: r.name.value }))
    .filter((r) => r.name.length > 0)
    .slice(0, 25);
}

export async function gameDetails(id: number): Promise<BggThingResponse> {
  const c = getClient();
  const thing = await c.thing(id);
  if (!thing) {
    throw new Error(`Game ${id} not found`);
  }
  const primaryName =
    thing.name.find((n) => n.type === "primary")?.value ?? thing.name[0]?.value ?? "Unknown";
  return {
    id: thing.id,
    name: primaryName,
    imageUrl: thing.thumbnail ?? null,
    year: thing.yearpublished?.value ?? null,
  };
}
