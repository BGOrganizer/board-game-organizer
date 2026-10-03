import { randomUUID } from "node:crypto";
import type {
  Match,
  MatchResults,
  MatchStatus,
  SetMatchChoiceInput,
} from "@board-game-organizer/schemas";
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
      locations: match.locations ?? [],
      minPlayers: match.minPlayers,
      maxPlayers: match.maxPlayers,
      gameIds: match.gameIds,
      ...(match.groupId ? { groupId: match.groupId } : {}),
      ...(match.choices ? { choices: match.choices } : {}),
      status: match.status ?? "PLANNING",
      ...(match.selectedDate ? { selectedDate: match.selectedDate } : {}),
      ...(match.selectedLocationId ? { selectedLocationId: match.selectedLocationId } : {}),
      ...(match.selectedGameId ? { selectedGameId: match.selectedGameId } : {}),
      ...(match.results ? { results: match.results } : {}),
      createdAt: match.createdAt,
      updatedAt: match.updatedAt ?? match.createdAt,
    };
  }

  async create(input: {
    clerkId: string;
    name: string;
    dates: string[];
    locations: NonNullable<Match["locations"]>;
    minPlayers: number;
    maxPlayers: number;
    gameIds: number[];
    groupId?: string;
  }): Promise<Match> {
    const now = new Date().toISOString();
    const match: Match = {
      id: randomUUID(),
      clerkId: input.clerkId,
      name: input.name,
      dates: input.dates,
      locations: input.locations,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameIds: input.gameIds,
      ...(input.groupId ? { groupId: input.groupId } : {}),
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

  countPlayedByUser(userId: string): Promise<number> {
    return this.col.countDocuments(
      {
        status: "TERMINATED",
        "results.entries": { $elemMatch: { userId, score: { $type: "string" } } },
      },
      this.opts,
    );
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
    updates: Partial<
      Pick<Match, "name" | "dates" | "locations" | "minPlayers" | "maxPlayers" | "gameIds">
    > & {
      groupId?: string | null;
    },
  ): Promise<Match | null> {
    const { groupId, ...fields } = updates;
    const match = await this.col.findOneAndUpdate(
      { id, clerkId, status: "PLANNING" },
      {
        $set: { ...fields, ...(groupId ? { groupId } : {}), updatedAt: new Date().toISOString() },
        ...(groupId === null ? { $unset: { groupId: "" } } : {}),
      },
      { returnDocument: "after", projection: { _id: 0 }, ...this.opts },
    );
    return match ? this.normalize(match) : null;
  }

  setChoice(id: string, userId: string, input: SetMatchChoiceInput) {
    const key = input.kind === "dates" ? String(Date.parse(input.itemId)) : String(input.itemId);
    return this.col.updateOne(
      {
        id,
        $or: [{ status: "PLANNING" }, { status: { $exists: false } }],
        ...(input.kind === "locations"
          ? { "locations.id": input.itemId }
          : { [input.kind === "dates" ? "dates" : "gameIds"]: input.itemId }),
      },
      { $set: { [`choices.${userId}.${input.kind}.${key}`]: input.choice } },
      this.opts,
    );
  }

  clearChoices(id: string, userId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("Invalid user id");
    return this.col.updateOne({ id }, { $unset: { [`choices.${userId}`]: "" } }, this.opts);
  }

  clearRemovedOptionChoices(
    match: Match,
    removedDates: string[],
    removedGames: number[],
    removedLocations: string[] = [],
  ) {
    const unset: Record<string, ""> = {};
    for (const userId of Object.keys(match.choices ?? {})) {
      if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("Invalid user id");
      for (const date of removedDates) unset[`choices.${userId}.dates.${Date.parse(date)}`] = "";
      for (const id of removedGames) unset[`choices.${userId}.games.${id}`] = "";
      for (const id of removedLocations) unset[`choices.${userId}.locations.${id}`] = "";
    }
    if (Object.keys(unset).length > 0) {
      return this.col.updateOne({ id: match.id }, { $unset: unset }, this.opts);
    }
  }

  deleteById(id: string, clerkId: string) {
    return this.col.deleteOne({ id, clerkId, status: { $ne: "TERMINATED" } }, this.opts);
  }

  async registerResults(id: string, clerkId: string, results: MatchResults): Promise<Match | null> {
    const updated = await this.col.findOneAndUpdate(
      { id, clerkId, status: "CREATED", results: { $exists: false } },
      { $set: { status: "TERMINATED", results, updatedAt: results.finalizedAt } },
      { returnDocument: "after", projection: { _id: 0 }, ...this.opts },
    );
    return updated ? this.normalize(updated) : null;
  }

  async setStatus(
    id: string,
    clerkId: string,
    previousStatus: MatchStatus,
    status: MatchStatus,
    selected?: { date: string; locationId?: string; gameId: number },
  ): Promise<Match | null> {
    const updated = await this.col.findOneAndUpdate(
      {
        id,
        clerkId,
        ...(previousStatus === "PLANNING"
          ? { $or: [{ status: "PLANNING" as const }, { status: { $exists: false } }] }
          : { status: previousStatus }),
      },
      selected
        ? {
            $set: {
              status,
              selectedDate: selected.date,
              ...(selected.locationId ? { selectedLocationId: selected.locationId } : {}),
              selectedGameId: selected.gameId,
              updatedAt: new Date().toISOString(),
            },
          }
        : {
            $set: { status, updatedAt: new Date().toISOString() },
            $unset: { selectedDate: "", selectedLocationId: "", selectedGameId: "" },
          },
      { returnDocument: "after", projection: { _id: 0 }, ...this.opts },
    );
    return updated ? this.normalize(updated) : null;
  }
}
