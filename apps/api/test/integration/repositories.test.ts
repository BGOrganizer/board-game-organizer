import { type Db, MongoClient, type ObjectId } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BoardGamesRepository } from "../../src/app/lib/boardGames.repository";
import { type MatchError, MatchService } from "../../src/app/lib/match.service";
import { MatchInvitationsRepository } from "../../src/app/lib/match-invitations.repository";
import { MatchesRepository } from "../../src/app/lib/matches.repository";
import { migrate } from "../../src/app/lib/migrate";
import { NotificationsRepository } from "../../src/app/lib/notifications.repository";
import { PushSubscriptionsRepository } from "../../src/app/lib/push-subscriptions.repository";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";
import { RelationshipService } from "../../src/app/lib/relationship.service";
import { UsersRepository } from "../../src/app/lib/users.repository";

const ACTOR = "user_actor";
const TARGET = "user_target";
const THIRD = "user_third";
const FOURTH = "user_fourth";

let container: StartedTestContainer;
let client: MongoClient;
let db: Db;
let relationships: RelationshipRepository;
let users: UsersRepository;
let databaseNumber = 0;

async function transact(work: (repository: RelationshipRepository) => Promise<void>) {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await work(new RelationshipRepository(db, session));
    });
  } finally {
    await session.endSession();
  }
}

async function seedUser(
  repository: UsersRepository,
  id: string,
  email: string,
  mobileNumber?: string,
) {
  await repository.upsertFromClerk({
    id,
    email,
    name: id,
    mobileNumber,
    preferredLanguage: "en",
  });
}

