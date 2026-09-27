#!/usr/bin/env node
/** Import the full BGG rankings CSV through the protected API in resumable chunks.
 * BGG_CSV=./boardgames_ranks.csv BGG_IMPORT_URL=https://.../api/admin/import-games \
 * BGG_IMPORT_TOKEN=... node apps/api/scripts/import-boardgames.mjs
 */
import { readFileSync } from "node:fs";
import { parseBoardGamesCsv } from "../src/app/lib/boardGames.csv.ts";

const CSV_PATH = process.env.BGG_CSV;
const IMPORT_URL = process.env.BGG_IMPORT_URL;
const TOKEN = process.env.BGG_IMPORT_TOKEN;
const CHUNK = Number(process.env.BGG_CHUNK ?? 500);
const SKIP_CHUNKS = Number(process.env.BGG_SKIP_CHUNKS ?? 0);
const END_CHUNKS = process.env.BGG_END_CHUNKS ? Number(process.env.BGG_END_CHUNKS) : Infinity;

if (!CSV_PATH || !IMPORT_URL || !TOKEN) {
  console.error("Missing BGG_CSV / BGG_IMPORT_URL / BGG_IMPORT_TOKEN");
  process.exit(1);
}
const endpoint = new URL(IMPORT_URL);
if (
  endpoint.protocol !== "https:" &&
  !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))
) {
  throw new Error("BGG_IMPORT_URL must use HTTPS (or local HTTP)");
}
if (
  !Number.isSafeInteger(CHUNK) ||
  CHUNK < 1 ||
  CHUNK > 500 ||
  !Number.isSafeInteger(SKIP_CHUNKS) ||
  SKIP_CHUNKS < 0 ||
  (END_CHUNKS !== Infinity && (!Number.isSafeInteger(END_CHUNKS) || END_CHUNKS < SKIP_CHUNKS))
) {
  throw new Error("Invalid BGG_CHUNK / BGG_SKIP_CHUNKS / BGG_END_CHUNKS");
}

async function postChunk(games) {
  const res = await fetch(IMPORT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ games }),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const games = parseBoardGamesCsv(readFileSync(CSV_PATH, "utf8"));
const preflight = await fetch(IMPORT_URL, {
  headers: { Authorization: `Bearer ${TOKEN}` },
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
});
if (!preflight.ok) throw new Error(`Import preflight HTTP ${preflight.status}; no games written`);
const target = await preflight.json();
if (
  target.schemaVersion !== 2 ||
  !target.databaseName ||
  target.databaseName.startsWith("bgo_ci_")
) {
  throw new Error("Import target has wrong schema or an isolated CI database; no games written");
}
console.log(`Parsed ${games.length} games; target database: ${target.databaseName}`);
const start = SKIP_CHUNKS * CHUNK;
const end = Math.min(games.length, END_CHUNKS * CHUNK);
let total = 0;
for (let i = start; i < end; i += CHUNK) {
  const chunk = games.slice(i, i + CHUNK);
  const res = await postChunk(chunk);
  total += res.written ?? chunk.length;
  console.log(
    `chunk ${i / CHUNK + 1}: +${res.written ?? chunk.length} (collection: ${res.total ?? "?"})`,
  );
}
if (end === games.length) {
  const cleanup = await fetch(IMPORT_URL, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${TOKEN}` },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!cleanup.ok) throw new Error(`Legacy thumbnail cleanup HTTP ${cleanup.status}`);
  console.log(`Removed legacy thumbnail field from ${(await cleanup.json()).removed} games.`);
}
console.log(`Done (chunks ${start / CHUNK}-${end / CHUNK}). Wrote ${total} games.`);
