#!/usr/bin/env tsx
/**
 * Run the Phase 1 DB migration (create social collections + indexes, drop
 * legacy `relationships`): `pnpm --filter api migrate`.
 */
import { getDb } from "../src/app/lib/db";
import { migrate } from "../src/app/lib/migrate";

async function main() {
  const db = await getDb();
  const result = await migrate(db);
  console.log("created indexes:", result.created);
  console.log("dropped legacy relationships:", result.droppedLegacyRelationships);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
