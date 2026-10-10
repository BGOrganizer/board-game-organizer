import { Inngest } from "inngest";
import { getDb } from "../db";
import { EventsRepository } from "./events.repository";
export function deadlineServiceConfigured(): boolean {
  return Boolean(
    process.env.INNGEST_EVENT_KEY?.trim() &&
      process.env.INNGEST_SIGNING_KEY?.trim() &&
      process.env.INNGEST_ENV?.trim() &&
      process.env.MONGODB_DB_NAME?.trim(),
  );
}
export const inngest = new Inngest({ id: "bgo-events", env: process.env.INNGEST_ENV });
/** Delivery is outside the MongoDB transaction; persisted ids make retries idempotent. */
export async function dispatchEventDeadlines() {
  if (!deadlineServiceConfigured()) return;
  const repository = new EventsRepository(await getDb());
  const rows = await repository.pendingDeliveries();
  if (rows.length === 0) return;
  await inngest.send(
    rows.map((row) => ({
      id: `${process.env.MONGODB_DB_NAME}/${row.id}`,
      name: "bgo/event.deadline",
      data: {
        eventId: row.eventId,
        version: row.version,
        bookingClosesAt: row.bookingClosesAt,
        databaseName: process.env.MONGODB_DB_NAME,
      },
    })),
  );
  await repository.delivered(rows.map((row) => row.id));
}
