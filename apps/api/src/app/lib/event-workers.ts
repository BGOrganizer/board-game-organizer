import type { ObjectId } from "mongodb";
import { z } from "zod";
import { BoardGamesRepository } from "./boardGames.repository";
import { getDb, withTransaction } from "./db";
import { deadlineServiceConfigured, dispatchEventDeadlines, inngest } from "./event-deadlines";
import { EventsRepository } from "./events.repository";
import { EventsService } from "./events.service";
import { NotificationsRepository } from "./notifications.repository";
import { OrganizationAssetsRepository } from "./organization-assets.repository";
import { OrganizationsRepository } from "./organizations.repository";
import { dispatchNotifications } from "./push";
import { UsersRepository } from "./users.repository";

async function closeEvent(eventId: string, version?: number) {
  const ids: ObjectId[] = [];
  const result = await withTransaction(async (session, db) => {
    ids.length = 0;
    const service = new EventsService(
      new EventsRepository(db, session),
      new OrganizationsRepository(db, session),
      new OrganizationAssetsRepository(db, session),
      new UsersRepository(db, session),
      new BoardGamesRepository(db, session),
      new NotificationsRepository(db, session, ids),
    );
    return service.close(eventId, version);
  });
  if (ids.length > 0) await dispatchNotifications(ids);
  return result;
}
const deadlineData = z.object({
  eventId: z.uuid(),
  version: z.number().int().positive(),
  bookingClosesAt: z.iso.datetime(),
  databaseName: z.string().min(1),
});
export const closeEventAtDeadline = inngest.createFunction(
  { id: "event-booking-cutoff", retries: 5, triggers: [{ event: "bgo/event.deadline" }] },
  async ({ event, step }) => {
    const data = deadlineData.parse(event.data);
    if (!deadlineServiceConfigured() || data.databaseName !== process.env.MONGODB_DB_NAME)
      return { ignored: true };
    await step.sleepUntil("wait-for-booking-cutoff", new Date(data.bookingClosesAt));
    // Published edits schedule a new version. Stale sleepers cannot close updated events.
    return step.run("freeze-event-roster", () => closeEvent(data.eventId, data.version));
  },
);
export const recoverEventDeadlines = inngest.createFunction(
  { id: "recover-event-deadlines", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    if (!deadlineServiceConfigured()) return { disabled: true };
    await step.run("deliver-persisted-deadlines", dispatchEventDeadlines);
    const due = await step.run("find-overdue-events", async () =>
      new EventsRepository(await getDb()).dueEvents(),
    );
    for (const event of due)
      await step.run(`recover-${event.id}-${event.version}`, () =>
        closeEvent(event.id, event.version),
      );
    return { checked: due.length };
  },
);
