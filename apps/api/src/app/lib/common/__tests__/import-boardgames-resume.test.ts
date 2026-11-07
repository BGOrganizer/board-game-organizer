import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const header =
  "id,name,yearpublished,rank,bayesaverage,average,usersrated,is_expansion,abstracts_rank,cgs_rank,childrensgames_rank,familygames_rank,partygames_rank,strategygames_rank,thematic_rank,wargames_rank";

it.each([
  { skip: "0", end: "1", chunk: "1", ids: [1], cleanup: 0 },
  { skip: "1", end: "", chunk: "1", ids: [2], cleanup: 1 },
  { skip: "2", end: "", chunk: "1", ids: [], cleanup: 0 },
  { skip: "0", end: "0", chunk: "1", ids: [], cleanup: 0 },
  { skip: "0", end: "", chunk: "501", ids: [], cleanup: 0 },
])(
  "resumes the exact CSV window and rejects empty/invalid windows before requests: %j",
  async (entry) => {
    const dir = mkdtempSync(join(tmpdir(), "bgo-resume-"));
    const csv = join(dir, "ranks.csv");
    writeFileSync(
      csv,
      `\uFEFF${header}\r\n1,Base,2017,0,0,7.5,5,0,1,2,3,4,5,6,7,8\r\n2,Expansion,2020,0,0,7,3,1,,,,,,,,\r\n`,
    );
    const posted: number[] = [];
    let requests = 0,
      cleanups = 0;
    const server = createServer(async (request, response) => {
      requests++;
      expect(
        new URL(request.url ?? "", "http://127.0.0.1").searchParams.get(
          "x-vercel-protection-bypass",
        ),
      ).toBe("unit&bypass");
      expect(request.headers.authorization).toBe("Bearer unit-token");
      response.setHeader("Content-Type", "application/json");
      if (request.method === "GET")
        response.end(JSON.stringify({ schemaVersion: 2, databaseName: "catalog" }));
      else if (request.method === "PATCH") {
        cleanups++;
        response.end(JSON.stringify({ removed: 0 }));
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        posted.push(...body.games.map((game: { id: number }) => game.id));
        expect(body.games[0]).toHaveProperty("isExpansion", body.games[0].id === 2);
        response.end(JSON.stringify({ written: body.games.length, total: 2 }));
      }
    });
    try {
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing local test listener");
      const run = exec(process.execPath, [resolve("scripts/import-boardgames.mjs")], {
        cwd: resolve("."),
        env: {
          ...process.env,
          BGG_CSV: csv,
          BGG_IMPORT_URL: `http://127.0.0.1:${address.port}/api/admin/import-games`,
          BGG_IMPORT_TOKEN: "unit-token",
          BGG_BYPASS: "unit&bypass",
          BGG_CHUNK: entry.chunk,
          BGG_SKIP_CHUNKS: entry.skip,
          BGG_END_CHUNKS: entry.end,
        },
      });
      if (entry.ids.length)
        await expect(run).resolves.toMatchObject({ stdout: expect.stringContaining("Wrote 1") });
      else {
        await expect(run).rejects.toThrow();
        expect(requests).toBe(0);
      }
      expect(posted).toEqual(entry.ids);
      expect(cleanups).toBe(entry.cleanup);
    } finally {
      server.closeAllConnections();
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
