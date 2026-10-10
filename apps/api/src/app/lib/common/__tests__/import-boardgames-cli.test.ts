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
  [{ schemaVersion: 1, databaseName: "dev" }, false],
  [{ schemaVersion: 2, databaseName: "bgo_ci_1_1" }, false],
  [{ schemaVersion: 2, databaseName: "dev" }, true],
] as const)("checks target before importing (target %j)", async (target, accepted) => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-import-test-"));
  const csv = join(dir, "ranks.csv");
  writeFileSync(csv, `${header}\n1,Azul,2017,0,0,7.5,5,0,,,,,,,,\n`);
  let writes = 0;
  let cleanups = 0;
  let postedGame: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(target));
    } else if (request.method === "PATCH") {
      cleanups++;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ removed: 5 }));
    } else {
      writes++;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      postedGame = JSON.parse(Buffer.concat(chunks).toString()).games[0];
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ written: 1, total: 1 }));
    }
  });
  try {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const run = exec(process.execPath, [resolve("scripts/import-boardgames.mjs")], {
      cwd: resolve("."),
      env: {
        ...process.env,
        BGG_CSV: csv,
        BGG_IMPORT_URL: `http://127.0.0.1:${address.port}/api/admin/import-games`,
        BGG_IMPORT_TOKEN: "test-token",
      },
    });
    if (accepted)
      await expect(run).resolves.toMatchObject({ stdout: expect.stringContaining("Wrote 1") });
    else await expect(run).rejects.toThrow("wrong schema or an isolated CI database");
    expect(writes).toBe(accepted ? 1 : 0);
    expect(cleanups).toBe(accepted ? 1 : 0);
    if (accepted) {
      expect(postedGame).toMatchObject({
        id: 1,
        isExpansion: false,
        rank: 0,
        bayesAverage: 0,
        average: 7.5,
        abstractsRank: null,
        warGamesRank: null,
      });
    }
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
