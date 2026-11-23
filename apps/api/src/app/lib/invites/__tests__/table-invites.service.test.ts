import type {
  ClaimInviteParams,
  EventRecord,
  GroupMembership,
  GroupRecord,
  Invite,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import { TableInvitesService } from "../table-invites.service";

const m = vi.hoisted(() => ({
  groups: { find: vi.fn(), lock: vi.fn(), ban: vi.fn(), membership: vi.fn() },
  events: {
    table: vi.fn(),
    find: vi.fn(),
    lock: vi.fn(),
    userRegistrations: vi.fn(),
    userRegistration: vi.fn(),
    voter: vi.fn(),
  },
  users: { findById: vi.fn() },
  relationships: { isBlocked: vi.fn(), isFriend: vi.fn(), becomeFriends: vi.fn() },
  games: { findByIds: vi.fn() },
  invites: { findByToken: vi.fn(), create: vi.fn(), claim: vi.fn() },
  groupActions: { invite: vi.fn(), membershipAction: vi.fn() },
  eventActions: { join: vi.fn(), registrationAction: vi.fn(), tableDetail: vi.fn() },
  notifications: { notify: vi.fn() },
}));
vi.mock("../../groups/group-records.repository", () => ({
  GroupRecordsRepository: class {
    constructor() {
      Object.assign(this, m.groups);
    }
  },
}));
vi.mock("../../events/event-records.repository", () => ({
  EventRecordsRepository: class {
    constructor() {
      Object.assign(this, m.events);
    }
  },
}));
vi.mock("../../users/users.repository", () => ({
  UsersRepository: class {
    constructor() {
      Object.assign(this, m.users);
    }
  },
}));
vi.mock("../../contacts/relationship.repository", () => ({
  RelationshipRepository: class {
    constructor() {
      Object.assign(this, m.relationships);
    }
  },
}));
vi.mock("../../games/boardGames.repository", () => ({
  BoardGamesRepository: class {
    constructor() {
      Object.assign(this, m.games);
    }
  },
}));
vi.mock("../invites.repository", () => ({
  InvitesRepository: class {
    constructor() {
      Object.assign(this, m.invites);
    }
  },
}));

const sender = "user_sender",
  viewer = "user_viewer",
  token = "valid-token-123456";
let group: GroupRecord, event: EventRecord, table: TableRecord, invite: Invite;
let membership: GroupMembership | null, registration: TableRegistration | null;
function service() {
  return new TableInvitesService(
    {} as never,
    {} as never,
    m.groupActions as never,
    m.eventActions as never,
    m.notifications as never,
  );
}
function participation(): NonNullable<ClaimInviteParams["participation"]> {
  return {
    version: 3,
    gameVotes: {},
    availability: { version: 3, dateVotes: {}, locationVotes: {} },
  };
}
function accepted(): TableRegistration {
  return {
    id: "registration",
    eventId: "event",
    tableId: "table",
    userId: viewer,
    kind: "SELF",
    status: "ACCEPTED",
    version: 1,
    gameVotes: {},
    priorityAt: "2026-11-01T10:00:00Z",
    sequence: 0,
    seatIndex: 0,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
  };
}
beforeEach(() => {
  for (const methods of Object.values(m))
    for (const mock of Object.values(methods)) mock.mockReset();
  group = {
    id: "group",
    adminUserId: sender,
    type: "PRIVATE",
    approved: { name: "Private group" },
  } as GroupRecord;
  event = {
    id: "event",
    groupId: "group",
    adminUserId: "user_event_author",
    name: "Private event",
    status: "PLANNING",
    version: 3,
    dates: [{ id: "date", day: "2026-12-01" }],
    locations: [{ id: "location", name: "A place" }],
    timeZone: "Europe/Rome",
    startTime: "20:00",
    planningMode: "MANUAL",
    playerPreference: "MORE_PLAYERS",
    allowBestReduction: false,
  } as EventRecord;
  table = {
    id: "table",
    eventId: "event",
    name: "Table",
    order: 0,
    games: [{ gameId: 1 }],
    minPlayers: 2,
    maxPlayers: 4,
    rankingEnabled: false,
  } as TableRecord;
  invite = {
    _id: new ObjectId(),
    token,
    inviterUserId: sender,
    tableId: table.id,
    status: "pending",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };
  membership = null;
  registration = null;
  m.groups.find.mockImplementation(async () => group);
  m.groups.lock.mockImplementation(async () => group);
  m.groups.ban.mockResolvedValue(null);
  m.groups.membership.mockImplementation(async (_id, userId) =>
    userId === viewer ? membership : { status: "ACCEPTED", role: "MODERATOR" },
  );
  m.events.find.mockImplementation(async () => event);
  m.events.lock.mockImplementation(async () => event);
  m.events.table.mockImplementation(async () => table);
  m.events.userRegistration.mockImplementation(async () => registration);
  m.events.userRegistrations.mockResolvedValue([]);
  m.events.voter.mockResolvedValue(null);
  m.users.findById.mockResolvedValue({
    name: "Sender",
    email: "private@example.test",
    username: "sender",
  });
  m.relationships.isBlocked.mockResolvedValue(false);
  m.relationships.isFriend.mockResolvedValue(false);
  m.relationships.becomeFriends.mockResolvedValue(undefined);
  m.games.findByIds.mockResolvedValue([{ id: 1, name: "Game" }]);
  m.invites.findByToken.mockImplementation(async () => invite);
  m.invites.create.mockImplementation(async () => invite);
  m.invites.claim.mockImplementation(async () => invite);
  m.groupActions.invite.mockResolvedValue({ version: 2 });
  m.groupActions.membershipAction.mockResolvedValue({ status: "ACCEPTED" });
  m.eventActions.join.mockResolvedValue({});
  m.eventActions.registrationAction.mockResolvedValue({});
  m.eventActions.tableDetail.mockResolvedValue({ myPosition: "SEATED" });
});

it("creates only a contextual link and never reserves a place", async () => {
  expect(await service().create(sender, table.id)).toBe(invite);
  expect(m.invites.create).toHaveBeenCalledWith(sender, undefined, table.id);
  expect(m.events.userRegistration).not.toHaveBeenCalled();
  expect(m.eventActions.join).not.toHaveBeenCalled();
});
it("allows a current accepted Group moderator rather than relying on Event authorship", async () => {
  group.adminUserId = "group_owner";
  await service().create(sender, table.id);
  expect(m.invites.create).toHaveBeenCalledOnce();
});
it("treats legacy omitted visibility in a PRIVATE Group as PRIVATE", async () => {
  delete event.visibility;
  expect((await service().review(viewer, token)).kind).toBe("TABLE");
});
it("returns only the token-authorized review and the authenticated recipient's own choices", async () => {
  const review = await service().review(viewer, token);
  expect(review.kind).toBe("TABLE");
  expect(review).toMatchObject({
    inviter: { id: sender, name: "Sender", username: "sender", avatarUrl: null },
    group: { id: "group", name: "Private group" },
    table: { name: "Table #1", order: 0 },
    requiresAvailability: true,
    ownAvailability: null,
    ownRegistration: null,
  });
  expect(JSON.stringify(review)).not.toContain("private@example.test");
  expect(review).not.toHaveProperty("roster");
  expect(review).not.toHaveProperty("members");
  expect(m.groups.lock).not.toHaveBeenCalled();
  expect(m.eventActions.join).not.toHaveBeenCalled();
  expect(m.invites.claim).not.toHaveBeenCalled();
  if (review.kind !== "TABLE") throw new Error("Table review required");
  expect(Object.keys(review.event).sort()).toEqual(
    [
      "allowBestReduction",
      "dates",
      "id",
      "locations",
      "name",
      "planningMode",
      "playerPreference",
      "startTime",
      "timeZone",
      "version",
    ].sort(),
  );
  expect(review.table.gamesDetail[0]).toMatchObject({ imageUrl: null, year: null, rank: null });
});
it("projects existing choices and complete catalog metadata without exposing another person's data", async () => {
  registration = accepted();
  m.events.voter.mockResolvedValue({
    userId: viewer,
    dateVotes: { date: "YES" },
    locationVotes: { location: "IF_NEEDED" },
    updatedAt: "private",
  });
  m.users.findById.mockResolvedValue({
    email: "hidden@example.test",
    username: null,
    avatarUrl: "image",
  });
  m.games.findByIds.mockResolvedValue([
    {
      id: 1,
      name: "Game",
      image: "cover",
      yearPublished: 2020,
      bayesAverage: 7,
      average: 8,
      rank: 3,
      minPlayers: 2,
      maxPlayers: 4,
      minPlayMinutes: 45,
      maxPlayMinutes: 60,
    },
  ]);
  const review = await service().review(viewer, token);
  expect(review).toMatchObject({
    inviter: { name: "", avatarUrl: "image" },
    requiresAvailability: false,
    ownAvailability: { dateVotes: { date: "YES" }, locationVotes: { location: "IF_NEEDED" } },
    ownRegistration: { id: registration.id, status: "ACCEPTED", kind: "SELF" },
  });
  if (review.kind !== "TABLE") throw new Error("Table review required");
  expect(review.table.gamesDetail[0]).toMatchObject({
    imageUrl: "cover",
    year: 2020,
    rank: 3,
    minPlayers: 2,
    maxPlayers: 4,
    minPlayMinutes: 45,
    maxPlayMinutes: 60,
  });
});
it("returns the friend discriminator without granting contextual permissions to legacy links", async () => {
  delete invite.tableId;
  expect(await service().review(viewer, token)).toMatchObject({
    kind: "FRIEND",
    inviter: { id: sender },
  });
  expect(m.events.find).not.toHaveBeenCalled();
});
it("reuses Event preferences for a new Table, but pending invitations still require their own review", async () => {
  m.events.userRegistrations.mockResolvedValue([{ ...accepted(), tableId: "another-table" }]);
  expect(await service().review(viewer, token)).toMatchObject({ requiresAvailability: false });
  registration = { ...accepted(), status: "PENDING", kind: "INVITATION" };
  expect(await service().review(viewer, token)).toMatchObject({ requiresAvailability: true });
});

it.each(["SEATED", "WAITING"])(
  "accepts the three disclosed relationships and returns canonical %s placement",
  async (position) => {
    m.eventActions.tableDetail.mockResolvedValue({ myPosition: position });
    const input = { token, consent: true as const, participation: participation() };
    const result = await service().claim(viewer, input);
    expect(m.relationships.becomeFriends).toHaveBeenCalledWith(viewer, sender);
    expect(m.groupActions.invite).toHaveBeenCalledWith(sender, group.id, viewer);
    expect(m.groupActions.membershipAction).toHaveBeenCalledWith(viewer, group.id, viewer, {
      action: "accept",
      version: 2,
    });
    expect(m.eventActions.join).toHaveBeenCalledWith(
      viewer,
      event.id,
      table.id,
      input.participation,
    );
    expect(result).toEqual({
      success: true,
      inviter: null,
      table: { groupId: group.id, eventId: event.id, tableId: table.id, position },
    });
    expect(m.invites.claim).toHaveBeenCalledWith(token, viewer, result.table);
    expect(m.notifications.notify).toHaveBeenCalledWith({
      kind: "friend_request_accepted",
      recipientUserId: sender,
      actorUserId: viewer,
    });
  },
);
it.each(["INVITATION", "REQUEST"] as const)(
  "consumes an existing pending Group %s using canonical consent",
  async (kind) => {
    membership = {
      id: "membership",
      groupId: group.id,
      userId: viewer,
      status: "PENDING",
      kind,
      version: 4,
    } as GroupMembership;
    await service().claim(viewer, { token, consent: true, participation: participation() });
    expect(m.groupActions.invite).not.toHaveBeenCalled();
    expect(m.groupActions.membershipAction).toHaveBeenCalledWith(
      kind === "REQUEST" ? sender : viewer,
      group.id,
      viewer,
      { action: kind === "REQUEST" ? "approve" : "accept", version: 4 },
    );
  },
);
it("accepts an already-pending Table invitation with its registration version", async () => {
  registration = { ...accepted(), status: "PENDING", kind: "INVITATION", version: 8 };
  const input = participation();
  await service().claim(viewer, { token, consent: true, participation: input });
  expect(m.eventActions.registrationAction).toHaveBeenCalledWith(viewer, registration.id, {
    action: "accept",
    version: 8,
    participation: input,
  });
  expect(m.eventActions.join).not.toHaveBeenCalled();
});
it("preserves accepted membership roles, friendship epochs, registration choices and positions", async () => {
  membership = { status: "ACCEPTED", role: "MODERATOR" } as GroupMembership;
  registration = accepted();
  m.relationships.isFriend.mockResolvedValue(true);
  await service().claim(viewer, { token, consent: true });
  expect(m.groupActions.invite).not.toHaveBeenCalled();
  expect(m.groupActions.membershipAction).not.toHaveBeenCalled();
  expect(m.eventActions.join).not.toHaveBeenCalled();
  expect(m.eventActions.registrationAction).not.toHaveBeenCalled();
  expect(m.notifications.notify).not.toHaveBeenCalled();
});
it("never creates a separate membership for the Group creator", async () => {
  group.adminUserId = viewer;
  await service().claim(viewer, { token, consent: true, participation: participation() });
  expect(m.groupActions.invite).not.toHaveBeenCalled();
  expect(m.groupActions.membershipAction).not.toHaveBeenCalled();
});
it("acknowledges the original recipient's committed receipt without replaying domain effects", async () => {
  invite.status = "claimed";
  invite.claimedByUserId = viewer;
  invite.tableReceipt = {
    groupId: "group",
    eventId: "event",
    tableId: "table",
    position: "WAITING",
  };
  expect(await service().claim(viewer, { token, consent: true })).toEqual({
    success: true,
    inviter: null,
    table: invite.tableReceipt,
  });
  expect(m.groups.lock).not.toHaveBeenCalled();
  expect(m.relationships.becomeFriends).not.toHaveBeenCalled();
});

it.each([
  ["missing invite", "INVITE_NOT_FOUND", () => m.invites.findByToken.mockResolvedValue(null)],
  [
    "own invite",
    "OWN_INVITE",
    () => {
      invite.inviterUserId = viewer;
    },
  ],
  [
    "consumed invite",
    "INVITE_ALREADY_CLAIMED",
    () => {
      invite.status = "claimed";
    },
  ],
  [
    "expired invite",
    "INVITE_EXPIRED",
    () => {
      invite.expiresAt = new Date(Date.now() - 1);
    },
  ],
  [
    "blocked sender",
    "BLOCKED_PARTICIPANT",
    () => m.relationships.isBlocked.mockResolvedValue(true),
  ],
  ["missing sender", "USER_NOT_FOUND", () => m.users.findById.mockResolvedValue(null)],
] as const)(
  "rejects %s without granting access or consuming the token",
  async (_name, error, change) => {
    change();
    await expect(service().review(viewer, token)).rejects.toThrow(error);
    expect(m.invites.claim).not.toHaveBeenCalled();
    expect(m.relationships.becomeFriends).not.toHaveBeenCalled();
  },
);
it.each([
  ["missing Table", "TABLE_NOT_FOUND", () => m.events.table.mockResolvedValue(null)],
  ["missing Event", "TABLE_LINK_UNAVAILABLE", () => m.events.find.mockResolvedValue(null)],
  [
    "standalone Event",
    "TABLE_LINK_UNAVAILABLE",
    () => {
      event.groupId = null;
    },
  ],
  ["missing Group", "TABLE_LINK_UNAVAILABLE", () => m.groups.find.mockResolvedValue(null)],
  [
    "unapproved Group",
    "TABLE_LINK_UNAVAILABLE",
    () => {
      delete group.approved;
    },
  ],
  [
    "public Group",
    "TABLE_LINK_UNAVAILABLE",
    () => {
      group.type = "PUBLIC";
    },
  ],
  [
    "confirmed Event",
    "EVENT_NOT_PLANNING",
    () => {
      event.status = "CONFIRMED";
    },
  ],
  [
    "terminated Event",
    "EVENT_NOT_PLANNING",
    () => {
      event.status = "TERMINATED";
    },
  ],
  ["sender exclusion", "GROUP_BANNED", () => m.groups.ban.mockResolvedValueOnce({ until: null })],
  [
    "recipient exclusion",
    "GROUP_BANNED",
    () => m.groups.ban.mockResolvedValueOnce(null).mockResolvedValueOnce({ until: null }),
  ],
  [
    "lost moderator role",
    "GROUP_ADMIN_REQUIRED",
    () => {
      group.adminUserId = "owner";
      m.groups.membership.mockResolvedValue(null);
    },
  ],
] as const)("rejects a contextual link after %s", async (_name, error, change) => {
  change();
  await expect(service().review(viewer, token)).rejects.toThrow(error);
  expect(m.invites.claim).not.toHaveBeenCalled();
});
it("rechecks a concurrent Table removal before exposing a contextual review", async () => {
  m.events.table.mockResolvedValueOnce(table).mockResolvedValueOnce(null);
  await expect(service().review(viewer, token)).rejects.toThrow("TABLE_NOT_FOUND");
});
it("rejects reciprocal blocks discovered during the contextual checks", async () => {
  m.relationships.isBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await expect(service().review(viewer, token)).rejects.toThrow("BLOCKED_PARTICIPANT");
  m.relationships.isBlocked
    .mockReset()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  await expect(service().review(viewer, token)).rejects.toThrow("BLOCKED_PARTICIPANT");
});
it("requires explicit combined consent, participation and a fresh Event version before writes", async () => {
  await expect(service().claim(viewer, { token })).rejects.toThrow("INVITE_CONSENT_REQUIRED");
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow(
    "TABLE_GAME_AVAILABILITY_REQUIRED",
  );
  await expect(
    service().claim(viewer, {
      token,
      consent: true,
      participation: { ...participation(), version: 2 },
    }),
  ).rejects.toThrow("EVENT_CHANGED");
  expect(m.relationships.becomeFriends).not.toHaveBeenCalled();
});
it("does not use the contextual writer for a legacy friend-only token", async () => {
  delete invite.tableId;
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow(
    "TABLE_INVITE_REQUIRED",
  );
});
it("does not consume a link if canonical membership, registration or placement fails", async () => {
  m.groupActions.invite.mockRejectedValueOnce(new Error("membership failed"));
  await expect(
    service().claim(viewer, { token, consent: true, participation: participation() }),
  ).rejects.toThrow("membership failed");
  expect(m.invites.claim).not.toHaveBeenCalled();
  m.eventActions.join.mockRejectedValueOnce(new Error("registration failed"));
  await expect(
    service().claim(viewer, { token, consent: true, participation: participation() }),
  ).rejects.toThrow("registration failed");
  expect(m.invites.claim).not.toHaveBeenCalled();
  m.eventActions.tableDetail.mockResolvedValue({ myPosition: null });
  await expect(
    service().claim(viewer, { token, consent: true, participation: participation() }),
  ).rejects.toThrow("REGISTRATION_CHANGED");
  expect(m.invites.claim).not.toHaveBeenCalled();
});
it("fails closed on a concurrent token claim so the enclosing transaction rolls back", async () => {
  m.invites.claim.mockResolvedValue(null);
  await expect(
    service().claim(viewer, { token, consent: true, participation: participation() }),
  ).rejects.toThrow("INVITE_ALREADY_CLAIMED");
  expect(m.notifications.notify).not.toHaveBeenCalled();
});
it("rejects a different claimant or an incomplete historical claim receipt", async () => {
  invite.status = "claimed";
  invite.claimedByUserId = "someone_else";
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow(
    "INVITE_ALREADY_CLAIMED",
  );
  invite.claimedByUserId = viewer;
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow(
    "INVITE_ALREADY_CLAIMED",
  );
  m.invites.findByToken.mockResolvedValue(null);
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow(
    "INVITE_NOT_FOUND",
  );
});
it("fails if the locked Event disappears or no longer belongs to the initial Group", async () => {
  m.events.lock.mockResolvedValueOnce(null);
  await expect(service().create(sender, table.id)).rejects.toThrow("TABLE_LINK_UNAVAILABLE");
  m.events.lock.mockResolvedValueOnce({ ...event, groupId: "another-group" });
  await expect(service().create(sender, table.id)).rejects.toThrow("TABLE_LINK_UNAVAILABLE");
  m.events.table
    .mockResolvedValueOnce(table)
    .mockResolvedValueOnce({ ...table, eventId: "another-event" });
  await expect(service().create(sender, table.id)).rejects.toThrow("TABLE_NOT_FOUND");
});
it("rejects self-use even in the contextual authority recheck", async () => {
  await expect(service().create(sender, table.id)).resolves.toBe(invite);
  invite.inviterUserId = viewer;
  // required() sees a valid sender, but a concurrent/invalid sender value at context must still reject.
  m.invites.findByToken.mockResolvedValueOnce({ ...invite, inviterUserId: sender });
  m.invites.findByToken.mockResolvedValueOnce(invite);
  await expect(service().claim(viewer, { token, consent: true })).rejects.toThrow("OWN_INVITE");
});
