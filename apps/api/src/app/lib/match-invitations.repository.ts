import { randomUUID } from "node:crypto";
import type { MatchInvitation, MatchInvitationStatus } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/** MongoDB access for match invitation lifecycle. */
export class MatchInvitationsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get col() {
    return this.db.collection<MatchInvitation>(COLLECTIONS.MATCH_INVITATIONS);
  }

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  async create(matchId: string, inviterUserId: string, inviteeUserId: string) {
    const now = new Date().toISOString();
    const invitation: MatchInvitation = {
      id: randomUUID(),
      matchId,
      inviterUserId,
      inviteeUserId,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    await this.col.insertOne(invitation, this.opts);
    return invitation;
  }

  async createMany(matchId: string, inviterUserId: string, inviteeUserIds: string[]) {
    const invitations: MatchInvitation[] = [];
    for (const inviteeUserId of inviteeUserIds) {
      invitations.push(await this.create(matchId, inviterUserId, inviteeUserId));
    }
    return invitations;
  }

  findById(id: string) {
    return this.col.findOne({ id }, { projection: { _id: 0 }, ...this.opts });
  }

  findByMatchAndInvitee(matchId: string, inviteeUserId: string) {
    return this.col.findOne({ matchId, inviteeUserId }, { projection: { _id: 0 }, ...this.opts });
  }

  listByMatch(matchId: string) {
    return this.col
      .find({ matchId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: 1 })
      .toArray();
  }

  listByMatchIds(matchIds: string[]) {
    return this.col
      .find({ matchId: { $in: matchIds } }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: 1 })
      .toArray();
  }

  listByInvitee(inviteeUserId: string) {
    return this.col
      .find({ inviteeUserId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: -1 })
      .toArray();
  }

  countByMatch(matchId: string) {
    return this.col.countDocuments({ matchId }, this.opts);
  }

  respond(id: string, status: Extract<MatchInvitationStatus, "ACCEPTED" | "DECLINED">) {
    const now = new Date().toISOString();
    return this.col.findOneAndUpdate(
      { id, status: "PENDING" },
      { $set: { status, respondedAt: now, updatedAt: now } },
      { returnDocument: "after", ...this.opts },
    );
  }

  deleteAccepted(id: string, inviteeUserId: string) {
    return this.col.deleteOne({ id, inviteeUserId, status: "ACCEPTED" }, this.opts);
  }

  deleteByIdForMatch(id: string, matchId: string) {
    return this.col.deleteOne({ id, matchId }, this.opts);
  }

  deleteAllByMatch(matchId: string) {
    return this.col.deleteMany({ matchId }, this.opts);
  }
}
