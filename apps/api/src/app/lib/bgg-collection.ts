import type { BggCollectionGame, BggIdentity } from "@board-game-organizer/schemas";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export class BggRemoteError extends Error {
  constructor(
    public kind: "not_found" | "unavailable" | "rate_limited",
    public retryAfterMs = 5000,
  ) {
    super(kind);
  }
}

function trustedImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" &&
      (url.hostname === "cf.geekdo-images.com" || url.hostname === "cf.geekdo-static.com")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function xml(body: string) {
  try {
    let invalid = false;
    const document = new DOMParser({
      onError: (level) => {
        if (level !== "warning") invalid = true;
      },
    }).parseFromString(body, "text/xml");
    const root = document.documentElement;
    if (invalid || !root) throw new BggRemoteError("unavailable");
    return root;
  } catch {
    throw new BggRemoteError("unavailable");
  }
}

export function parseBggUser(body: string): BggIdentity | null {
  const element = xml(body);
  if (element.tagName !== "user") return null;
  const id = Number(element.getAttribute("id"));
  const username = element.getAttribute("name")?.trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !username) return null;
  return {
    id,
    username,
    avatarUrl: trustedImage(
      element.getElementsByTagName("avatarlink").item(0)?.getAttribute("value"),
    ),
  };
}

export function parseBggCollection(body: string, userId: string, snapshot: string) {
  const root = xml(body);
  if (root.tagName !== "items") throw new BggRemoteError("unavailable");
  const items = root.getElementsByTagName("item");
  if (root.hasAttribute("totalitems") && Number(root.getAttribute("totalitems")) !== items.length)
    throw new BggRemoteError("unavailable");
  const games = new Map<number, Omit<BggCollectionGame, "_id">>();
  const serializer = new XMLSerializer();
  for (let i = 0; i < items.length; i++) {
    const item = items.item(i);
    if (item?.getAttribute("subtype") !== "boardgame") continue;
    const gameId = Number(item.getAttribute("objectid"));
    const name = item.getElementsByTagName("name").item(0)?.textContent?.trim();
    if (!Number.isSafeInteger(gameId) || gameId <= 0 || !name) continue;
    const rawYear = Number(item.getElementsByTagName("yearpublished").item(0)?.textContent);
    const xmlItem = serializer.serializeToString(item);
    games.set(gameId, {
      userId,
      snapshot,
      gameId,
      name,
      year: Number.isSafeInteger(rawYear) && rawYear > 0 ? rawYear : null,
      imageUrl: trustedImage(item.getElementsByTagName("image").item(0)?.textContent),
      subtype: "boardgame",
      xml: xmlItem,
    });
  }
  return [...games.values()];
}

async function bggFetch(path: string) {
  const token = process.env.BGG_TOKEN;
  if (!token) throw new BggRemoteError("unavailable");
  let response: Response;
  try {
    response = await fetch(`https://boardgamegeek.com/xmlapi2/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new BggRemoteError("unavailable");
  }
  if (response.status === 202 || response.status === 429) {
    const wait = Number(response.headers.get("retry-after"));
    throw new BggRemoteError(
      "rate_limited",
      Number.isFinite(wait) && wait > 0 ? Math.min(wait * 1000, 60000) : 5000,
    );
  }
  if (response.status === 404) throw new BggRemoteError("not_found");
  if (!response.ok) throw new BggRemoteError("unavailable");
  const body = await response.text();
  if (body.length > 25_000_000) throw new BggRemoteError("unavailable");
  return body;
}

export async function fetchBggUser(username: string): Promise<BggIdentity | null> {
  return parseBggUser(await bggFetch(`user?name=${encodeURIComponent(username)}`));
}

export async function fetchBggCollection(username: string, userId: string, snapshot: string) {
  return parseBggCollection(
    await bggFetch(
      `collection?username=${encodeURIComponent(username)}&stats=1&excludesubtype=boardgameexpansion`,
    ),
    userId,
    snapshot,
  );
}
