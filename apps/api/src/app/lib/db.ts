import { type ClientSession, type Db, MongoClient } from "mongodb";

let client: MongoClient;

async function getClient() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
  }
  return client;
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db(process.env.MONGODB_DB_NAME!);
}

export async function withTransaction<T>(
  fn: (session: ClientSession, db: Db) => Promise<T>,
): Promise<T> {
  const c = await getClient();
  const session = c.startSession();
  let result: T;
  try {
    await session.withTransaction(async () => {
      result = await fn(session, c.db(process.env.MONGODB_DB_NAME!));
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

export const COLLECTIONS = {
  USERS: "users",
  FOLLOWS: "follows",
  FRIEND_REQUESTS: "friendRequests",
  BLOCKS: "blocks",
  INVITES: "invites",
  RELATIONSHIPS: "relationships",
  CONTACT_LINKS: "contactLinks",
} as const;
