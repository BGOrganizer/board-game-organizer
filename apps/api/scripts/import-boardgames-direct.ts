#!/usr/bin/env tsx

/** Import the full BGG CSV into the attested Preview development database directly. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";
import { parseBoardGamesCsv } from "../src/app/lib/boardGames.csv";
import { BoardGamesRepository } from "../src/app/lib/boardGames.repository";
import { COLLECTIONS } from "../src/app/lib/db";

const PREVIEW_DATABASE = "board-game-organizer";
const CHUNK_SIZE = 500;

export function validateDirectImportTarget(env: Record<string, string | undefined>) {
  const uri = env.BGG_MONGODB_URI;
  const databaseName = env.BGG_DATABASE_NAME;
  const csvPath = env.BGG_CSV;
  if (!uri || !databaseName || !csvPath) {
    throw new Error("Set BGG_MONGODB_URI, BGG_DATABASE_NAME and BGG_CSV");
  }
  if (databaseName !== PREVIEW_DATABASE) {
    throw new Error(`Only the attested Preview database ${PREVIEW_DATABASE} is allowed`);
  }

  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error("Invalid MongoDB connection string");
  }
  if (!["mongodb:", "mongodb+srv:"].includes(url.protocol) || !url.host) {
    throw new Error("BGG_MONGODB_URI must be a MongoDB connection string");
  }
  if (url.pathname.length > 1 && decodeURIComponent(url.pathname.slice(1)) !== databaseName) {
    throw new Error("MongoDB connection string database does not match BGG_DATABASE_NAME");
  }
  const target = `${url.host}/${databaseName}`;
  if (env.BGG_CONFIRM_TARGET !== target) {
    throw new Error(`Verify the Preview cluster, then set BGG_CONFIRM_TARGET=${target}`);
  }
  return { uri, databaseName, csvPath, target };
}

export async function importDirectCsv(env: Record<string, string | undefined>) {
  const { uri, databaseName, csvPath, target } = validateDirectImportTarget(env);
  const games = parseBoardGamesCsv(await readFile(csvPath, "utf8"));
  if (!games.length) throw new Error("CSV has no games; nothing written");
  console.log(`Importing ${games.length} games into ${target}`);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    // Upserts must find one game by BGG ID, even on a legacy catalog.
    await db.collection(COLLECTIONS.BOARD_GAMES).createIndex({ id: 1 }, { unique: true });
    const repository = new BoardGamesRepository(db);
    for (let i = 0; i < games.length; i += CHUNK_SIZE) {
      await repository.bulkUpsert(games.slice(i, i + CHUNK_SIZE));
      console.log(`Imported ${Math.min(i + CHUNK_SIZE, games.length)}/${games.length}`);
    }
    const removed = await repository.removeLegacyThumbnails();
    console.log(`Done. Removed ${removed} legacy thumbnails.`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  importDirectCsv(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Import failed");
    process.exitCode = 1;
  });
}
