import { afterEach, expect, it, vi } from "vitest";
import { enrichBoardGames } from "../../../../../scripts/enrich-boardgames.mjs";

afterEach(() => vi.restoreAllMocks());
it("resumes bounded batches, preserves the attested query and honors backoff without double-counting recovered records", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const receipts = [
    { count: 20, skipped: 5, recovered: 10, incomplete: 5, nextOffset: 20, retryAfterMs: 60000 },
    { count: 20, skipped: 15, recovered: 5, incomplete: 0, nextOffset: 20, retryAfterMs: 5000 },
    { count: 20, skipped: 20, recovered: 0, incomplete: 0, nextOffset: null, retryAfterMs: 5000 },
  ];
  const fetcher = vi.fn(async () => Response.json(receipts.shift()));
  const wait = vi.fn(async () => {});
  expect(
    await enrichBoardGames(
      "https://owned.test/api/admin/import-games?x-vercel-protection-bypass=unit",
      "unit-token",
      fetcher,
      wait,
    ),
  ).toEqual({ recovered: 15, skipped: 25, failed: 0 });
  expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).offset)).toEqual([0, 0, 20]);
  expect(fetcher.mock.calls[0][0].pathname).toBe("/api/admin/import-games/enrich");
  expect(fetcher.mock.calls[0][0].searchParams.get("x-vercel-protection-bypass")).toBe("unit");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    headers: { Authorization: "Bearer unit-token" },
  });
  expect(wait.mock.calls.map(([ms]) => ms)).toEqual([60000, 5000]);
});
it("reports incomplete batches explicitly after bounded retries, leaving CSV publication separate", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const fetcher = vi.fn(async () =>
    Response.json({
      count: 20,
      skipped: 0,
      recovered: 0,
      incomplete: 20,
      nextOffset: null,
      retryAfterMs: 5000,
    }),
  );
  await expect(
    enrichBoardGames("https://owned.test/api/admin/import-games", "unit", fetcher, async () => {}),
  ).rejects.toThrow("CSV remains imported");
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("rejects invalid receipts and HTTP failures without looping or exposing provider response bodies", async () => {
  await expect(
    enrichBoardGames(
      "https://owned.test/api/admin/import-games",
      "unit",
      async () => Response.json({ count: 99 }),
      async () => {},
    ),
  ).rejects.toThrow("Invalid enrichment receipt");
  await expect(
    enrichBoardGames(
      "https://owned.test/api/admin/import-games",
      "unit",
      async () => new Response("private response", { status: 500 }),
      async () => {},
    ),
  ).rejects.toThrow("Enrichment HTTP 500; CSV remains imported");
});
