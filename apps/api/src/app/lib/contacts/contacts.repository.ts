import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Persisted device-contacts links (Phase: contacts sync).
 *
 * After the user grants address-book access, the matched registered users are
 * stored here (source: "device") so suggestions don't require re-reading the
 * address book on every visit, and so the same contact list is available
 * across devices/web later.
 */
export class ContactLinksRepository {
  constructor(private db: Db) {}

  private col() {
    return this.db.collection(COLLECTIONS.CONTACT_LINKS);
  }

  /**
   * Replaces the contact set for `userId` with the provided matches. The
   * device address book is the source of truth: if the user removed a
   * contact (or revoked access), stale links disappear.
   */
  async replaceForUser(userId: string, matches: Array<{ contactClerkId: string; email: string }>) {
    const now = new Date();
    const links = matches.map((m) => ({
      userId,
      contactClerkId: m.contactClerkId,
      email: m.email,
      createdAt: now,
    }));
    await this.col().deleteMany({ userId });
    if (links.length) await this.col().insertMany(links);
    return links.length;
  }

  /** Clerk ids of the user's device contacts (if any were ever synced). */
  async contactClerkIdsForUser(userId: string): Promise<string[]> {
    const links = await this.col()
      .find({ userId }, { projection: { contactClerkId: 1 } })
      .toArray();
    return links.map((l) => l.contactClerkId);
  }
}
