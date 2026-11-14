import type { Notification } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "../db";

/** Inbox/Alert reads are informational, never a substitute for current invitation consent. */
export async function notificationRequiresResponse(
  db: Db,
  note: Pick<Notification, "kind" | "href" | "recipientUserId">,
  session?: ClientSession,
): Promise<boolean> {
  const opts = session ? { session } : {};
  if (note.kind === "group_invitation") {
    const id = /^\/groups\/([a-f\d-]{36})$/i.exec(note.href)?.[1];
    return Boolean(
      id &&
        (await db
          .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
          .findOne(
            { groupId: id, userId: note.recipientUserId, kind: "INVITATION", status: "PENDING" },
            opts,
          )),
    );
  }
  if (note.kind === "table_invitation") {
    const id = /^\/events\/[a-f\d-]{36}\/tables\/([a-f\d-]{36})$/i.exec(note.href)?.[1];
    return Boolean(
      id &&
        (await db
          .collection(COLLECTIONS.TABLE_REGISTRATIONS)
          .findOne(
            { tableId: id, userId: note.recipientUserId, kind: "INVITATION", status: "PENDING" },
            opts,
          )),
    );
  }
  // Other domain decisions keep their existing independent controls. A historical kind alone
  // cannot prove a CURRENT pending decision or make its informational notice unread forever.
  // Only the source-proven invitation consent above changes the informational-read policy.
  return false;
}
