import { randomBytes } from "node:crypto";
import type { Invite, InviteStatus } from "@board-game-organizer/schemas";
import { INVITE_TTL_DAYS } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `invites` collection (Phase 3).
 *
 * An invite is a shareable link with a unique token, valid for
 * INVITE_TTL_DAYS. Claiming connects the claimer with the inviter: when the
 * invite carries an email and it matches the authenticated user, they become
 * friends; otherwise the claimer follows the inviter.
 */
export class InvitesRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get col() {
    return this.db.collection<Invite>(COLLECTIONS.INVITES);
  }

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  /** Generate a URL-safe token (128 bits, enough entropy for unguessable links). */
  static generateToken(): string {
    return randomBytes(16).toString("base64url");
  }

  /** Invite validity window in milliseconds. */
  static ttlMs(): number {
    return INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  async create(inviterUserId: string, email?: string): Promise<Invite> {
    const now = new Date();
    const invite: Omit<Invite, "_id"> = {
      token: InvitesRepository.generateToken(),
      inviterUserId,
      ...(email ? { email } : {}),
      status: "pending",
      expiresAt: new Date(now.getTime() + InvitesRepository.ttlMs()),
      createdAt: now,
    };
    await this.col.insertOne(invite as Invite, this.opts);
    return invite as Invite;
  }

  findByToken(token: string): Promise<Invite | null> {
    return this.col.findOne({ token }, this.opts);
  }

  /** All invites created by a user, newest first. */
  listByInviter(inviterUserId: string): Promise<Invite[]> {
    return this.col
      .find({ inviterUserId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
  }

  /** Mark an invite as claimed (idempotent: only pending invites transition). */
  async claim(token: string, claimedByUserId: string): Promise<Invite | null> {
    const now = new Date();
    const result = await this.col.findOneAndUpdate(
      { token, status: "pending", expiresAt: { $gt: now } },
      {
        $set: {
          status: "claimed" as InviteStatus,
          claimedAt: now,
          claimedByUserId,
        },
      },
      { returnDocument: "after", ...this.opts },
    );
    return result;
  }

  /** Expire stale pending invites (background cleanup). Returns count expired. */
  async expireStale(): Promise<number> {
    const result = await this.col.updateMany(
      { status: "pending", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" as InviteStatus } },
      this.opts,
    );
    return result.modifiedCount;
  }
}
