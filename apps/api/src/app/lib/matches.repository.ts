import { randomUUID } from "node:crypto";
import type { Match } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `matches` collection.
 *
 * A match is a scheduled game session created through the wizard: a name,
 * one or more date/time slots, a min/max player range, invited friends and
 * selected board games (BGG ids). Owned by the creator (clerkId).
 */
export class MatchesRepository {
  constructor(private db: Db) {}

  private get col() {
    return this.db.collection<Match>(COLLECTIONS.MATCHES);
  }

  async create(input: {
    clerkId: string;
    name: string;
    dates: string[];
    minPlayers: number;
    maxPlayers: number;
    invitedUserIds: string[];
    gameIds: number[];
  }): Promise<Match> {
    const match: Match = {
      id: randomUUID(),
      clerkId: input.clerkId,
      name: input.name,
      dates: input.dates,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      invitedUserIds: input.invitedUserIds,
      gameIds: input.gameIds,
      createdAt: new Date().toISOString(),
    };
    await this.col.insertOne(match);
    return match;
  }

  /** Matches owned by the caller, newest first. */
  async listByOwner(clerkId: string): Promise<Match[]> {
    return this.col
      .find({ clerkId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findById(id: string): Promise<Match | null> {
    return this.col.findOne({ id }, { projection: { _id: 0 } });
  }
}
