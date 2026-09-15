import { randomUUID } from "node:crypto";
import type { Match, MatchStatus } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

type StoredMatch = Omit<Match, "status" | "updatedAt"> & {
  status?: MatchStatus;
  updatedAt?: string;
  /** Legacy field; invitations now live in `matchInvitations`. */
  invitedUserIds?: string[];
  /** Internal write-conflict counter serializes invitation changes. */
  invitationRevision?: number;
};

/** MongoDB access for matches. Invitation state lives in MatchInvitationsRepository. */
export class MatchesRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get col() {
    return this.db.collection<StoredMatch>(COLLECTIONS.MATCHES);
  }

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  private normalize(match: StoredMatch): Match {
    return {
      id: match.id,
      clerkId: match.clerkId,
      name: match.name,
      dates: match.dates,
      minPlayers: match.minPlayers,
      maxPlayers: match.maxPlayers,
      gameIds: match.gameIds,
      status: match.status ?? "PLANNING",
      createdAt: match.createdAt,
      updatedAt: match.updatedAt ?? match.createdAt,
    };
  }

  async create(input: {
    clerkId: string;
    name: string;
    dates: string[];
    minPlayers: number;
    maxPlayers: number;
    gameIds: number[];
  }): Promise<Match> {
    const now = new Date().toISOString();
    const match: Match = {
      id: randomUUID(),
      clerkId: input.clerkId,
      name: input.name,
      dates: input.dates,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameIds: input.gameIds,
      status: "PLANNING",
      createdAt: now,
      updatedAt: now,
    };
    await this.col.insertOne(match, this.opts);
    return match;
  }

  /** Matches administered by or inviting caller, newest first. */
  async listAccessible(userId: string, invitedMatchIds: string[]): Promise<Match[]> {
    const rows = await this.col
      .find(
        { $or: [{ clerkId: userId }, { id: { $in: invitedMatchIds } }] },
        { projection: { _id: 0 }, ...this.opts },
      )
      .sort({ createdAt: -1 })
      .toArray();
    return rows.map((match) => this.normalize(match));
  }

  async findById(id: string): Promise<Match | null> {
    const match = await this.col.findOne({ id }, { projection: { _id: 0 }, ...this.opts });
    return match ? this.normalize(match) : null;
  }

  /** Forces concurrent invitation-changing transactions for one match to serialize. */
  async serializeInvitationChange(id: string) {
    return this.col.updateOne({ id }, { $inc: { invitationRevision: 1 } }, this.opts);
  }

  async updatePlanning(
    id: string,
    clerkId: string,
    updates: Partial<Pick<Match, "name" | "dates" | "minPlayers" | "maxPlayers" | "gameIds">>,
  ): Promise<Match | null> {
    const match = await this.col.findOneAndUpdate(
      { id, clerkId, status: "PLANNING" },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
      { returnDocument: "after", projection: { _id: 0 }, ...this.opts },
    );
    return match ? this.normalize(match) : null;
  }

  deleteById(id: string, clerkId: string) {
    return this.col.deleteOne({ id, clerkId }, this.opts);
  }

  async setStatus(id: string, status: MatchStatus) {
    return this.col.updateOne(
      { id },
      { $set: { status, updatedAt: new Date().toISOString() } },
      this.opts,
    );
  }
}
