#!/usr/bin/env node
/**
 * Import the BGG `bg_ranks` CSV dump into the `boardGames` collection.
 *
 * Usage:
 *   BGG_CSV=/path/to/boardgame_ranks.csv \
 *   BGG_IMPORT_URL=https://api.board-game-organizer.com/api/admin/import-games \
 *   BGG_IMPORT_TOKEN=sk_live_... node apps/api/scripts/import-boardgames.mjs
 *
 * The CSV columns (bg_ranks dump): ID,Name,Year Published,Rank,Bayes
 * average,Average,Users rated,URL,Thumbnail. We keep id, name, year and
 * thumbnail only, and POST chunks to the admin import endpoint (the server
 * writes to Mongo — no DB credentials needed locally).
 */
import { readFileSync } from "node:fs";

const CSV_PATH = process.env.BGG_CSV;
const URL = process.env.BGG_IMPORT_URL;
const TOKEN = process.env.BGG_IMPORT_TOKEN;
const CHUNK = 500;

if (!CSV_PATH || !URL || !TOKEN) {
  console.error("Missing BGG_CSV / BGG_IMPORT_URL / BGG_IMPORT_TOKEN");
  process.exit(1);
}

/** Minimal CSV row splitter that honours quoted fields (names contain commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

async function postChunk(games) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ games }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const text = readFileSync(CSV_PATH, "utf8");
const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column "${name}" not found in CSV header: ${header.join(", ")}`);
  return i;
};
const iId = col("id");
const iName = col("name");
const iYear = col("year published");
const iThumb = col("thumbnail");

const games = [];
for (const r of rows.slice(1)) {
  const id = Number(r[iId]);
  if (!Number.isFinite(id)) continue;
  const name = (r[iName] ?? "").trim();
  if (!name) continue;
  const year = Number(r[iYear]);
  games.push({
    id,
    name,
    yearPublished: Number.isFinite(year) && year > 0 ? year : null,
    thumbnail: (r[iThumb] ?? "").trim() || null,
  });
}

console.log(`Parsed ${games.length} games from ${rows.length - 1} rows`);
let total = 0;
for (let i = 0; i < games.length; i += CHUNK) {
  const chunk = games.slice(i, i + CHUNK);
  const res = await postChunk(chunk);
  total += res.written ?? chunk.length;
  console.log(
    `chunk ${i / CHUNK + 1}: +${res.written ?? chunk.length} (collection: ${res.total ?? "?"})`,
  );
}
console.log(`Done. Wrote ${total} games.`);
