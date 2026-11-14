import type {
  NotificationChangeReference,
  NotificationChangesPage,
} from "@board-game-organizer/schemas";
import { displayedNotificationReferences } from "./notificationChanges";

/** One captured resource snapshot, including unloaded pages; each write keeps exact revisions. */
export async function readNotificationChangesSnapshot(
  first: NotificationChangesPage,
  load: (cursor: string) => Promise<NotificationChangesPage>,
  read: (through: string, references: NotificationChangeReference[]) => Promise<unknown>,
  isCurrent: () => boolean,
) {
  let page = first;
  while (isCurrent()) {
    const references = displayedNotificationReferences(page.changes);
    if (references.length) await read(first.asOf, references);
    if (!page.nextCursor || !isCurrent()) return;
    page = await load(page.nextCursor);
    if (page.asOf !== first.asOf) throw new Error("Notification snapshot changed");
  }
}
