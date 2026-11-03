import { randomUUID } from "node:crypto";
import type {
  EventRecord,
  ProfileActivityRecord,
  TableRecord,
} from "@board-game-organizer/schemas";
import { profileWinMilestones } from "@board-game-organizer/shared";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "../db";
import { UsersRepository } from "../users/users.repository";
import { ProfileRepository } from "./profile.repository";

/** Append-only domain events in the source transaction, not a notification inbox mirror. */
export class ProfileActivitiesRepository {
  private opts;
  constructor(
    private db: Db,
    session?: ClientSession,
  ) {
    this.opts = session ? { session } : {};
  }
  record(row: Omit<ProfileActivityRecord, "id">) {
    return this.db
      .collection<ProfileActivityRecord>(COLLECTIONS.PROFILE_ACTIVITIES)
      .updateOne(
        { userId: row.userId, source: row.source, kind: row.kind },
        { $setOnInsert: { ...row, id: randomUUID() } },
        { ...this.opts, upsert: true },
      );
  }
  async finalized(event: EventRecord, tables: TableRecord[]) {
    const wins = new Map<string, string[]>();
    const ordered = [...tables].sort(
      (a, b) =>
        (a.confirmed?.startsAt ?? "").localeCompare(b.confirmed?.startsAt ?? "") ||
        a.order - b.order,
    );
    for (const table of ordered) {
      const entries =
        table.results?.entries.filter(
          (row) => row.score !== null && table.confirmed?.playerIds.includes(row.userId),
        ) ?? [];
      if (entries.length < 2) continue;
      for (const entry of entries) {
        await this.record({
          source: `table:${table.id}`,
          userId: entry.userId,
          kind: "played",
          occurredAt: table.results!.finalizedAt,
          eventId: event.id,
          tableId: table.id,
          ...(event.groupId ? { groupId: event.groupId } : {}),
          outcome: entry.rank === 1 ? "won" : "played",
        });
        if (entry.rank === 1) {
          const previous = wins.get(entry.userId) ?? [];
          previous.push(table.id);
          wins.set(entry.userId, previous);
        }
      }
    }
    const profiles = new ProfileRepository(this.db, this.opts.session);
    const users = new UsersRepository(this.db, this.opts.session);
    // Serialize aggregate threshold crossings across games and unrated Events; never parallelize a session.
    for (const userId of [...wins.keys()].sort()) await users.lock(userId);
    for (const [userId, tableIds] of wins) {
      const stats = await profiles.player(userId),
        previous = stats.gamesWon - tableIds.length;
      for (const milestone of profileWinMilestones(previous, stats.gamesWon))
        await this.record({
          source: `wins:${milestone}`,
          userId,
          kind: "milestone",
          occurredAt: event.updatedAt,
          eventId: event.id,
          tableId: tableIds[milestone - previous - 1],
          ...(event.groupId ? { groupId: event.groupId } : {}),
          milestone,
        });
    }
  }
  page(userId: string, kind: ProfileActivityRecord["kind"] | undefined, cursor?: string) {
    const [occurredAt, id] = cursor?.split("|") ?? [];
    return this.db
      .collection<ProfileActivityRecord>(COLLECTIONS.PROFILE_ACTIVITIES)
      .find(
        {
          userId,
          ...(kind ? { kind } : {}),
          ...(occurredAt && id
            ? { $or: [{ occurredAt: { $lt: occurredAt } }, { occurredAt, id: { $lt: id } }] }
            : {}),
        },
        { ...this.opts, projection: { _id: 0 } },
      )
      .sort({ occurredAt: -1, id: -1 })
      .limit(50)
      .toArray();
  }
}