beforeAll(async () => {
  container = await new GenericContainer("mongo:7")
    .withCommand(["mongod", "--replSet", "rs0", "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();

  const directUri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`;
  const bootstrap = new MongoClient(directUri);
  await bootstrap.connect();
  await bootstrap.db("admin").command({
    replSetInitiate: {
      _id: "rs0",
      members: [{ _id: 0, host: "localhost:27017" }],
    },
  });
  await bootstrap.close();

  client = new MongoClient(`${directUri}&replicaSet=rs0`);
  await client.connect();
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await client.db("admin").command({ hello: 1 });
    if (status.isWritablePrimary) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("MongoDB replica set did not elect a primary");
}, 240_000);

afterAll(async () => {
  await client?.close();
  await container?.stop();
});

beforeEach(async () => {
  db = client.db(`integration-repositories-${databaseNumber++}`);
  await migrate(db);
  users = new UsersRepository(db);
  relationships = new RelationshipRepository(db);
  await seedUser(users, ACTOR, "actor@example.com", "+39 333 123 4567");
  await seedUser(users, TARGET, "target@example.com");
  await seedUser(users, THIRD, "third@example.com");
});

describe("API repositories on a MongoDB replica set", () => {
  it("persists and retrieves users through UsersRepository", async () => {
    expect(await relationships.userExists(ACTOR)).toBe(true);
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      clerkId: ACTOR,
      email: "actor@example.com",
      mobileNumber: "+39 333 123 4567",
      mobileNumberNormalized: "393331234567",
    });
    await expect(users.findByEmail("target@example.com")).resolves.toMatchObject({
      clerkId: TARGET,
    });

    await seedUser(users, ACTOR, "actor-updated@example.com");
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      email: "actor-updated@example.com",
      mobileNumber: "+39 333 123 4567",
      mobileNumberNormalized: "393331234567",
    });

    await users.deleteByClerkId(ACTOR);
    expect(await relationships.userExists(ACTOR)).toBe(false);
  });

  it("persists idempotent follow and unfollow operations", async () => {
    await relationships.follow(ACTOR, TARGET);
    await relationships.follow(ACTOR, TARGET);

    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listFollowing(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listFollowers(TARGET)).resolves.toEqual([
      expect.objectContaining({ fromUserId: ACTOR, toUserId: TARGET }),
    ]);
    await expect(relationships.listFollowers(TARGET, [ACTOR])).resolves.toEqual([]);

    await relationships.unfollow(ACTOR, TARGET);
    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
  });

  it("persists friend-request and friendship lifecycle", async () => {
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toMatchObject({
      status: "pending",
    });
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listIncomingFriendRequests(TARGET)).resolves.toHaveLength(1);
    await expect(relationships.listOutgoingFriendRequests(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listIncomingFriendRequests(TARGET, [ACTOR])).resolves.toEqual([]);

    await relationships.setFriendRequest(ACTOR, TARGET, "rejected");
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toEqual([]);
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    const wrongStatus = await relationships.deleteFriendRequest(ACTOR, TARGET, "accepted");
    expect(wrongStatus.deletedCount).toBe(0);
    await relationships.deleteFriendRequest(ACTOR, TARGET, "pending");
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();

    await relationships.becomeFriends(ACTOR, TARGET);
    expect(await relationships.isFriend(ACTOR, TARGET)).toBe(true);
    await expect(relationships.listFriends(ACTOR)).resolves.toEqual([
      { fromUserId: ACTOR, toUserId: TARGET, status: "accepted" },
    ]);
    await expect(relationships.listFriends(TARGET)).resolves.toEqual([
      { fromUserId: TARGET, toUserId: ACTOR, status: "accepted" },
    ]);
    await expect(relationships.listFriends(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listFollowing(TARGET)).resolves.toHaveLength(1);

    await transact((repository) => new RelationshipService(repository).unfriend(ACTOR, TARGET));
    expect(await relationships.isFriend(ACTOR, TARGET)).toBe(false);
    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listFollowing(TARGET)).resolves.toHaveLength(1);
  });

  it("persists block lifecycle and resolves either direction", async () => {
    await relationships.block(ACTOR, TARGET);
    await relationships.block(ACTOR, TARGET);

    await expect(relationships.findBlock(ACTOR, TARGET)).resolves.not.toBeNull();
    expect(await relationships.isBlocked(ACTOR, TARGET)).toBe(true);
    expect(await relationships.isBlocked(TARGET, ACTOR)).toBe(true);
    await expect(relationships.getBlockedUserIds(ACTOR)).resolves.toEqual([TARGET]);
    await expect(relationships.getBlockedUserIds(TARGET)).resolves.toEqual([ACTOR]);
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([
      expect.objectContaining({ fromUserId: ACTOR, toUserId: TARGET }),
    ]);

    await relationships.unblock(ACTOR, TARGET);
    expect(await relationships.isBlocked(ACTOR, TARGET)).toBe(false);
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([]);
  });

  it("clears friend requests in both directions", async () => {
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    await relationships.setFriendRequest(TARGET, ACTOR, "rejected");
    await relationships.clearFriendRequests(ACTOR, TARGET);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();
    await expect(relationships.findFriendRequest(TARGET, ACTOR)).resolves.toBeNull();
  });

  it("deletes only social edges involving the removed user", async () => {
    await relationships.follow(ACTOR, TARGET);
    await relationships.follow(TARGET, THIRD);
    await relationships.setFriendRequest(TARGET, ACTOR, "pending");
    await relationships.setFriendRequest(TARGET, THIRD, "pending");
    await relationships.block(ACTOR, THIRD);
    await relationships.block(TARGET, THIRD);

    await relationships.deleteAllForUser(ACTOR);

    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listFollowing(TARGET)).resolves.toEqual([
      expect.objectContaining({ fromUserId: TARGET, toUserId: THIRD }),
    ]);
    await expect(relationships.findFriendRequest(TARGET, ACTOR)).resolves.toBeNull();
    await expect(relationships.findFriendRequest(TARGET, THIRD)).resolves.not.toBeNull();
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listBlocked(TARGET)).resolves.toHaveLength(1);
  });

  it("commits repository operations sharing one transaction session", async () => {
    await transact(async (repository) => {
      await repository.follow(ACTOR, TARGET);
      await repository.setFriendRequest(ACTOR, TARGET, "pending");
      await repository.block(ACTOR, THIRD);
    });

    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.not.toBeNull();
    await expect(relationships.findBlock(ACTOR, THIRD)).resolves.not.toBeNull();
  });

  it("rolls back every repository write when a transaction fails", async () => {
    await expect(
      transact(async (repository) => {
        await repository.follow(ACTOR, TARGET);
        await repository.setFriendRequest(ACTOR, TARGET, "pending");
        await repository.block(ACTOR, THIRD);
        throw new Error("forced failure");
      }),
    ).rejects.toThrow("forced failure");

    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();
    await expect(relationships.findBlock(ACTOR, THIRD)).resolves.toBeNull();
  });

  it("keeps concurrent upserts unique through repository methods", async () => {
    await Promise.all([relationships.follow(ACTOR, TARGET), relationships.follow(ACTOR, TARGET)]);
    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);

    await Promise.all([
      relationships.setFriendRequest(ACTOR, TARGET, "pending"),
      relationships.setFriendRequest(ACTOR, TARGET, "pending"),
    ]);
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toHaveLength(1);
  });
});

async function withMatchTransaction<T>(
  work: (repositories: {
    service: MatchService;
    matches: MatchesRepository;
    invitations: MatchInvitationsRepository;
  }) => Promise<T>,
): Promise<T> {
  const session = client.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const matches = new MatchesRepository(db, session);
      const invitations = new MatchInvitationsRepository(db, session);
      return work({
        matches,
        invitations,
        service: new MatchService(
          matches,
          invitations,
          new UsersRepository(db, session),
          new RelationshipRepository(db, session),
          new BoardGamesRepository(db, session),
        ),
      });
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

async function seedMatchDependencies() {
  await relationships.becomeFriends(ACTOR, TARGET);
  await new BoardGamesRepository(db).bulkUpsert([
    { id: 342942, name: "Ark Nova", yearPublished: 2021, thumbnail: null },
  ]);
}

const matchInput = {
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 3,
  invitedUserIds: [] as string[],
  gameIds: [342942],
};

describe("match repositories on MongoDB replica set", () => {
  it("creates a zero-invite match, accepts, leaves, and allows re-invitation", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    expect(created).toMatchObject({ status: "PLANNING", invitations: [] });

    const matches = new MatchesRepository(db);
    const invitations = new MatchInvitationsRepository(db);
    await expect(matches.findById(created.id)).resolves.toMatchObject({
      id: created.id,
      status: "PLANNING",
    });
    await expect(invitations.listByMatch(created.id)).resolves.toEqual([]);

    const invited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    await expect(
      withMatchTransaction(({ service }) => service.respond(TARGET, invited.id, "accept")),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(withMatchTransaction(({ service }) => service.list(TARGET))).resolves.toEqual([
      expect.objectContaining({ id: created.id, status: "PLANNING" }),
    ]);

    await withMatchTransaction(({ service }) => service.leave(TARGET, invited.id));
    await expect(invitations.findById(invited.id)).resolves.toBeNull();
    const reinvited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    expect(reinvited).toMatchObject({ status: "PENDING", inviteeUserId: TARGET });
    expect(reinvited.id).not.toBe(invited.id);
  });

  it("removes declined invitation before re-invite and blocks late departure", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    expect(created.invitations).toHaveLength(1);
    const invitation = created.invitations[0];

    await expect(
      withMatchTransaction(({ service }) => service.respond(TARGET, invitation.id, "decline")),
    ).resolves.toMatchObject({ status: "DECLINED" });
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, invitation.id),
    );
    const reinvited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    expect(reinvited).toMatchObject({ status: "PENDING" });
    expect(reinvited.id).not.toBe(invitation.id);
    await withMatchTransaction(({ service }) => service.respond(TARGET, reinvited.id, "accept"));

    await new MatchesRepository(db).setStatus(created.id, "CREATED");
    await expect(
      withMatchTransaction(({ service }) => service.leave(TARGET, reinvited.id)),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MatchError>>({
        status: 409,
        message: "Match is no longer in planning",
      }),
    );
    await expect(new MatchInvitationsRepository(db).findById(reinvited.id)).resolves.toMatchObject({
      status: "ACCEPTED",
    });
  });

  it("rolls back match and invitation writes together", async () => {
    await expect(
      withMatchTransaction(async ({ matches, invitations }) => {
        const created = await matches.create({
          clerkId: ACTOR,
          name: matchInput.name,
          dates: matchInput.dates,
          minPlayers: matchInput.minPlayers,
          maxPlayers: matchInput.maxPlayers,
          gameIds: matchInput.gameIds,
        });
        await invitations.create(created.id, ACTOR, TARGET);
        throw Object.assign(new Error("force rollback"), { matchId: created.id });
      }),
    ).rejects.toMatchObject({ message: "force rollback" });
    await expect(new MatchesRepository(db).listAccessible(ACTOR, [])).resolves.toEqual([]);
    await expect(new MatchInvitationsRepository(db).listByInvitee(TARGET)).resolves.toEqual([]);
  });

  it("serializes concurrent invites so maxPlayers cannot be exceeded", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, maxPlayers: 2 }),
    );

    const results = await Promise.allSettled(
      [TARGET, THIRD].map((inviteeUserId) =>
        withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, inviteeUserId)),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toHaveLength(
      1,
    );
  });

  it("requires maxPlayers increase and lets admin remove pending or accepted users", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, maxPlayers: 2, invitedUserIds: [TARGET] }),
    );
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, THIRD)),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: "Match has no available invitation positions",
      }),
    );

    await withMatchTransaction(({ service }) =>
      service.update(ACTOR, created.id, { maxPlayers: 3 }),
    );
    const thirdInvitation = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, THIRD),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, created.invitations[0].id),
    );
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, thirdInvitation.id),
    );
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([]);
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      maxPlayers: 3,
    });
  });

  it("updates title, dates, player range, and games while planning", async () => {
    await seedMatchDependencies();
    await new BoardGamesRepository(db).bulkUpsert([
      { id: 266192, name: "Wingspan", yearPublished: 2019, thumbnail: null },
    ]);
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    const updates = {
      name: "Updated game night",
      dates: ["2026-11-01T20:00:00.000Z", "2026-11-02T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 5,
      gameIds: [342942, 266192],
    };
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, updates)),
    ).resolves.toMatchObject(updates);

    const reduced = {
      name: "Small game night",
      dates: [updates.dates[0]],
      minPlayers: 2,
      maxPlayers: 3,
      gameIds: [266192],
    };
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, reduced)),
    ).resolves.toMatchObject(reduced);
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject(reduced);
  });

  it("rejects non-admin, finalized, missing-game, and occupied-capacity updates", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        maxPlayers: 3,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(TARGET, created.id, { name: "Unauthorized title" }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, created.id, { gameIds: [999999] }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, { maxPlayers: 2 })),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: "maxPlayers cannot be lower than occupied player positions",
      }),
    );

    await new MatchesRepository(db).setStatus(created.id, "CREATED");
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, created.id, { name: "Finalized title" }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 409 }));
  });

  it("rolls back match field updates", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    await expect(
      withMatchTransaction(async ({ service }) => {
        await service.update(ACTOR, created.id, { name: "Rolled back title", maxPlayers: 5 });
        throw new Error("force update rollback");
      }),
    ).rejects.toThrow("force update rollback");
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      name: matchInput.name,
      maxPlayers: matchInput.maxPlayers,
    });
  });

  it("deletes match and all invitation statuses atomically", async () => {
    await seedMatchDependencies();
    await seedUser(users, FOURTH, "fourth@example.com");
    await relationships.becomeFriends(ACTOR, THIRD);
    await relationships.becomeFriends(ACTOR, FOURTH);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        maxPlayers: 4,
        invitedUserIds: [TARGET, THIRD, FOURTH],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, created.invitations[1].id, "decline"),
    );

    await withMatchTransaction(({ service }) => service.deleteMatch(ACTOR, created.id));
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toBeNull();
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([]);
  });

  it("rolls back match deletion and invitation cleanup together", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await expect(
      withMatchTransaction(async ({ service }) => {
        await service.deleteMatch(ACTOR, created.id);
        throw new Error("force deletion rollback");
      }),
    ).rejects.toThrow("force deletion rollback");
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      id: created.id,
    });
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toHaveLength(
      1,
    );
  });

  it("persists, paginates, reads, and cleans notification data", async () => {
    const createdIds: ObjectId[] = [];
    const notifications = new NotificationsRepository(db, undefined, createdIds);
    await notifications.notify({
      kind: "friend_request",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
    });
    await db
      .collection("users")
      .updateOne({ clerkId: TARGET }, { $set: { preferredLanguage: "it" } });
    await notifications.notify({
      kind: "match_invitation",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
      matchName: "Catan",
    });

    expect(createdIds).toHaveLength(2);
    const firstPage = await notifications.list(TARGET, 1);
    expect(firstPage).toMatchObject({ unreadCount: 2 });
    expect(firstPage.notifications[0]).toMatchObject({
      title: "Nuovo invito a una partita",
      href: "/matches",
      readAt: null,
    });
    expect(firstPage.nextCursor).toBe(firstPage.notifications[0]?.id);
    const secondPage = await notifications.list(TARGET, 1, firstPage.nextCursor ?? undefined);
    expect(secondPage.notifications[0]).toMatchObject({
      title: "New friend request",
      href: "/contacts",
    });
    expect(secondPage.nextCursor).toBeNull();

    await notifications.markRead(TARGET, firstPage.notifications[0]?.id ?? "");
    expect((await notifications.list(TARGET, 5)).unreadCount).toBe(1);
    await notifications.markAllRead(TARGET);
    expect((await notifications.list(TARGET, 5)).unreadCount).toBe(0);

    const subscriptions = new PushSubscriptionsRepository(db);
    await subscriptions.upsert(ACTOR, "token-1234567890123456", "android", "en");
    await subscriptions.upsert(TARGET, "token-1234567890123456", "web", "it");
    expect(await subscriptions.listByUser(ACTOR)).toEqual([]);
    expect(await subscriptions.listByUser(TARGET)).toMatchObject([
      { provider: "fcm", platform: "web", locale: "it" },
    ]);
    await subscriptions.remove(TARGET, "token-1234567890123456");
    expect(await subscriptions.listByUser(TARGET)).toEqual([]);

    await subscriptions.upsert(ACTOR, "token-abcdefghijklmnop", "ios", "en");
    await notifications.deleteForUser(ACTOR);
    expect(await notifications.list(TARGET, 5)).toMatchObject({ notifications: [] });
    expect(await subscriptions.listByUser(ACTOR)).toEqual([]);
  });

  it("rolls back notification creation with its source event", async () => {
    const session = client.startSession();
    await expect(
      session.withTransaction(async () => {
        await new NotificationsRepository(db, session).notify({
          kind: "friend_request",
          recipientUserId: TARGET,
          actorUserId: ACTOR,
        });
        throw new Error("rollback notification");
      }),
    ).rejects.toThrow("rollback notification");
    await session.endSession();
    expect((await new NotificationsRepository(db).list(TARGET, 5)).notifications).toEqual([]);
  });

  it("rejects invitations when either user blocked the other", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    await relationships.block(TARGET, ACTOR);
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, TARGET)),
    ).rejects.toEqual(expect.objectContaining({ status: 404, message: "User not found" }));
  });
});
