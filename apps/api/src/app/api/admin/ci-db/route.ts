import { z } from "zod";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { migrate } from "@/app/lib/migrate";

const requestSchema = z.object({
  action: z.enum(["seed", "cleanup"]),
  databaseName: z.string().regex(/^bgo_ci_[1-9][0-9]*_[1-9][0-9]*$/),
});

export function OPTIONS(request: Request) {
  return corsOptions(request);
}

/** Only an isolated Preview deployment can seed or clear its own run database. */
export async function POST(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.databaseName !== process.env.MONGODB_DB_NAME) {
    return corsJson({ error: "Invalid CI database" }, { status: 400 }, request);
  }

  const db = await getDb();
  if (parsed.data.action === "seed") {
    // Run IDs are unique; creating indexes is enough to initialize a fresh database.
    await migrate(db);
    await new BoardGamesRepository(db).bulkUpsert([
      { id: 295947, name: "Cascadia", yearPublished: 2021 },
    ]);
  } else {
    // Atlas readWrite can drop collections but not databases. Once the last
    // collection is removed, MongoDB no longer retains the CI database.
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      await db.collection(name).drop();
    }
  }
  return corsJson({ ok: true }, {}, request);
}
