import type { Match, MatchChoice, MatchInvitation } from "@board-game-organizer/schemas";
import { MongoServerError } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchError,
  MatchService,
  pickSharedOption,
  summarizeMatchVotes,
} from "@/app/lib/match.service";

const match: Match = {
  id: "69409f64-7414-4e47-815c-36b01c1bff95",
  clerkId: "user_admin",
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 3,
  gameIds: [1],
  status: "PLANNING",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};
const invitation: MatchInvitation = {
  id: "5f2c704d-52c8-496a-b7a6-ec1abacee010",
  matchId: match.id,
  inviterUserId: "user_admin",
  inviteeUserId: "user_guest",
  status: "PENDING",
  createdAt: match.createdAt,
  updatedAt: match.updatedAt,
};
const input = {
  name: match.name,
  dates: match.dates,
  minPlayers: match.minPlayers,
  maxPlayers: match.maxPlayers,
  invitedUserIds: ["user_guest"],
  gameIds: match.gameIds,
};

function setup(withNotifications = false) {
  const matches = {
    create: vi.fn(async () => match),
    listAccessible: vi.fn(async () => [match]),
    findById: vi.fn(async () => match as Match | null),
    serializeInvitationChange: vi.fn(async () => ({ modifiedCount: 1, matchedCount: 1 })),
    setStatus: vi.fn(
      async (
        _id: string,
        _admin: string,
        _previous: string,
        status: "CREATED" | "PLANNING",
        selected?: { date: string; gameId: number },
      ) =>
        ({
          ...match,
          status,
          ...(selected ? { selectedDate: selected.date, selectedGameId: selected.gameId } : {}),
        }) as Match | null,
    ),
    setChoice: vi.fn(async () => ({ matchedCount: 1 })),
    clearChoices: vi.fn(async () => ({ modifiedCount: 1 })),
    clearRemovedOptionChoices: vi.fn(async () => ({ modifiedCount: 1 })),
    updatePlanning: vi.fn(async () => ({ ...match, maxPlayers: 4 }) as Match | null),
    deleteById: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const invitations = {
    create: vi.fn(async () => invitation),
    createMany: vi.fn(async () => [invitation]),
    findById: vi.fn(async () => invitation as MatchInvitation | null),
    findByMatchAndInvitee: vi.fn(async () => null as MatchInvitation | null),
    listByMatch: vi.fn(async () => [invitation]),
    listByMatchIds: vi.fn(async () => [invitation]),
    listByInvitee: vi.fn(async () => [invitation]),
    countByMatch: vi.fn(async () => 0),
    respond: vi.fn(
      async (): Promise<MatchInvitation | null> => ({ ...invitation, status: "ACCEPTED" }),
    ),
    deleteAccepted: vi.fn(async () => ({ deletedCount: 1 })),
    deleteByIdForMatch: vi.fn(async () => ({ deletedCount: 1 })),
    deleteAllByMatch: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const users = {
    findById: vi.fn(async () => ({ clerkId: "user" })),
    findByIds: vi.fn(async () => [
      {
        clerkId: "user_admin",
        name: "Admin Player",
        email: "admin@example.com",
        avatarUrl: "https://example.com/admin.png",
      },
      {
        clerkId: "user_guest",
        name: "Guest Player",
        email: "guest@example.com",
        avatarUrl: "https://example.com/user.png",
      },
    ]),
  };
  const relationships = {
    isBlocked: vi.fn(async () => false),
    isFriend: vi.fn(async () => true),
  };
  const games = {
    findExistingIds: vi.fn(async () => [1]),
    findByIds: vi.fn(async () => [
      { id: 1, name: "Azul", yearPublished: 2017, thumbnail: "https://example.com/azul.png" },
    ]),
  };
  const notifications = {
    notify: vi.fn(async () => undefined),
    notifyMany: vi.fn(async () => undefined),
  };
  const service = new MatchService(
    matches as never,
    invitations as never,
    users as never,
    relationships as never,
    games as never,
    withNotifications ? (notifications as never) : undefined,
  );
  return { service, matches, invitations, users, relationships, games, notifications };
}

async function expectMatchError(promise: Promise<unknown>, status: number, message: string) {
  await expect(promise).rejects.toEqual(expect.objectContaining({ status, message }));
}

describe("shared match choices", () => {
  it("requires every participant to accept an option and ranks YES, admin YES, then admin option order", () => {
    const dates = [
      "2026-10-01T20:00:00.000Z",
      "2026-10-02T20:00:00.000Z",
      "2026-10-03T20:00:00.000Z",
    ];
    const [a, b, c] = dates.map((date) => String(Date.parse(date)));
    const guestDates: Record<string, MatchChoice> = {
      [a]: "YES",
      [b]: "IF_NEEDED",
      [c]: "IF_NEEDED",
    };
    const votes: Match["choices"] = {
      user_admin: { dates: { [a]: "IF_NEEDED", [b]: "YES", [c]: "YES" } },
      user_guest: { dates: guestDates },
    };
    const participants = ["user_admin", "user_guest"];
    expect(pickSharedOption(dates, "dates", votes, participants, "user_admin")).toBe(dates[1]);
    guestDates[b] = "YES";
    expect(pickSharedOption(dates, "dates", votes, participants, "user_admin")).toBe(dates[1]);
    guestDates[b] = "NO";
    guestDates[c] = "UNKNOWN";
    expect(pickSharedOption(dates, "dates", votes, participants, "user_admin")).toBe(dates[0]);
    guestDates[a] = "UNKNOWN";
    expect(pickSharedOption(dates, "dates", votes, participants, "user_admin")).toBeUndefined();
    expect(
      pickSharedOption(
        [2, 1],
        "games",
        {
          user_admin: { games: { "1": "YES", "2": "YES" } },
          user_guest: { games: { "1": "YES", "2": "YES" } },
        },
        participants,
        "user_admin",
      ),
    ).toBe(2);
  });
});

describe("MatchService", () => {
  it("counts eligible votes per option without exposing pending invitees or identities", () => {
    const key = String(Date.parse(match.dates[0]));
    const summary = summarizeMatchVotes(
      {
        ...match,
        choices: {
          user_admin: { dates: { [key]: "YES" }, games: { "1": "YES" } },
          user_guest: { dates: { [key]: "NO" }, games: { "1": "IF_NEEDED" } },
          user_pending: { dates: { [key]: "YES" }, games: { "1": "YES" } },
        },
      },
      [
        { ...invitation, status: "ACCEPTED" },
        { ...invitation, inviteeUserId: "user_pending" },
      ],
    );
    expect(summary).toEqual({
      dates: { [key]: { yes: 1, no: 1, ifNeeded: 0, notChosen: 0 } },
      games: { "1": { yes: 1, no: 0, ifNeeded: 1, notChosen: 0 } },
      reasons: ["NO_SHARED_DATE"],
      selectedGameId: 1,
    });
    expect(summarizeMatchVotes(match, [invitation])).toMatchObject({
      dates: { [key]: { notChosen: 1 } },
      reasons: ["NOT_ENOUGH_PLAYERS", "NO_SHARED_DATE", "NO_SHARED_GAME"],
    });
  });
  it("confirms only with enough accepted participants and shared votes, then reopens and notifies only accepted invitees", async () => {
    const { service, matches, invitations, notifications } = setup(true);
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    const pending = { ...invitation, id: "pending", inviteeUserId: "user_pending" };
    invitations.listByMatch.mockResolvedValue([accepted, pending]);
    await expectMatchError(
      service.setStatus("user_guest", match.id, "CREATED"),
      403,
      "Only match admin can manage match",
    );
    await expectMatchError(
      service.setStatus("user_admin", match.id, "CREATED"),
      409,
      "No shared date and game choices",
    );
    expect(matches.setStatus).not.toHaveBeenCalled();
    expect(notifications.notifyMany).not.toHaveBeenCalled();
    const key = String(Date.parse(match.dates[0]));
    matches.findById.mockResolvedValue({
      ...match,
      choices: {
        user_admin: { dates: { [key]: "YES" }, games: { "1": "IF_NEEDED" } },
        user_guest: { dates: { [key]: "IF_NEEDED" }, games: { "1": "YES" } },
        user_pending: { dates: { [key]: "NO" }, games: { "1": "NO" } },
      },
    });
    const created = await service.setStatus("user_admin", match.id, "CREATED");
    expect(created).toMatchObject({
      status: "CREATED",
      selectedDate: match.dates[0],
      selectedGameId: 1,
    });
    expect(created.invitations).toHaveLength(1);
    expect(matches.setStatus).toHaveBeenCalledWith(match.id, "user_admin", "PLANNING", "CREATED", {
      date: match.dates[0],
      gameId: 1,
    });
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      {
        kind: "match_created",
        recipientUserId: "user_guest",
        actorUserId: "user_admin",
        matchName: match.name,
      },
    ]);
    matches.findById.mockResolvedValue({
      ...match,
      status: "CREATED",
      selectedDate: match.dates[0],
      selectedGameId: 1,
    });
    await expectMatchError(
      service.setChoice("user_admin", match.id, { kind: "games", itemId: 1, choice: "YES" }),
      409,
      "Match is no longer in planning",
    );
    const replanned = await service.setStatus("user_admin", match.id, "PLANNING");
    expect(replanned.status).toBe("PLANNING");
    expect(matches.setStatus).toHaveBeenCalledWith(
      match.id,
      "user_admin",
      "CREATED",
      "PLANNING",
      undefined,
    );
    expect(notifications.notifyMany).toHaveBeenLastCalledWith([
      {
        kind: "match_replanning",
        recipientUserId: "user_guest",
        actorUserId: "user_admin",
        matchName: match.name,
      },
    ]);
  });

  it("hides unaccepted invitees while created and restores access in planning", async () => {
    const { service, matches, invitations } = setup();
    matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    matches.listAccessible.mockResolvedValue([{ ...match, status: "CREATED" }]);
    expect(await service.list("user_guest")).toEqual([]);
    await expectMatchError(service.detail("user_guest", match.id), 404, "Match not found");
    const adminView = await service.detail("user_admin", match.id);
    expect(await service.listInvitations("user_admin", match.id)).toEqual([]);
    expect(adminView.match.invitations).toEqual([]);
    expect(adminView.invitedPlayers).toEqual([]);
    matches.findById.mockResolvedValue(match);
    matches.listAccessible.mockResolvedValue([match]);
    expect(await service.list("user_guest")).toHaveLength(1);
    expect((await service.detail("user_guest", match.id)).match.invitations).toHaveLength(1);
    invitations.listByMatch.mockResolvedValue([{ ...invitation, status: "ACCEPTED" }]);
    matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    expect((await service.detail("user_guest", match.id)).match.invitations).toHaveLength(1);
  });

  it("rejects missing, redundant, and concurrently changed status transitions", async () => {
    const missing = setup();
    missing.matches.serializeInvitationChange.mockResolvedValue({
      modifiedCount: 0,
      matchedCount: 0,
    });
    await expectMatchError(
      missing.service.setStatus("user_admin", match.id, "CREATED"),
      404,
      "Match not found",
    );
    await expectMatchError(
      setup().service.setStatus("user_admin", match.id, "PLANNING"),
      409,
      "Match already has this status",
    );

    const changed = setup();
    const key = String(Date.parse(match.dates[0]));
    changed.invitations.listByMatch.mockResolvedValue([{ ...invitation, status: "ACCEPTED" }]);
    changed.matches.findById.mockResolvedValue({
      ...match,
      choices: {
        user_admin: { dates: { [key]: "YES" }, games: { "1": "YES" } },
        user_guest: { dates: { [key]: "YES" }, games: { "1": "YES" } },
      },
    });
    changed.matches.setStatus.mockResolvedValue(null);
    await expectMatchError(
      changed.service.setStatus("user_admin", match.id, "CREATED"),
      409,
      "Match status changed concurrently",
    );
  });

  it("rejects confirmation below minimum or when a participant has not agreed", async () => {
    const { service, matches, invitations } = setup();
    matches.findById.mockResolvedValue({ ...match, minPlayers: 3 });
    await expectMatchError(
      service.setStatus("user_admin", match.id, "CREATED"),
      409,
      "Not enough accepted players",
    );
    invitations.listByMatch.mockResolvedValue([{ ...invitation, status: "ACCEPTED" }]);
    await expectMatchError(
      service.setStatus("user_admin", match.id, "CREATED"),
      409,
      "Not enough accepted players",
    );
    expect(matches.setStatus).not.toHaveBeenCalled();
  });
  it("forgets choices for dates removed while planning", async () => {
    const { service, matches } = setup();
    matches.findById.mockResolvedValueOnce({
      ...match,
      choices: { user_admin: { dates: { [String(Date.parse(match.dates[0]))]: "YES" } } },
    });
    await service.update("user_admin", match.id, { dates: ["2026-10-02T20:00:00.000Z"] });
    expect(matches.clearRemovedOptionChoices).toHaveBeenCalledWith(
      expect.objectContaining({ id: match.id }),
      match.dates,
      [],
    );
  });

  it("retains votes for title changes and removes votes for deleted games", async () => {
    const { service, matches, games } = setup();
    matches.findById.mockResolvedValue({
      ...match,
      choices: { user_admin: { games: { "1": "YES" } } },
    });
    await service.update("user_admin", match.id, { name: "Updated match" });
    expect(matches.clearRemovedOptionChoices).not.toHaveBeenCalled();
    games.findExistingIds.mockResolvedValue([2]);
    await service.update("user_admin", match.id, { gameIds: [2] });
    expect(matches.clearRemovedOptionChoices).toHaveBeenCalledWith(
      expect.objectContaining({ id: match.id }),
      [],
      [1],
    );
  });

  it("preserves partial personal choices in detail and rejects unsafe chooser ids", async () => {
    const { service, matches, invitations } = setup();
    const key = String(Date.parse(match.dates[0]));
    matches.findById.mockResolvedValue({
      ...match,
      choices: { user_guest: { dates: { [key]: "YES" } } },
    });
    expect((await service.detail("user_guest", match.id)).choices).toEqual({
      dates: { [key]: "YES" },
      games: {},
    });
    matches.findById.mockResolvedValue({
      ...match,
      choices: { user_guest: { games: { "1": "YES" } } },
    });
    expect((await service.detail("user_guest", match.id)).choices).toEqual({
      dates: {},
      games: { "1": "YES" },
    });
    invitations.listByMatch.mockResolvedValue([
      { ...invitation, inviteeUserId: "user.bad", status: "ACCEPTED" },
    ]);
    await expectMatchError(
      service.setChoice("user.bad", match.id, { kind: "games", itemId: 1, choice: "YES" }),
      403,
      "Invalid user id",
    );
  });

  it("allows admin and accepted invitees to choose only existing dates and games", async () => {
    const { service, matches, invitations } = setup();
    await service.setChoice("user_admin", match.id, {
      kind: "dates",
      itemId: match.dates[0],
      choice: "YES",
    });
    expect(matches.setChoice).toHaveBeenCalledWith(match.id, "user_admin", {
      kind: "dates",
      itemId: match.dates[0],
      choice: "YES",
    });

    invitations.listByMatch.mockResolvedValue([{ ...invitation, status: "ACCEPTED" }]);
    await service.setChoice("user_guest", match.id, {
      kind: "games",
      itemId: 1,
      choice: "IF_NEEDED",
    });
    expect(matches.setChoice).toHaveBeenCalledWith(match.id, "user_guest", {
      kind: "games",
      itemId: 1,
      choice: "IF_NEEDED",
    });
    expect((await service.detail("user_guest", match.id)).choices).toEqual({
      dates: {},
      games: {},
    });

    await expectMatchError(
      service.setChoice("user_guest", match.id, { kind: "games", itemId: 2, choice: "NO" }),
      409,
      "Match option no longer exists",
    );
    matches.setChoice.mockResolvedValueOnce({ matchedCount: 0 });
    await expectMatchError(
      service.setChoice("user_admin", match.id, {
        kind: "dates",
        itemId: match.dates[0],
        choice: "NO",
      }),
      409,
      "Match option no longer exists",
    );
    invitations.listByMatch.mockResolvedValue([invitation]);
    await expectMatchError(
      service.setChoice("user_guest", match.id, { kind: "games", itemId: 1, choice: "YES" }),
      403,
      "Only accepted participants can choose",
    );
    await expectMatchError(
      service.setChoice("user_other", match.id, {
        kind: "dates",
        itemId: match.dates[0],
        choice: "YES",
      }),
      403,
      "Only accepted participants can choose",
    );
  });
  beforeEach(() => vi.restoreAllMocks());

  it("requires a synchronized current user", async () => {
    const { service, users } = setup();
    await expect(service.requireCurrentUser("user_admin")).resolves.toBeUndefined();
    users.findById.mockResolvedValueOnce(null as never);
    await expectMatchError(
      service.requireCurrentUser("user_missing"),
      409,
      "User profile not synchronized",
    );
  });

  it("creates a match and invitations", async () => {
    const { service, matches, invitations } = setup();
    const result = await service.create("user_admin", input);
    expect(matches.create).toHaveBeenCalledWith({
      clerkId: "user_admin",
      name: input.name,
      dates: input.dates,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameIds: input.gameIds,
    });
    expect(invitations.createMany).toHaveBeenCalledWith(match.id, "user_admin", ["user_guest"]);
    expect(result).toEqual({
      id: match.id,
      adminUserId: "user_admin",
      name: match.name,
      dates: match.dates,
      minPlayers: 2,
      maxPlayers: 3,
      invitedUserIds: ["user_guest"],
      gameIds: [1],
      status: "PLANNING",
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      invitations: [invitation],
    });
  });

  it("rejects initial invitations beyond maxPlayers minus admin", async () => {
    const { service, games } = setup();
    await expectMatchError(
      service.create("user_admin", {
        ...input,
        maxPlayers: 2,
        invitedUserIds: ["user_guest", "user_other"],
      }),
      400,
      "Invitations exceed available player positions",
    );
    expect(games.findExistingIds).not.toHaveBeenCalled();
  });

  it("rejects unknown games before writing", async () => {
    const { service, games, matches } = setup();
    games.findExistingIds.mockResolvedValue([]);
    await expectMatchError(
      service.create("user_admin", input),
      400,
      "One or more games do not exist",
    );
    expect(matches.create).not.toHaveBeenCalled();
  });

  it("rejects self, missing, blocked, and non-friend invitees", async () => {
    const self = setup();
    await expectMatchError(
      self.service.create("user_admin", { ...input, invitedUserIds: ["user_admin"] }),
      400,
      "Match admin cannot invite themselves",
    );

    const missing = setup();
    missing.users.findById.mockResolvedValue(null as never);
    await expectMatchError(missing.service.create("user_admin", input), 404, "User not found");

    const blocked = setup();
    blocked.relationships.isBlocked.mockResolvedValue(true);
    await expectMatchError(blocked.service.create("user_admin", input), 404, "User not found");

    const stranger = setup();
    stranger.relationships.isFriend.mockResolvedValue(false);
    await expectMatchError(
      stranger.service.create("user_admin", input),
      400,
      "Invited users must be friends of match admin",
    );
  });

  it("lists accessible matches and groups invitations", async () => {
    const { service, matches, invitations } = setup();
    const second = { ...match, id: "8923a18c-1b90-4ee4-96fb-88a3d9226b37" };
    invitations.listByInvitee.mockResolvedValue([
      invitation,
      { ...invitation, id: "declined", matchId: second.id, status: "DECLINED" },
    ]);
    const accepted = {
      ...invitation,
      id: "accepted",
      inviteeUserId: "user_accepted",
      status: "ACCEPTED" as const,
    };
    matches.listAccessible.mockResolvedValue([match, second]);
    invitations.listByMatchIds.mockResolvedValue([
      invitation,
      accepted,
      { ...invitation, id: "other-pending", inviteeUserId: "user_pending" },
      {
        ...invitation,
        id: "other-declined",
        inviteeUserId: "user_declined",
        status: "DECLINED" as const,
      },
    ]);
    const result = await service.list("user_guest");
    expect(matches.listAccessible).toHaveBeenCalledWith("user_guest", [match.id]);
    expect(invitations.listByMatchIds).toHaveBeenCalledWith([match.id, second.id]);
    expect(result[0].invitations).toEqual([invitation, accepted]);
    expect(result[1].invitations).toEqual([]);
  });

  it("shows aggregate votes only to admin and accepted invitees", async () => {
    const { service, matches, invitations } = setup();
    const key = String(Date.parse(match.dates[0]));
    matches.findById.mockResolvedValue({
      ...match,
      choices: { user_admin: { dates: { [key]: "YES" }, games: { "1": "YES" } } },
    });
    expect((await service.detail("user_admin", match.id)).voteSummary?.dates[key]).toEqual({
      yes: 1,
      no: 0,
      ifNeeded: 0,
      notChosen: 0,
    });
    expect((await service.detail("user_guest", match.id)).voteSummary).toBeUndefined();
    invitations.listByMatch.mockResolvedValue([{ ...invitation, status: "ACCEPTED" }]);
    expect((await service.detail("user_guest", match.id)).voteSummary?.dates[key]).toEqual({
      yes: 1,
      no: 0,
      ifNeeded: 0,
      notChosen: 1,
    });
    expect((await service.detail("user_guest", match.id)).choices).toEqual({
      dates: {},
      games: {},
    });
  });

  it("returns enriched detail to admin and invitee but hides it from others", async () => {
    const expected = {
      match: { id: match.id },
      administrator: {
        id: "user_admin",
        name: "Admin Player",
        email: "admin@example.com",
        avatarUrl: "https://example.com/admin.png",
      },
      invitedPlayers: [
        {
          id: "user_guest",
          name: "Guest Player",
          email: "guest@example.com",
          avatarUrl: "https://example.com/user.png",
          invitation,
        },
      ],
      games: [
        {
          id: 1,
          name: "Azul",
          yearPublished: 2017,
          thumbnail: "https://example.com/azul.png",
        },
      ],
    };

    await expect(setup().service.detail("user_admin", match.id)).resolves.toMatchObject(expected);
    await expect(setup().service.detail("user_guest", match.id)).resolves.toMatchObject({
      match: { id: match.id, invitations: [invitation] },
      invitedPlayers: [],
      games: expected.games,
    });
    await expectMatchError(setup().service.detail("user_other", match.id), 404, "Match not found");
  });

  it("shows non-admins only accepted players and their own invitation", async () => {
    const { service, invitations, users } = setup();
    const accepted = {
      ...invitation,
      id: "accepted",
      inviteeUserId: "user_accepted",
      status: "ACCEPTED" as const,
    };
    invitations.listByMatch.mockResolvedValue([
      invitation,
      accepted,
      { ...invitation, id: "other-pending", inviteeUserId: "user_pending" },
      {
        ...invitation,
        id: "other-declined",
        inviteeUserId: "user_declined",
        status: "DECLINED" as const,
      },
    ]);
    users.findByIds.mockResolvedValue([
      {
        clerkId: "user_admin",
        name: "Admin Player",
        email: "admin@example.com",
        avatarUrl: "https://example.com/admin.png",
      },
      {
        clerkId: "user_accepted",
        name: "Accepted Player",
        email: "accepted@example.com",
        avatarUrl: "https://example.com/accepted.png",
      },
    ]);

    const result = await service.detail("user_guest", match.id);

    expect(result.match.invitations).toEqual([invitation, accepted]);
    expect(result.administrator).toEqual({
      id: "user_admin",
      name: "Admin Player",
      email: "admin@example.com",
      avatarUrl: "https://example.com/admin.png",
    });
    expect(result.invitedPlayers).toEqual([
      {
        id: "user_accepted",
        name: "Accepted Player",
        email: "accepted@example.com",
        avatarUrl: "https://example.com/accepted.png",
        invitation: accepted,
      },
    ]);
    expect(users.findByIds).toHaveBeenCalledWith(["user_admin", "user_accepted"]);
  });

  it("keeps detail readable when mirrored users or catalog rows are missing", async () => {
    const { service, users, games } = setup();
    users.findByIds.mockResolvedValue([]);
    games.findByIds.mockResolvedValue([]);

    await expect(service.detail("user_admin", match.id)).resolves.toMatchObject({
      administrator: {
        id: "user_admin",
        name: "user_admin",
        email: null,
        avatarUrl: null,
      },
      invitedPlayers: [{ id: "user_guest", name: "user_guest", email: null, avatarUrl: null }],
      games: [],
    });
  });

  it("normalizes optional catalog fields in detail", async () => {
    const { service, games } = setup();
    games.findByIds.mockResolvedValue([{ id: 1, name: "Azul" }] as never);

    await expect(service.detail("user_admin", match.id)).resolves.toMatchObject({
      games: [{ id: 1, name: "Azul", yearPublished: null, thumbnail: null }],
    });
  });

  it("returns 404 when match does not exist", async () => {
    const { service, matches } = setup();
    matches.findById.mockResolvedValue(null);
    await expectMatchError(service.detail("user_admin", match.id), 404, "Match not found");
  });

  it("lists invitations only for admin", async () => {
    await expect(setup().service.listInvitations("user_admin", match.id)).resolves.toEqual([
      invitation,
    ]);
    await expectMatchError(
      setup().service.listInvitations("user_guest", match.id),
      403,
      "Only match admin can manage match",
    );
  });

  it("creates a later invitation when one position remains", async () => {
    const { service, matches, invitations } = setup();
    await expect(service.invite("user_admin", match.id, "user_guest")).resolves.toEqual(invitation);
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.countByMatch).toHaveBeenCalledWith(match.id);
    expect(invitations.create).toHaveBeenCalledWith(match.id, "user_admin", "user_guest");
  });

  it("only admin can invite while planning", async () => {
    await expectMatchError(
      setup().service.invite("user_guest", match.id, "user_other"),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.invite("user_admin", match.id, "user_guest"),
      409,
      "Match is no longer in planning",
    );
  });

  it("rejects every duplicate invitation status", async () => {
    for (const status of ["PENDING", "ACCEPTED", "DECLINED"] as const) {
      const duplicate = setup();
      duplicate.invitations.findByMatchAndInvitee.mockResolvedValue({ ...invitation, status });
      await expectMatchError(
        duplicate.service.invite("user_admin", match.id, "user_guest"),
        409,
        "User is already invited",
      );
    }
  });

  it("requires maxPlayers increase before another invitation", async () => {
    const full = setup();
    full.invitations.countByMatch.mockResolvedValue(match.maxPlayers - 1);
    await expectMatchError(
      full.service.invite("user_admin", match.id, "user_guest"),
      409,
      "Match has no available invitation positions",
    );
    expect(full.invitations.create).not.toHaveBeenCalled();
  });

  it("maps duplicate inserts but rethrows other database errors", async () => {
    const duplicate = setup();
    duplicate.invitations.create.mockRejectedValue(
      new MongoServerError({ message: "duplicate", code: 11000 }),
    );
    await expectMatchError(
      duplicate.service.invite("user_admin", match.id, "user_guest"),
      409,
      "User is already invited",
    );
    const failure = setup();
    failure.invitations.create.mockRejectedValue(new Error("db down"));
    await expect(failure.service.invite("user_admin", match.id, "user_guest")).rejects.toThrow(
      "db down",
    );
  });

  it("hides missing or foreign invitations", async () => {
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.respond("user_guest", invitation.id, "accept"),
      404,
      "Invitation not found",
    );
    const foreign = setup();
    await expectMatchError(
      foreign.service.respond("user_other", invitation.id, "accept"),
      404,
      "Invitation not found",
    );
  });

  it("accepts and declines pending invitations", async () => {
    const accepted = setup();
    await accepted.service.respond("user_guest", invitation.id, "accept");
    expect(accepted.invitations.respond).toHaveBeenCalledWith(invitation.id, "ACCEPTED");

    const declined = setup();
    await declined.service.respond("user_guest", invitation.id, "decline");
    expect(declined.invitations.respond).toHaveBeenCalledWith(invitation.id, "DECLINED");
  });

  it("rejects responses outside pending planning", async () => {
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.respond("user_guest", invitation.id, "accept"),
      409,
      "Match is no longer in planning",
    );
    const answered = setup();
    answered.invitations.findById.mockResolvedValue({ ...invitation, status: "DECLINED" });
    await expectMatchError(
      answered.service.respond("user_guest", invitation.id, "accept"),
      409,
      "Invitation already answered",
    );
  });

  it("detects a concurrent response", async () => {
    const { service, invitations } = setup();
    invitations.respond.mockResolvedValue(null);
    await expectMatchError(
      service.respond("user_guest", invitation.id, "decline"),
      409,
      "Invitation changed concurrently",
    );
  });

  it("lets accepted invitee leave while planning", async () => {
    const { service, invitations } = setup();
    invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    await expect(service.leave("user_guest", invitation.id)).resolves.toBeUndefined();
    expect(invitations.deleteAccepted).toHaveBeenCalledWith(invitation.id, "user_guest");
  });

  it("rejects missing, foreign, pending, finalized, and concurrent leave", async () => {
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.leave("user_guest", invitation.id),
      404,
      "Invitation not found",
    );
    await expectMatchError(
      setup().service.leave("user_other", invitation.id),
      404,
      "Invitation not found",
    );
    await expectMatchError(
      setup().service.leave("user_guest", invitation.id),
      409,
      "Only accepted participants can leave",
    );
    const created = setup();
    created.invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.leave("user_guest", invitation.id),
      409,
      "Match is no longer in planning",
    );
    const changed = setup();
    changed.invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    changed.invitations.deleteAccepted.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.leave("user_guest", invitation.id),
      409,
      "Invitation changed concurrently",
    );
  });

  it("admin removes pending, declined, or accepted invitations", async () => {
    for (const status of ["PENDING", "DECLINED", "ACCEPTED"] as const) {
      const current = setup();
      current.invitations.findById.mockResolvedValue({ ...invitation, status });
      await expect(
        current.service.removeInvitation("user_admin", match.id, invitation.id),
      ).resolves.toBeUndefined();
      expect(current.matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
      expect(current.invitations.deleteByIdForMatch).toHaveBeenCalledWith(invitation.id, match.id);
    }
  });

  it("rejects non-admin, finalized, missing, foreign, and concurrent invitation removal", async () => {
    await expectMatchError(
      setup().service.removeInvitation("user_guest", match.id, invitation.id),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.removeInvitation("user_admin", match.id, invitation.id),
      409,
      "Match is no longer in planning",
    );
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.removeInvitation("user_admin", match.id, invitation.id),
      404,
      "Invitation not found",
    );
    const foreign = setup();
    foreign.invitations.findById.mockResolvedValue({ ...invitation, matchId: "other-match" });
    await expectMatchError(
      foreign.service.removeInvitation("user_admin", match.id, invitation.id),
      404,
      "Invitation not found",
    );
    const changed = setup();
    changed.invitations.deleteByIdForMatch.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.removeInvitation("user_admin", match.id, invitation.id),
      409,
      "Invitation changed concurrently",
    );
  });

  it("atomically reconciles retained, removed, declined, and new invitations on update", async () => {
    const { service, matches, invitations, notifications } = setup(true);
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    const removed = {
      ...invitation,
      id: "removed",
      inviteeUserId: "user_removed",
    };
    const declined = {
      ...invitation,
      id: "declined",
      inviteeUserId: "user_reinvited",
      status: "DECLINED" as const,
    };
    const reinvited = {
      ...invitation,
      id: "reinvited",
      inviteeUserId: "user_reinvited",
    };
    const added = { ...invitation, id: "added", inviteeUserId: "user_new" };
    invitations.listByMatch
      .mockResolvedValueOnce([accepted, removed, declined])
      .mockResolvedValueOnce([accepted, reinvited, added]);
    invitations.createMany.mockResolvedValue([reinvited, added]);
    const changes = {
      name: "Updated match",
      dates: ["2026-11-01T20:00:00.000Z"],
      minPlayers: 2,
      maxPlayers: 4,
      invitedUserIds: ["user_guest", "user_reinvited", "user_new"],
      gameIds: [1],
    };
    matches.updatePlanning.mockResolvedValue({ ...match, ...changes });

    await expect(service.update("user_admin", match.id, changes)).resolves.toMatchObject({
      name: changes.name,
      invitedUserIds: changes.invitedUserIds,
    });

    expect(invitations.deleteByIdForMatch).toHaveBeenNthCalledWith(1, removed.id, match.id);
    expect(invitations.deleteByIdForMatch).toHaveBeenNthCalledWith(2, declined.id, match.id);
    expect(invitations.createMany).toHaveBeenCalledWith(match.id, "user_admin", [
      "user_reinvited",
      "user_new",
    ]);
    expect(matches.updatePlanning).toHaveBeenCalledWith(match.id, "user_admin", {
      name: changes.name,
      dates: changes.dates,
      minPlayers: changes.minPlayers,
      maxPlayers: changes.maxPlayers,
      gameIds: changes.gameIds,
    });
    expect(notifications.notifyMany).toHaveBeenNthCalledWith(1, [
      {
        kind: "match_invitation",
        recipientUserId: "user_reinvited",
        actorUserId: "user_admin",
        matchName: changes.name,
      },
      {
        kind: "match_invitation",
        recipientUserId: "user_new",
        actorUserId: "user_admin",
        matchName: changes.name,
      },
    ]);
    expect(notifications.notifyMany).toHaveBeenNthCalledWith(2, [
      {
        kind: "match_updated",
        recipientUserId: "user_guest",
        actorUserId: "user_admin",
        matchName: changes.name,
      },
    ]);
  });

  it("validates every final invitee before writing an update", async () => {
    const { service, matches, invitations, relationships } = setup();
    relationships.isFriend.mockResolvedValue(false);

    await expectMatchError(
      service.update("user_admin", match.id, {
        invitedUserIds: ["user_not_friend"],
      }),
      400,
      "Invited users must be friends of match admin",
    );

    expect(matches.updatePlanning).not.toHaveBeenCalled();
    expect(invitations.deleteByIdForMatch).not.toHaveBeenCalled();
    expect(invitations.createMany).not.toHaveBeenCalled();
  });

  it("admin updates every match field while planning", async () => {
    const { service, matches, invitations, games } = setup();
    const changes = {
      name: "Updated match",
      dates: ["2026-11-01T20:00:00.000Z", "2026-11-02T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 4,
      gameIds: [1, 2],
    };
    games.findExistingIds.mockResolvedValue([1, 2]);
    matches.updatePlanning.mockResolvedValue({ ...match, ...changes });
    await expect(service.update("user_admin", match.id, changes)).resolves.toMatchObject({
      id: match.id,
      ...changes,
      invitations: [invitation],
    });
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.countByMatch).not.toHaveBeenCalled();
    expect(matches.updatePlanning).toHaveBeenCalledWith(match.id, "user_admin", changes);
    expect(invitations.listByMatch).toHaveBeenCalledWith(match.id);
  });

  it("updates title, dates, minPlayers, or games without checking occupied positions", async () => {
    for (const changes of [
      { name: "Updated match" },
      { dates: ["2026-11-01T20:00:00.000Z"] },
      { minPlayers: 2 },
      { gameIds: [1] },
    ]) {
      const current = setup();
      await current.service.update("user_admin", match.id, changes);
      expect(current.invitations.countByMatch).not.toHaveBeenCalled();
    }
  });

  it("rejects non-admin and finalized match updates", async () => {
    await expectMatchError(
      setup().service.update("user_guest", match.id, { name: "Updated match" }),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.update("user_admin", match.id, { name: "Updated match" }),
      409,
      "Match is no longer in planning",
    );
  });

  it("rejects player ranges invalid against current match values", async () => {
    await expectMatchError(
      setup().service.update("user_admin", match.id, { minPlayers: match.maxPlayers + 1 }),
      400,
      "maxPlayers must be greater than or equal to minPlayers",
    );
    await expectMatchError(
      setup().service.update("user_admin", match.id, { maxPlayers: match.minPlayers - 1 }),
      400,
      "maxPlayers must be greater than or equal to minPlayers",
    );
  });

  it("rejects unknown games and maxPlayers below occupied positions", async () => {
    const unknownGame = setup();
    unknownGame.games.findExistingIds.mockResolvedValue([]);
    await expectMatchError(
      unknownGame.service.update("user_admin", match.id, { gameIds: [2] }),
      400,
      "One or more games do not exist",
    );

    const occupied = setup();
    occupied.invitations.listByMatch.mockResolvedValue([
      invitation,
      { ...invitation, id: "second", inviteeUserId: "user_second" },
    ]);
    await expectMatchError(
      occupied.service.update("user_admin", match.id, { maxPlayers: 2 }),
      409,
      "maxPlayers cannot be lower than occupied player positions",
    );

    await expectMatchError(
      setup().service.update("user_admin", match.id, {
        maxPlayers: 2,
        invitedUserIds: ["user_guest", "user_other"],
      }),
      400,
      "Invitations exceed available player positions",
    );
  });

  it("detects a concurrent match update", async () => {
    const changed = setup();
    changed.matches.updatePlanning.mockResolvedValue(null);
    await expectMatchError(
      changed.service.update("user_admin", match.id, { name: "Updated match" }),
      409,
      "Match changed concurrently",
    );
  });

  it("admin deletes match and every invitation", async () => {
    const { service, matches, invitations } = setup();
    await expect(service.deleteMatch("user_admin", match.id)).resolves.toBeUndefined();
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.deleteAllByMatch).toHaveBeenCalledWith(match.id);
    expect(matches.deleteById).toHaveBeenCalledWith(match.id, "user_admin");
  });

  it("rejects non-admin and concurrent match deletion", async () => {
    await expectMatchError(
      setup().service.deleteMatch("user_guest", match.id),
      403,
      "Only match admin can manage match",
    );
    const changed = setup();
    changed.matches.deleteById.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.deleteMatch("user_admin", match.id),
      409,
      "Match changed concurrently",
    );
  });

  it("creates notifications for match lifecycle", async () => {
    const { service, invitations, notifications } = setup(true);

    await service.create("user_admin", input);
    await service.invite("user_admin", match.id, "user_guest");
    await service.respond("user_guest", invitation.id, "accept");
    await service.respond("user_guest", invitation.id, "decline");
    invitations.listByMatch.mockResolvedValue([
      invitation,
      { ...invitation, id: "declined", inviteeUserId: "user_declined", status: "DECLINED" },
    ]);
    await service.update("user_admin", match.id, {
      name: match.name,
      dates: match.dates,
      minPlayers: match.minPlayers,
      maxPlayers: match.maxPlayers,
      gameIds: match.gameIds,
    });

    expect(notifications.notifyMany).toHaveBeenNthCalledWith(1, [
      {
        kind: "match_invitation",
        recipientUserId: "user_guest",
        actorUserId: "user_admin",
        matchName: match.name,
      },
    ]);
    expect(notifications.notify).toHaveBeenNthCalledWith(1, {
      kind: "match_invitation",
      recipientUserId: "user_guest",
      actorUserId: "user_admin",
      matchName: match.name,
    });
    expect(notifications.notify).toHaveBeenNthCalledWith(2, {
      kind: "match_invitation_accepted",
      recipientUserId: "user_admin",
      actorUserId: "user_guest",
      matchName: match.name,
    });
    expect(notifications.notify).toHaveBeenNthCalledWith(3, {
      kind: "match_invitation_declined",
      recipientUserId: "user_admin",
      actorUserId: "user_guest",
      matchName: match.name,
    });
    expect(notifications.notifyMany).toHaveBeenNthCalledWith(2, [
      {
        kind: "match_updated",
        recipientUserId: "user_guest",
        actorUserId: "user_admin",
        matchName: match.name,
      },
    ]);
  });

  it("MatchError retains status and message", () => {
    expect(new MatchError(418, "tea")).toMatchObject({ status: 418, message: "tea" });
  });
});
