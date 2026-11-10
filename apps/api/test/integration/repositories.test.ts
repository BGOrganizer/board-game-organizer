import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locationFavoriteKey, notificationItemId } from "@board-game-organizer/schemas";
import { type Db, MongoClient, type ObjectId } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importDirectCsv } from "../../scripts/import-boardgames-direct";
import { ContactLinksRepository } from "../../src/app/lib/contacts/contacts.repository";
import { RelationshipRepository } from "../../src/app/lib/contacts/relationship.repository";
import { RelationshipService } from "../../src/app/lib/contacts/relationship.service";
import { COLLECTIONS } from "../../src/app/lib/db";
import { gameDetails, searchGames } from "../../src/app/lib/games/bgg";
import { BggAccountRepository } from "../../src/app/lib/games/bgg-account.repository";
import { parseBggCollection } from "../../src/app/lib/games/bgg-collection";
import { BoardGamesRepository } from "../../src/app/lib/games/boardGames.repository";
import { GroupService } from "../../src/app/lib/groups/group.service";
import { GroupLeaderboardRepository } from "../../src/app/lib/groups/group-leaderboard.repository";
import { GroupsRepository } from "../../src/app/lib/groups/groups.repository";
import { FavoriteLocationsRepository } from "../../src/app/lib/locations/favorite-locations.repository";
import { type MatchError, MatchService } from "../../src/app/lib/matches/match.service";
import { MatchInvitationsRepository } from "../../src/app/lib/matches/match-invitations.repository";
import { MatchesRepository } from "../../src/app/lib/matches/matches.repository";
import { migrate } from "../../src/app/lib/migrate";
import { NotificationAttentionRepository } from "../../src/app/lib/notifications/notification-attention.repository";
import { NotificationsRepository } from "../../src/app/lib/notifications/notifications.repository";
import { PushSubscriptionsRepository } from "../../src/app/lib/notifications/push-subscriptions.repository";
import { ProfileService } from "../../src/app/lib/profile/profile.service";
import { RatingsRepository } from "../../src/app/lib/ratings/ratings.repository";
import { UsersRepository } from "../../src/app/lib/users/users.repository";

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

describe("source-paged entity notification attention", () => {
  const groupId = "11111111-1111-4111-8111-111111111111",
    eventId = "22222222-2222-4222-8222-222222222222",
    tableId = "33333333-3333-4333-8333-333333333333";
  const targets = [
    { kind: "table" as const, id: tableId },
    { kind: "event" as const, id: eventId },
    { kind: "group" as const, id: groupId },
    { kind: "contact" as const, id: TARGET },
    { kind: "contacts" as const, id: "requests" as const },
    { kind: "contacts" as const, id: "connections" as const },
  ] as const;
  async function seedAttentionResources() {
    await db.collection(COLLECTIONS.GROUPS).insertOne({
      id: groupId,
      type: "PRIVATE",
      adminUserId: THIRD,
      approved: { name: "Attention group" },
      version: 1,
    });
    await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertOne({
      id: groupId,
      groupId,
      userId: ACTOR,
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 1,
    });
    await db
      .collection(COLLECTIONS.EVENTS)
      .insertOne({ id: eventId, groupId, adminUserId: THIRD, status: "PLANNING", version: 1 });
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .insertOne({ id: tableId, eventId, name: "Attention table", version: 1 });
  }
  const note = (kind: string, href: string, extra: Record<string, unknown> = {}) => ({
    recipientUserId: ACTOR,
    actorUserId: TARGET,
    kind,
    href,
    title: "Fixture notification",
    description: "Fixture",
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    ...extra,
  });
  it("counts top-tab scopes beyond loaded inbox pages without turning their parent Group into an entity owner", async () => {
    await seedAttentionResources();
    const date = { kind: "item", id: notificationItemId(eventId, "date", groupId) } as const;
    const game = { kind: "item", id: notificationItemId(tableId, "game", 1) } as const;
    const inserted = await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("event_updated", `/events/${eventId}`, {
        attentionItems: [date, game].map((point) => ({
          id: point.id,
          revision: 1,
          eventId,
          groupId,
          tableIds: [tableId],
        })),
      }),
    );
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany(
        Array.from({ length: 31 }, () =>
          note("follow", "/contacts", { createdAt: new Date("2021-01-01T00:00:00Z") }),
        ),
      );
    const repository = new NotificationAttentionRepository(db);
    const scopes = [
      { kind: "event-list", id: "mine" },
      { kind: "event-list", id: "available" },
      { kind: "event-list", id: groupId },
      { kind: "group-list", id: "PRIVATE" },
    ] as const;
    const first = await repository.snapshot(
      ACTOR,
      [...targets, ...scopes, date, game],
      [String(inserted.insertedId)],
    );
    expect((await new NotificationsRepository(db).list(ACTOR, 1)).notifications[0].kind).toBe(
      "follow",
    );
    expect(
      first.snapshot.targets
        .slice(targets.length, targets.length + scopes.length)
        .map((row) => row.count),
    ).toEqual([0, 1, 1, 0]);
    expect(first.snapshot.summary).toMatchObject({ tables: 1, events: 1, groups: 0 });
    expect(first.references.get(String(inserted.insertedId))?.lists).toEqual([
      scopes[1],
      scopes[2],
    ]);
    const effect = first.snapshot.targets.find((row) => row.target.id === date.id)?.readEffect;
    expect(
      effect?.targets.filter((row) => row.target.kind === "event-list").map((row) => row.target),
    ).toEqual(expect.arrayContaining([scopes[1], scopes[2]]));
    expect(
      effect?.targets.some(
        (row) => row.target.kind === "group" || row.target.kind === "group-list",
      ),
    ).toBe(false);
    const read = await repository.read(ACTOR, { target: date, through: first.snapshot.asOf });
    expect(
      read.snapshot.targets
        .filter((row) => row.target.kind === "event-list")
        .map((row) => row.count),
    ).toEqual([0, 0]);
    const after = (await repository.snapshot(ACTOR, [...targets, ...scopes])).snapshot;
    expect(after.summary).toMatchObject({ tables: 1, events: 0, groups: 0 });
    expect(after.targets.slice(targets.length).map((row) => row.count)).toEqual([0, 0, 0, 0]);
    expect(after.unreadCount).toBe(first.snapshot.unreadCount);
  });

  it("uses canonical active registration/demonstration and Group access for Event tab scopes", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne(note("event_updated", `/events/${eventId}`));
    const repository = new NotificationAttentionRepository(db);
    const scopes = [
      { kind: "event-list", id: "mine" },
      { kind: "event-list", id: "available" },
      { kind: "event-list", id: groupId },
    ] as const;
    const counts = async () =>
      (await repository.snapshot(ACTOR, scopes)).snapshot.targets.map((row) => row.count);
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .insertOne({ id: tableId, tableId, eventId, userId: ACTOR, status: "PENDING" });
    expect(await counts()).toEqual([1, 0, 1]);
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ id: tableId }, { $set: { status: "ACCEPTED" } });
    expect(await counts()).toEqual([1, 0, 1]);
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ id: tableId }, { $set: { status: "CANCELLED" } });
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne({ id: tableId }, { $set: { demonstratorUserId: ACTOR } });
    expect(await counts()).toEqual([1, 0, 1]);
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: eventId }, { $set: { status: "CONFIRMED" } });
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne({ id: tableId }, { $set: { confirmed: { gameId: 1, playerIds: [TARGET] } } });
    expect(await counts()).toEqual([1, 0, 1]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "PENDING" } });
    expect(await counts()).toEqual([0, 0, 0]);
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: eventId }, { $set: { groupId: null, adminUserId: ACTOR } });
    expect(await counts()).toEqual([1, 0, 0]);
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne({ id: tableId }, { $set: { removedAt: new Date().toISOString() } });
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ id: tableId }, { $set: { status: "PENDING" } });
    expect(await counts()).toEqual([0, 1, 0]);
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: eventId }, { $set: { adminUserId: THIRD } });
    expect(await counts()).toEqual([0, 0, 0]);
  });

  it("source-counts Private/Public/discovery Group tabs by actual membership and clears them on generic entry reads", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne(note("group_membership_updated", `/groups/${groupId}`));
    const repository = new NotificationAttentionRepository(db);
    const scopes = [
      { kind: "group-list", id: "PRIVATE" },
      { kind: "group-list", id: "PUBLIC" },
      { kind: "group-list", id: "search" },
    ] as const;
    const counts = async () =>
      (await repository.snapshot(ACTOR, scopes)).snapshot.targets.map((row) => row.count);
    expect(await counts()).toEqual([1, 0, 0]);
    await db
      .collection(COLLECTIONS.GROUPS)
      .updateOne({ id: groupId }, { $set: { type: "PUBLIC" } });
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "PENDING", kind: "INVITATION" } });
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { kind: "REQUEST" } });
    expect(await counts()).toEqual([0, 0, 1]);
    await db
      .collection(COLLECTIONS.GROUPS)
      .updateOne({ id: groupId }, { $set: { adminUserId: ACTOR } });
    expect(await counts()).toEqual([0, 1, 1]);
    await db
      .collection(COLLECTIONS.GROUP_BANS)
      .insertOne({ groupId, userId: ACTOR, until: new Date(Date.now() + 60000).toISOString() });
    expect(await counts()).toEqual([0, 0, 0]);
    await db.collection(COLLECTIONS.GROUP_BANS).deleteOne({ groupId, userId: ACTOR });
    const before = (await repository.snapshot(ACTOR, [targets[2]])).snapshot;
    expect(before.targets[0].lists).toEqual([scopes[1], scopes[2]]);
    const receipt = await repository.read(ACTOR, { target: targets[2], through: before.asOf });
    expect(receipt.updated).toBe(1);
    expect(
      receipt.snapshot.targets
        .filter((row) => row.target.kind === "group-list")
        .map((row) => row.count),
    ).toEqual([0, 0]);
    expect(await counts()).toEqual([0, 0, 0]);
  });

  it("keeps structured item attention through container entry, acknowledges only one point and counts each notice once", async () => {
    await seedAttentionResources();
    const date = { kind: "item", id: notificationItemId(eventId, "date", groupId) } as const;
    const location = {
      kind: "item",
      id: notificationItemId(eventId, "location", tableId),
    } as const;
    const notices = new NotificationsRepository(db);
    await notices.notifyMany([
      {
        kind: "event_updated",
        actorUserId: TARGET,
        recipientUserId: ACTOR,
        resourceName: "Attention event",
        resourceHref: `/events/${eventId}`,
        attentionItems: [date, location].map((point) => ({
          id: point.id,
          revision: 2,
          eventId,
          groupId,
          tableIds: [tableId],
        })),
      },
    ]);
    const repository = new NotificationAttentionRepository(db);
    const first = (await repository.snapshot(ACTOR, [...targets, date, location])).snapshot;
    expect(first.unreadCount).toBe(1);
    expect(first.summary).toMatchObject({ tables: 0, events: 1, groups: 0 });
    expect(first.targets[0].count).toBe(0);
    expect(first.targets.find((row) => row.target.id === date.id)?.readEffect?.unread).toBe(0);
    expect(
      (await repository.read(ACTOR, { target: targets[1], through: first.asOf })).updated,
    ).toBe(0);
    await repository.read(ACTOR, { target: date, through: first.asOf });
    const partial = (await repository.snapshot(ACTOR, [...targets, date, location])).snapshot;
    expect(partial.unreadCount).toBe(1);
    expect(partial.targets.find((row) => row.target.id === date.id)?.count).toBe(0);
    expect(partial.targets.find((row) => row.target.id === location.id)?.readEffect?.unread).toBe(
      1,
    );
    await repository.read(ACTOR, { target: location, through: partial.asOf });
    expect((await repository.snapshot(ACTOR, targets)).snapshot.unreadCount).toBe(0);
    expect(
      (await notices.list(ACTOR, 10)).notifications[0].attentionItems?.every(
        (point) => point.readAt,
      ),
    ).toBe(true);
  });
  it("clears each actual container of a mixed Event/Table notice as its own last point is read", async () => {
    await seedAttentionResources();
    const date = { kind: "item", id: notificationItemId(eventId, "date", groupId) } as const;
    const game = { kind: "item", id: notificationItemId(tableId, "game", 1) } as const;
    await new NotificationsRepository(db).notifyMany([
      {
        kind: "event_updated",
        actorUserId: TARGET,
        recipientUserId: ACTOR,
        resourceName: "Mixed change",
        resourceHref: `/events/${eventId}`,
        attentionItems: [date, game].map((point) => ({
          id: point.id,
          revision: 2,
          eventId,
          groupId,
          tableIds: [tableId],
        })),
      },
    ]);
    const repository = new NotificationAttentionRepository(db);
    const first = (await repository.snapshot(ACTOR, [...targets, date, game])).snapshot;
    expect(first.summary).toMatchObject({ tables: 1, events: 1, groups: 0 });
    const effect = first.targets.find((row) => row.target.id === date.id)?.readEffect;
    expect(effect).toMatchObject({ unread: 0, summary: { tables: 0, events: 1, groups: 0 } });
    expect(effect?.targets.some((row) => row.target.kind === "event")).toBe(true);
    expect(
      effect?.targets.some((row) => row.target.kind === "table" || row.target.kind === "group"),
    ).toBe(false);
    await repository.read(ACTOR, { target: date, through: first.asOf });
    const partial = (await repository.snapshot(ACTOR, [...targets, game])).snapshot;
    expect(partial.unreadCount).toBe(1);
    expect(partial.summary).toMatchObject({ tables: 1, events: 0, groups: 0 });
    expect(partial.targets.slice(0, 3).map((row) => row.count)).toEqual([1, 0, 0]);
    expect(partial.targets.find((row) => row.target.id === game.id)?.readEffect).toMatchObject({
      unread: 1,
      summary: { tables: 1, events: 0, groups: 0 },
    });
    await repository.read(ACTOR, { target: game, through: partial.asOf });
    expect((await repository.snapshot(ACTOR, targets)).snapshot.unreadCount).toBe(0);
  });
  it("attributes accepted members precisely, protects historical points from entry reads and retains later arrivals", async () => {
    await seedAttentionResources();
    await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertOne({
      groupId,
      userId: TARGET,
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 2,
      updatedAt: "2019-01-01T00:00:00.000Z",
    });
    const member = { kind: "item", id: notificationItemId(groupId, "member", TARGET) } as const;
    const members = { kind: "item", id: notificationItemId(groupId, "members") } as const;
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertMany([
      note("group_membership_updated", `/groups/${groupId}`, { recipientUserId: THIRD }),
      note("group_membership_updated", `/groups/${groupId}`, {
        recipientUserId: THIRD,
        actorUserId: FOURTH,
      }),
    ]);
    await new NotificationsRepository(db).notifyMany([
      {
        kind: "group_membership_updated",
        actorUserId: TARGET,
        recipientUserId: THIRD,
        resourceName: "Accepted member",
        resourceHref: `/groups/${groupId}`,
        attentionItems: [{ id: member.id, sectionId: members.id, revision: 2, groupId }],
      },
    ]);
    const repository = new NotificationAttentionRepository(db);
    const first = (await repository.snapshot(THIRD, [...targets, member, members])).snapshot;
    expect(first.unreadCount).toBe(3);
    expect(first.targets.slice(0, 3).map((row) => [row.count, row.direct])).toEqual([
      [0, 0],
      [0, 0],
      [3, 1],
    ]);
    expect(first.targets.slice(-2).map((row) => row.count)).toEqual([2, 2]);
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("group_membership_updated", `/groups/${groupId}`, {
        recipientUserId: THIRD,
        createdAt: new Date(),
      }),
    );
    expect(
      (await repository.read(THIRD, { target: targets[2], through: first.asOf })).updated,
    ).toBe(1);
    expect((await repository.snapshot(THIRD, [member])).snapshot.targets[0].count).toBe(3);
    expect((await repository.read(THIRD, { target: member, through: first.asOf })).updated).toBe(2);
    const after = (await repository.snapshot(THIRD, [...targets, member, members])).snapshot;
    expect(after.unreadCount).toBe(1);
    expect(after.targets.slice(-2).map((row) => row.count)).toEqual([1, 1]);
    expect(after.summary).toMatchObject({ groups: 1, events: 0, tables: 0 });
    expect((await repository.read(THIRD, { target: members, through: after.asOf })).updated).toBe(
      1,
    );
    expect((await repository.snapshot(THIRD, [member, members])).snapshot.unreadCount).toBe(0);
    expect(
      await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({ recipientUserId: THIRD }),
    ).toBe(4);
  });
  it("never grants member-point visibility through pending Group invitations or public discovery", async () => {
    await seedAttentionResources();
    await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertOne({
      groupId,
      userId: TARGET,
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 2,
      updatedAt: "2019-01-01T00:00:00.000Z",
    });
    const member = { kind: "item", id: notificationItemId(groupId, "member", TARGET) } as const;
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne(note("group_membership_updated", `/groups/${groupId}`));
    await new NotificationsRepository(db).notifyMany([
      {
        kind: "group_membership_updated",
        actorUserId: TARGET,
        recipientUserId: ACTOR,
        resourceName: "Accepted member",
        resourceHref: `/groups/${groupId}`,
        attentionItems: [{ id: member.id, revision: 2, groupId }],
      },
    ]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "PENDING" } });
    const repository = new NotificationAttentionRepository(db);
    for (const type of ["PRIVATE", "PUBLIC"]) {
      await db.collection(COLLECTIONS.GROUPS).updateOne({ id: groupId }, { $set: { type } });
      const ids = (
        await db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .find({ recipientUserId: ACTOR })
          .project({ _id: 1 })
          .toArray()
      ).map((row) => String(row._id));
      const result = await repository.snapshot(ACTOR, [member], ids);
      expect(result.snapshot.targets[0].count).toBe(0);
      expect(
        [...result.references.values()].every((row) => !row.itemIds?.includes(member.id)),
      ).toBe(true);
      expect(result.snapshot.summary.groups).toBe(1); // Generic historical notice, never inferred member identity.
    }
    await db.collection(COLLECTIONS.GROUP_BANS).insertOne({ groupId, userId: ACTOR, until: null });
    expect((await repository.snapshot(ACTOR, [member])).snapshot.summary.groups).toBe(0);
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments()).toBe(2);
  });
  it("returns stable per-item unread signals, advancing only for a matching new notice or retargeted revision", async () => {
    await seedAttentionResources();
    const date = { kind: "item", id: notificationItemId(eventId, "date", groupId) } as const;
    const location = {
      kind: "item",
      id: notificationItemId(eventId, "location", tableId),
    } as const;
    const base = {
      revision: 1,
      eventId,
      groupId,
      tableIds: [tableId],
      changedAt: new Date("2020-01-01T00:00:00.000Z"),
    };
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("event_updated", `/events/${eventId}`, {
        attentionItems: [
          { ...base, id: date.id },
          { ...base, id: location.id },
        ],
      }),
    );
    const repository = new NotificationAttentionRepository(db),
      source = async () => (await repository.snapshot(ACTOR, [date, location])).snapshot.targets;
    const before = await source();
    expect(before[0].signal).toMatch(/^2020-01-01T00:00:00\.000Z\|[a-f\d]{24}$/);
    expect((await source()).map((row) => row.signal)).toEqual(before.map((row) => row.signal));
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("event_updated", `/events/${eventId}`, {
        createdAt: new Date("2021-01-01T00:00:00.000Z"),
        attentionItems: [{ ...base, id: date.id, changedAt: new Date("2021-01-01T00:00:00.000Z") }],
      }),
    );
    const arrival = await source();
    expect(arrival[0].signal! > before[0].signal!).toBe(true);
    expect(arrival[1].signal).toBe(before[1].signal);
    await new NotificationsRepository(db).retargetItems([
      { from: location.id, to: { ...base, id: location.id, revision: 2 } },
    ]);
    const changed = await source();
    expect(changed[1].signal! > arrival[1].signal!).toBe(true);
    expect(changed[0].signal).toBe(arrival[0].signal);
    await repository.read(ACTOR, { target: date, through: new Date().toISOString() });
    expect((await source())[0].signal).toBeUndefined();
  });
  it("isolates Group and Table invitations even when their canonical UUIDs coincide", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .insertOne({ id: groupId, eventId, name: "Same UUID table", version: 1 });
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        note("group_invitation", `/groups/${groupId}`),
        note("table_invitation", `/events/${eventId}/tables/${groupId}`),
      ]);
    const repository = new NotificationAttentionRepository(db);
    const group = { kind: "item", id: notificationItemId(groupId, "invitation") } as const;
    const table = {
      kind: "item",
      id: notificationItemId(groupId, "invitation", undefined, "table"),
    } as const;
    const before = (await repository.snapshot(ACTOR, [group, table])).snapshot;
    expect(before.targets.map((row) => row.count)).toEqual([1, 1]);
    await repository.read(ACTOR, { target: group, through: before.asOf });
    const after = (await repository.snapshot(ACTOR, [group, table])).snapshot;
    expect(after.unreadCount).toBe(1);
    expect(after.targets.map((row) => row.count)).toEqual([0, 1]);
  });
  it("retargets removed points without resetting history, preserves later revisions and rolls item acknowledgements back", async () => {
    await seedAttentionResources();
    const id = notificationItemId(eventId, "date", groupId),
      section = notificationItemId(eventId, "dates");
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertMany(
      [ACTOR, TARGET].map((recipientUserId) =>
        note("event_updated", `/events/${eventId}`, {
          recipientUserId,
          attentionItems: [{ id, revision: 1, eventId, groupId, tableIds: [tableId] }],
        }),
      ),
    );
    const notices = new NotificationsRepository(db);
    await notices.retargetItems([
      {
        from: id,
        to: { id: section, sectionId: section, revision: 2, eventId, groupId, tableIds: [tableId] },
      },
    ]);
    await notices.acknowledgeItems(ACTOR, [section], "2021-01-01T00:00:00.000Z");
    expect((await notices.list(ACTOR, 10)).unreadCount).toBe(1);
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await new NotificationsRepository(db, session).acknowledgeItems(
            ACTOR,
            [section],
            new Date().toISOString(),
          );
          throw new Error("Rollback item read");
        }),
      ).rejects.toThrow("Rollback item read");
    } finally {
      await session.endSession();
    }
    expect((await notices.list(ACTOR, 10)).unreadCount).toBe(1);
    await notices.acknowledgeItems(ACTOR, [section], new Date().toISOString());
    expect((await notices.list(ACTOR, 10)).unreadCount).toBe(0);
    expect((await notices.list(TARGET, 10)).unreadCount).toBe(1);
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("event_updated", `/events/${eventId}`, {
        attentionItems: [
          {
            id: section,
            revision: 3,
            eventId,
            tableIds: [tableId],
            changedAt: new Date(Date.now() + 60_000),
          },
        ],
      }),
    );
    const repository = new NotificationAttentionRepository(db);
    expect((await repository.snapshot(ACTOR, [targets[1]])).snapshot.targets[0].direct).toBe(0);
    expect(
      (await repository.read(ACTOR, { target: targets[1], through: new Date().toISOString() }))
        .updated,
    ).toBe(0);
  });
  it("publishes one follow notification per inserted edge and rolls back edge plus notice together", async () => {
    const session = client.startSession();
    const follow = async (to: string, rollback = false) =>
      session.withTransaction(async () => {
        await new RelationshipService(
          new RelationshipRepository(db, session),
          new NotificationsRepository(db, session),
        ).follow(ACTOR, to);
        if (rollback) throw new Error("Follow rollback");
      });
    try {
      await follow(TARGET);
      await follow(TARGET);
      expect(
        await db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .countDocuments({ kind: "follow", recipientUserId: TARGET, actorUserId: ACTOR }),
      ).toBe(1);
      await expect(follow(THIRD, true)).rejects.toThrow("Follow rollback");
      expect(
        await db
          .collection(COLLECTIONS.FOLLOWS)
          .countDocuments({ fromUserId: ACTOR, toUserId: THIRD }),
      ).toBe(0);
      expect(
        await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({ recipientUserId: THIRD }),
      ).toBe(0);
      await relationships.block(THIRD, ACTOR);
      await expect(follow(THIRD)).rejects.toMatchObject({ status: 404 });
    } finally {
      await session.endSession();
    }
  });
  it("counts all unread source rows beyond inbox pages, only for their actual entity", async () => {
    await seedAttentionResources();
    const tableNote = note("table_invitation", `/events/${eventId}/tables/${tableId}`);
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        ...Array.from({ length: 131 }, () => ({ ...tableNote })),
        note("event_agreement_ready", `/events/${eventId}`),
        note("event_confirmed", `/events/${eventId}`),
        ...Array.from({ length: 3 }, () =>
          note("group_membership_requested", `/groups/${groupId}`),
        ),
        note("friend_request", "/contacts"),
        note("friend_request", "/contacts"),
        note("friend_request_accepted", "/contacts"),
        note("follow", "/contacts"),
        note("match_invitation", "/matches/historical"),
        note("table_invitation", tableNote.href, { readAt: new Date() }),
        note("table_invitation", tableNote.href, { recipientUserId: TARGET }),
      ]);
    const page = await new NotificationsRepository(db).list(ACTOR, 3);
    expect(page.notifications).toHaveLength(3);
    const result = await new NotificationAttentionRepository(db).snapshot(
      ACTOR,
      targets,
      page.notifications.filter((row) => !row.readAt).map((row) => row.id),
    );
    expect(result.snapshot.unreadCount).toBe(141);
    expect(result.snapshot.summary).toEqual({
      tables: 131,
      events: 2,
      groups: 3,
      contacts: 4,
      sections: { requests: 2, connections: 2, search: 0 },
    });
    expect(result.snapshot.targets.map((row) => row.count)).toEqual([131, 2, 3, 4, 2, 2]);
    expect(result.snapshot.targets.map((row) => row.direct)).toEqual([0, 2, 3, 4, 2, 2]);
    expect(result.snapshot.targets[2].events).toBe(0);
    expect(result.snapshot.targets[0]).toMatchObject({ eventId, groupId });
    expect(result.snapshot.targets[1]).toMatchObject({ eventId, groupId });
    for (const reference of result.references.values())
      if (reference.target.kind === "table") expect(reference).toMatchObject({ eventId, groupId });
    expect(
      (await new NotificationAttentionRepository(db).snapshot(FOURTH, targets)).snapshot.summary,
    ).toEqual({
      tables: 0,
      events: 0,
      groups: 0,
      contacts: 0,
      sections: { requests: 0, connections: 0, search: 0 },
    });
  });
  it("reads direct resources and one Contact section only, without consuming descendants or domain consent", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        note("table_invitation", `/events/${eventId}/tables/${tableId}`),
        note("event_confirmed", `/events/${eventId}`),
        note("group_membership_updated", `/groups/${groupId}`),
        note("follow", "/contacts"),
        note("friend_request", "/contacts"),
        note("group_membership_updated", `/groups/${groupId}`, { recipientUserId: TARGET }),
      ]);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const repository = new NotificationAttentionRepository(db, session);
        expect(
          (await repository.read(ACTOR, { target: targets[2], through: new Date().toISOString() }))
            .updated,
        ).toBe(1);
        const result = (await repository.snapshot(ACTOR, targets)).snapshot;
        expect(result.targets.map((row) => row.count)).toEqual([1, 1, 0, 2, 1, 1]);
        expect(
          (await repository.read(ACTOR, { target: targets[1], through: new Date().toISOString() }))
            .updated,
        ).toBe(1);
        expect((await repository.snapshot(ACTOR, targets)).snapshot.targets[0].count).toBe(1);
        expect(
          (await repository.read(ACTOR, { target: targets[4], through: new Date().toISOString() }))
            .updated,
        ).toBe(1);
        expect((await repository.snapshot(ACTOR, targets)).snapshot.summary.sections).toEqual({
          requests: 0,
          connections: 1,
          search: 0,
        });
        expect(
          (await repository.read(ACTOR, { target: targets[0], through: new Date().toISOString() }))
            .updated,
        ).toBe(0);
        expect(
          (
            await repository.read(ACTOR, {
              target: {
                kind: "item",
                id: notificationItemId(tableId, "invitation", undefined, "table"),
              },
              through: new Date().toISOString(),
            })
          ).updated,
        ).toBe(1);
      });
    } finally {
      await session.endSession();
    }
    const final = (await new NotificationAttentionRepository(db).snapshot(ACTOR, targets)).snapshot;
    expect(final.unreadCount).toBe(1);
    expect(final.summary).toEqual({
      tables: 0,
      events: 0,
      groups: 0,
      contacts: 1,
      sections: { requests: 0, connections: 1, search: 0 },
    });
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .countDocuments({ recipientUserId: TARGET, readAt: { $exists: false } }),
    ).toBe(1);
    expect(await db.collection(COLLECTIONS.EVENTS).findOne({ id: eventId })).toMatchObject({
      status: "PLANNING",
      version: 1,
    });
    expect(
      await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).findOne({ groupId, userId: ACTOR }),
    ).toMatchObject({ status: "ACCEPTED", version: 1 });
    expect(await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).countDocuments()).toBe(0);
  });
  it("preserves notifications newer than the read cutoff and includes them in subsequent source counts", async () => {
    await seedAttentionResources();
    const inserted = await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne(note("table_invitation", `/events/${eventId}/tables/${tableId}`));
    const repository = new NotificationAttentionRepository(db),
      before = (await repository.snapshot(ACTOR, targets)).snapshot;
    const arrived = await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(
      note("table_invitation", `/events/${eventId}/tables/${tableId}`, {
        createdAt: new Date(Date.parse(before.asOf) + 1),
      }),
    );
    const receipt = await repository.read(ACTOR, {
      target: { kind: "item", id: notificationItemId(tableId, "invitation", undefined, "table") },
      through: before.asOf,
    });
    expect(receipt.updated).toBe(1);
    expect(receipt.snapshot.targets[0].count).toBe(1);
    expect(
      await db.collection(COLLECTIONS.NOTIFICATIONS).findOne({ _id: inserted.insertedId }),
    ).toHaveProperty("readAt");
    expect(
      await db.collection(COLLECTIONS.NOTIFICATIONS).findOne({ _id: arrived.insertedId }),
    ).not.toHaveProperty("readAt");
    await new NotificationsRepository(db).deleteAll(ACTOR);
    expect(
      (await repository.snapshot(ACTOR, targets)).snapshot.targets.every((row) => row.count === 0),
    ).toBe(true);
  });
  it("does not reveal inaccessible Event ancestry, private Groups or removed Tables through old unread notifications", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        note("table_invitation", `/events/${eventId}/tables/${tableId}`),
        note("event_confirmed", `/events/${eventId}`),
        note("group_membership_updated", `/groups/${groupId}`),
      ]);
    const repository = new NotificationAttentionRepository(db);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "CANCELLED" } });
    let result = (await repository.snapshot(ACTOR, targets)).snapshot;
    expect(result.unreadCount).toBe(3);
    expect(result.targets.every((row) => row.count === 0 && !row.eventId && !row.groupId)).toBe(
      true,
    );
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "PENDING" } });
    result = (await repository.snapshot(ACTOR, targets)).snapshot;
    expect(result.targets.map((row) => row.count)).toEqual([0, 0, 1, 0, 0, 0]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ACTOR }, { $set: { status: "ACCEPTED" } });
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne({ id: tableId }, { $set: { removedAt: new Date().toISOString() } });
    expect(
      (await repository.snapshot(ACTOR, targets)).snapshot.targets.map((row) => row.count),
    ).toEqual([0, 1, 1, 0, 0, 0]);
    await db.collection(COLLECTIONS.GROUP_BANS).insertOne({ groupId, userId: ACTOR, until: null });
    expect(
      (await repository.snapshot(ACTOR, targets)).snapshot.targets.every((row) => row.count === 0),
    ).toBe(true);
  });
  it("counts standalone attention only for its administrator or an active explicit registration", async () => {
    await seedAttentionResources();
    await db.collection(COLLECTIONS.EVENTS).updateOne({ id: eventId }, { $set: { groupId: null } });
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        note("table_invitation", `/events/${eventId}/tables/${tableId}`),
        note("event_confirmed", `/events/${eventId}`),
      ]);
    const repository = new NotificationAttentionRepository(db);
    expect((await repository.snapshot(ACTOR, targets)).snapshot.summary.events).toBe(0);
    await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).insertOne({
      id: tableId,
      eventId,
      tableId,
      userId: ACTOR,
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
    });
    const invited = (await repository.snapshot(ACTOR, targets)).snapshot;
    expect(invited.summary).toMatchObject({ tables: 1, events: 1, groups: 0 });
    expect(invited.targets[0]).not.toHaveProperty("groupId");
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ id: tableId }, { $set: { status: "CANCELLED" } });
    expect((await repository.snapshot(ACTOR, targets)).snapshot.summary.events).toBe(0);
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: eventId }, { $set: { adminUserId: ACTOR } });
    expect((await repository.snapshot(ACTOR, targets)).snapshot.summary.events).toBe(1);
  });
  it("keeps public review attention contextual and rolls scoped reads back atomically", async () => {
    await seedAttentionResources();
    await db
      .collection(COLLECTIONS.GROUPS)
      .updateOne(
        { id: groupId },
        { $set: { type: "PUBLIC", proposal: { name: "Proposal" } }, $unset: { approved: "" } },
      );
    await db
      .collection(COLLECTIONS.USERS)
      .updateOne({ clerkId: ACTOR }, { $set: { bgoRole: "ADMIN" } });
    const inserted = await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne(note("group_review_requested", `/moderation/${groupId}`));
    const before = await new NotificationAttentionRepository(db).snapshot(
      ACTOR,
      [targets[2]],
      [String(inserted.insertedId)],
    );
    expect(before.snapshot.targets[0].count).toBe(1);
    expect(before.references.get(String(inserted.insertedId))?.target).toEqual(targets[2]);
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          const result = await new NotificationAttentionRepository(db, session).read(ACTOR, {
            target: targets[2],
            through: before.snapshot.asOf,
          });
          expect(result.updated).toBe(1);
          throw new Error("Scoped rollback");
        }),
      ).rejects.toThrow("Scoped rollback");
    } finally {
      await session.endSession();
    }
    expect(
      await db.collection(COLLECTIONS.NOTIFICATIONS).findOne({ _id: inserted.insertedId }),
    ).not.toHaveProperty("readAt");
  });
});

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
  async function replaceContacts(matches: Array<{ contactClerkId: string; email: string }>) {
    const session = client.startSession();
    try {
      return await session.withTransaction(async () => {
        await new UsersRepository(db, session).lock(ACTOR);
        return new ContactLinksRepository(db).replaceForUser(ACTOR, matches, session);
      });
    } finally {
      await session.endSession();
    }
  }
  it("rolls back the complete contact snapshot and its actor lock when insertion fails after deletion", async () => {
    await replaceContacts([{ contactClerkId: THIRD, email: "third@example.com" }]);
    const before = await db.collection(COLLECTIONS.CONTACT_LINKS).find({ userId: ACTOR }).toArray();
    const userBefore = await users.findById(ACTOR);
    // Real Mongo failure injection, scoped to this disposable test database. There
    // is deliberately no assumed unique index on the production contact snapshot.
    await db.command({
      collMod: COLLECTIONS.CONTACT_LINKS,
      validator: { contactClerkId: { $ne: TARGET } },
    });
    await expect(
      replaceContacts([{ contactClerkId: TARGET, email: "target@example.com" }]),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      await db.collection(COLLECTIONS.CONTACT_LINKS).find({ userId: ACTOR }).toArray(),
    ).toEqual(before);
    expect(await users.findById(ACTOR)).toEqual(userBefore);
  });
  it("serializes two initially empty address-book replacements instead of publishing their union", async () => {
    await Promise.all([
      replaceContacts([{ contactClerkId: TARGET, email: "target@example.com" }]),
      replaceContacts([{ contactClerkId: THIRD, email: "third@example.com" }]),
    ]);
    const links = await new ContactLinksRepository(db).contactClerkIdsForUser(ACTOR);
    expect(links).toHaveLength(1);
    expect([TARGET, THIRD]).toContain(links[0]);
  });
  it("marks an entire inbox atomically and leaves another owner's inbox untouched", async () => {
    await db.collection(COLLECTIONS.NOTIFICATIONS).insertMany([
      { recipientUserId: ACTOR, createdAt: new Date() },
      { recipientUserId: ACTOR, createdAt: new Date() },
      { recipientUserId: TARGET, createdAt: new Date() },
    ]);
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await new NotificationsRepository(db, session).markAllRead(ACTOR);
          throw new Error("failure after bulk update");
        }),
      ).rejects.toThrow("failure after bulk update");
      expect(
        await db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .countDocuments({ readAt: { $exists: true } }),
      ).toBe(0);
      await session.withTransaction(() =>
        new NotificationsRepository(db, session).markAllRead(ACTOR),
      );
      expect(
        await db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .countDocuments({ recipientUserId: ACTOR, readAt: { $exists: true } }),
      ).toBe(2);
      expect(
        await db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .countDocuments({ recipientUserId: TARGET, readAt: { $exists: true } }),
      ).toBe(0);
    } finally {
      await session.endSession();
    }
  });
  it("persists private favorites with pagination, idempotency and transaction rollback", async () => {
    const repository = new FavoriteLocationsRepository(db);
    expect(await db.collection("favoriteLocations").indexes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { userId: 1, _id: 1 } }),
        expect.objectContaining({ key: { userId: 1, key: 1 }, unique: true }),
      ]),
    );
    const location = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Game club",
      address: "Main Street 10",
      longitude: 12.5,
      latitude: 41.9,
    };
    const key = locationFavoriteKey(location);
    await repository.save(ACTOR, location);
    await repository.save(ACTOR, { ...location, name: "Renamed club" });
    await repository.save(TARGET, location);
    await repository.save(ACTOR, { ...location, address: "Second Street 20" });
    const first = await repository.list(ACTOR, 1);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toMatch(/^[a-f0-9]{64}$/);
    const second = await repository.list(ACTOR, 1, first.nextCursor ?? undefined);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(first.items[0].key).not.toBe(second.items[0].key);
    expect(
      (await repository.list(ACTOR, 20)).items.find((item) => item.key === key)?.location.name,
    ).toBe("Renamed club");
    expect((await repository.list(TARGET, 20)).items[0].location.name).toBe("Game club");
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await new FavoriteLocationsRepository(db, session).remove(ACTOR, key);
          throw new Error("abort favorite transaction");
        }),
      ).rejects.toThrow("abort favorite transaction");
    } finally {
      await session.endSession();
    }
    expect(await repository.statuses(ACTOR, [key, "missing"])).toEqual([key]);
    await repository.remove(ACTOR, key);
    await repository.remove(ACTOR, key);
    expect(await repository.statuses(ACTOR, [key])).toEqual([]);
    expect(await repository.statuses(TARGET, [key])).toEqual([key]);
  });
  it("keeps canonical favorite selection aliases private, idempotent and transactionally removable", async () => {
    const repository = new FavoriteLocationsRepository(db);
    const canonical = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Verified venue",
      address: "Main Street 10",
      longitude: 8.54,
      latitude: 47.37,
      timeZone: "Europe/Zurich",
    };
    const selectedKey = locationFavoriteKey({ ...canonical, longitude: 12.5 });
    const secondSelection = locationFavoriteKey({ ...canonical, latitude: 40 });
    const canonicalKey = locationFavoriteKey(canonical);
    await repository.save(ACTOR, canonical, selectedKey);
    await repository.save(ACTOR, canonical, selectedKey);
    await repository.save(ACTOR, canonical, secondSelection);
    await repository.save(TARGET, canonical, selectedKey);
    expect((await repository.list(ACTOR, 20)).items).toHaveLength(2);
    expect(
      (await repository.list(ACTOR, 20)).items.every(
        (row) => row.location.longitude === canonical.longitude,
      ),
    ).toBe(true);
    expect(await repository.statuses(ACTOR, [selectedKey, canonicalKey])).toEqual([
      selectedKey,
      canonicalKey,
    ]);
    expect(await repository.statuses(THIRD, [selectedKey, canonicalKey])).toEqual([]);
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await new FavoriteLocationsRepository(db, session).remove(ACTOR, canonicalKey);
          throw new Error("abort canonical removal");
        }),
      ).rejects.toThrow("abort canonical removal");
    } finally {
      await session.endSession();
    }
    expect(await repository.statuses(ACTOR, [selectedKey, canonicalKey])).toEqual([
      selectedKey,
      canonicalKey,
    ]);
    await repository.save(ACTOR, canonical);
    await repository.remove(ACTOR, canonicalKey);
    expect((await repository.list(ACTOR, 20)).items).toEqual([]);
    expect(await repository.statuses(TARGET, [selectedKey, canonicalKey])).toEqual([
      selectedKey,
      canonicalKey,
    ]);
    await repository.remove(TARGET, selectedKey);
    expect(await repository.statuses(TARGET, [selectedKey, canonicalKey])).toEqual([]);
  });
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
    groups: GroupService;
  }) => Promise<T>,
  notify = false,
): Promise<T> {
  const session = client.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const matches = new MatchesRepository(db, session);
      const invitations = new MatchInvitationsRepository(db, session);
      const groups = new GroupService(
        new GroupsRepository(db, session),
        new UsersRepository(db, session),
        new RelationshipRepository(db, session),
        notify ? new NotificationsRepository(db, session) : undefined,
      );
      return work({
        groups,
        matches,
        invitations,
        service: new MatchService(
          matches,
          invitations,
          new UsersRepository(db, session),
          new RelationshipRepository(db, session),
          new BoardGamesRepository(db, session),
          notify ? new NotificationsRepository(db, session) : undefined,
          groups,
          new RatingsRepository(db, session),
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
    { id: 342942, name: "Ark Nova", yearPublished: 2021, isExpansion: false },
  ]);
}

const matchInput = {
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  locations: [
    {
      id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
      name: "Game cafe",
      address: "123 Main St",
      longitude: 12.5,
      latitude: 41.9,
    },
  ],
  minPlayers: 2,
  maxPlayers: 3,
  invitedUserIds: [] as string[],
  gameIds: [342942],
};

describe("direct Preview catalog import on MongoDB replica set", () => {
  it("upserts the complete CSV, preserves older games and images, and safely repeats", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bgo-direct-import-"));
    const csvPath = join(directory, "ranks.csv");
    const header =
      "id,name,yearpublished,rank,bayesaverage,average,usersrated,is_expansion,abstracts_rank,cgs_rank,childrensgames_rank,familygames_rank,partygames_rank,strategygames_rank,thematic_rank,wargames_rank";
    const row = (values: string[]) => [...values, ...Array(8).fill("")].join(",");
    writeFileSync(
      csvPath,
      [
        header,
        row(["13", "Catan", "1995", "627", "6.90146", "7.09", "144562", "0"]),
        row(["2", "Azul expansion", "2017", "0", "0", "7.5", "5", "1"]),
        "",
      ].join("\n"),
    );
    const host = `${container.getHost()}:${container.getMappedPort(27017)}`;
    const preview = client.db("board-game-organizer");
    const catalog = preview.collection(COLLECTIONS.BOARD_GAMES);
    try {
      await catalog.insertMany([
        {
          id: 13,
          name: "Old Catan",
          image: "https://cf.geekdo-images.com/catan/full.jpg",
          thumbnail: "legacy",
        },
        { id: 999, name: "Historical", thumbnail: "legacy" },
      ]);
      const env = {
        BGG_MONGODB_URI: `mongodb://${host}/?directConnection=true&replicaSet=rs0`,
        BGG_DATABASE_NAME: "board-game-organizer",
        BGG_CSV: csvPath,
      };
      await importDirectCsv(env);
      await importDirectCsv(env);
      expect(await catalog.countDocuments()).toBe(3);
      expect(await catalog.indexes()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "id_1", unique: true })]),
      );
      expect(await catalog.findOne({ id: 13 })).toMatchObject({
        name: "Catan",
        bayesAverage: 6.90146,
        isExpansion: false,
        image: "https://cf.geekdo-images.com/catan/full.jpg",
      });
      expect(await catalog.findOne({ id: 2 })).toMatchObject({ isExpansion: true });
      expect(await catalog.findOne({ id: 999 })).toMatchObject({ name: "Historical" });
      expect(await catalog.countDocuments({ thumbnail: { $exists: true } })).toBe(0);
      expect(await searchGames(preview, "Catan")).toHaveLength(1);
      expect(await searchGames(preview, "Azul")).toEqual([]);
    } finally {
      await preview.dropDatabase();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("BGG account collection snapshots on MongoDB replica set", () => {
  it("source-filters shared collections and common BGG IDs with both active epochs, legacy wishlist and Profile block guards", async () => {
    await seedUser(users, ACTOR, "actor@example.test");
    await seedUser(users, TARGET, "target@example.test");
    const repo = new BggAccountRepository(db),
      profiles = new ProfileService(db),
      identity = { id: 41, username: "provider-name-private", avatarUrl: null };
    expect((await profiles.profile(ACTOR, TARGET)).collection).toBeNull();
    const snapshot = await repo.stage(TARGET, identity);
    const xml =
      '<items><item objectid="987610" subtype="boardgame"><name>Alpha [title]</name><image>https://cf.geekdo-images.com/alpha.jpg</image><status own="0" wishlist="1"/><stats><rating value="8.5"/></stats></item><item objectid="987611" subtype="boardgame"><name>Beta</name><status own="1"/></item><item objectid="987612" subtype="boardgameexpansion"><name>Expansion</name><status own="0" wishlist="1"/></item></items>';
    await new BoardGamesRepository(db).bulkUpsert([{ id: 987610, name: "Alpha", image: null }]);
    const expansionXml =
      '<items><item objectid="987612" subtype="boardgameexpansion"><name>Expansion</name><status own="0" wishlist="1"/></item></items>';
    await repo.publish(TARGET, snapshot, identity, [
      ...parseBggCollection(xml, TARGET, snapshot),
      ...parseBggCollection(expansionXml, TARGET, snapshot, true),
    ]);
    expect((await db.collection(COLLECTIONS.BOARD_GAMES).findOne({ id: 987610 }))?.image).toBe(
      "https://cf.geekdo-images.com/alpha.jpg",
    );
    const meta = await profiles.profile(ACTOR, TARGET);
    expect(meta.collection).toEqual({
      snapshot,
      counts: { withoutExpansions: 2, withExpansions: 3, wishlist: 2 },
    });
    expect(JSON.stringify(meta)).not.toContain(identity.username);
    const viewer = await repo.stage(ACTOR, { ...identity, id: 42, username: "viewer" });
    await repo.publish(ACTOR, viewer, { ...identity, id: 42, username: "viewer" }, [
      ...parseBggCollection(
        xml.replace(
          '<item objectid="987611" subtype="boardgame"><name>Beta</name><status own="1"/></item>',
          "",
        ),
        ACTOR,
        viewer,
      ),
      ...parseBggCollection(expansionXml, ACTOR, viewer, true),
    ]);
    const input = { snapshot, query: "", limit: 1, commonSnapshot: viewer };
    const first = await repo.page(TARGET, input, ACTOR);
    expect(first.items.map((r) => r.id)).toEqual([987610]);
    expect(first.counts?.withExpansions).toBe(3);
    const second = await repo.page(TARGET, { ...input, cursor: first.nextCursor ?? "" }, ACTOR);
    expect(second.items.map((r) => r.id)).toEqual([987612]);
    expect(second.nextCursor).toBeNull();
    await expect(
      repo.page(TARGET, { ...input, types: "expansions", cursor: first.nextCursor ?? "" }, ACTOR),
    ).rejects.toMatchObject({ status: 400 });
    expect((await repo.page(TARGET, { ...input, types: "none" }, ACTOR)).items).toEqual([]);
    expect((await repo.page(TARGET, { ...input, query: "Beta" }, ACTOR)).items).toEqual([]);
    expect(
      (
        await repo.page(
          TARGET,
          { ...input, types: "games", wishlist: "true", query: "[title]" },
          ACTOR,
        )
      ).items.map((r) => r.id),
    ).toEqual([987610]);
    for (const types of ["games", "expansions", "none"] as const) {
      const wished = await repo.page(
        TARGET,
        { ...input, types, wishlist: "true", limit: 50 },
        ACTOR,
      );
      expect(wished.items.map((r) => r.id)).toEqual([987610, 987612]);
    }
    await db
      .collection(COLLECTIONS.BGG_COLLECTION_GAMES)
      .updateOne({ userId: TARGET, snapshot, gameId: 987610 }, { $unset: { wishlist: "" } });
    expect(
      (await repo.page(TARGET, { ...input, types: "games", wishlist: "true" }, ACTOR)).items[0]
        .wishlist,
    ).toBe(true);
    for (const reverse of [false, true]) {
      await transact(async (r) => {
        await r.block(reverse ? TARGET : ACTOR, reverse ? ACTOR : TARGET);
      });
      await expect(profiles.requireVisible(ACTOR, TARGET)).rejects.toMatchObject({ status: 404 });
      await expect(profiles.profile(ACTOR, TARGET)).rejects.toMatchObject({ status: 404 });
      await transact(async (r) => {
        await r.unblock(reverse ? TARGET : ACTOR, reverse ? ACTOR : TARGET);
      });
    }
    const replacement = await repo.stage(ACTOR, identity);
    await repo.publish(ACTOR, replacement, identity, []);
    await expect(repo.page(TARGET, input, ACTOR)).rejects.toMatchObject({ status: 409 });
    const targetNext = await repo.stage(TARGET, identity);
    await repo.publish(TARGET, targetNext, identity, []);
    expect((await profiles.profile(ACTOR, TARGET)).collection?.snapshot).toBe(targetNext);
    await expect(
      repo.page(TARGET, { ...input, commonSnapshot: undefined }, ACTOR),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("source-pages the complete personal collection, counts expansions and isolates owners/snapshots", async () => {
    const repository = new BggAccountRepository(db);
    const identity = { id: 41, username: "alice", avatarUrl: null };
    const snapshot = await repository.stage(ACTOR, identity);
    const base = parseBggCollection(
      '<items><item objectid="987601" subtype="boardgame"><name>Alpha [owned]</name><status own="0" wishlist="1"/><stats><rating value="8.5"><average value="3"/></rating></stats></item><item objectid="987602" subtype="boardgame"><name>Beta</name><status own="1"/></item></items>',
      ACTOR,
      snapshot,
    );
    const expansions = parseBggCollection(
      '<items><item objectid="987603" subtype="boardgame"><name>Expansion</name><status wishlist="1"/><stats><rating value="N/A"/></stats></item></items>',
      ACTOR,
      snapshot,
      true,
    );
    await repository.publish(ACTOR, snapshot, identity, [...base, ...expansions]);
    const counts = { withoutExpansions: 2, withExpansions: 3, wishlist: 2 };
    expect((await repository.get(ACTOR)).active?.counts).toEqual(counts);
    expect(await repository.games(ACTOR, snapshot).toArray()).toHaveLength(3);
    expect(await new BoardGamesRepository(db).findExistingIds([987601, 987602, 987603])).toEqual([
      987601, 987602,
    ]);
    const input = { snapshot, query: "", limit: 1 };
    const first = await repository.page(ACTOR, input);
    expect(first.items[0]).toMatchObject({
      id: 987601,
      userRating: 8.5,
      wishlist: true,
      isExpansion: false,
    });
    expect(first.counts).toEqual(counts);
    expect(JSON.stringify(first)).not.toContain("<stats>");
    const second = await repository.page(ACTOR, { ...input, cursor: first.nextCursor ?? "" });
    const third = await repository.page(ACTOR, { ...input, cursor: second.nextCursor ?? "" });
    expect(second.items[0].id).toBe(987602);
    expect(third.items[0]).toMatchObject({ id: 987603, isExpansion: true, userRating: null });
    expect(third.nextCursor).toBeNull();
    const filtered = await repository.page(ACTOR, { ...input, query: "[owned]" });
    expect(filtered.items.map((row) => row.id)).toEqual([987601]);
    expect(filtered.counts).toEqual(counts);
    await expect(repository.page(TARGET, input)).rejects.toMatchObject({ status: 404 });
    const next = await repository.stage(ACTOR, identity);
    await repository.failed(ACTOR, next);
    expect((await repository.get(ACTOR)).active?.counts).toEqual(counts);
    const replacement = await repository.stage(ACTOR, identity);
    await repository.publish(ACTOR, replacement, identity, []);
    await expect(repository.page(ACTOR, input)).rejects.toMatchObject({ status: 409 });
    expect((await repository.page(ACTOR, { ...input, snapshot: replacement })).counts).toEqual({
      withoutExpansions: 0,
      withExpansions: 0,
      wishlist: 0,
    });
  });
  it("publishes only complete snapshots, preserves old data on failure, and unlinks privately", async () => {
    const repository = new BggAccountRepository(db);
    const alice = { id: 41, username: "alice", avatarUrl: null };
    const first = await repository.stage(ACTOR, alice);
    const games = parseBggCollection(
      '<items><item objectid="987600" subtype="boardgame"><name>Rare Game</name><status own="0" wishlist="1"/></item></items>',
      ACTOR,
      first,
    );
    await repository.publish(ACTOR, first, alice, games);
    expect((await repository.get(ACTOR)).active?.username).toBe("alice");
    expect((await repository.get(ACTOR)).active?.counts).toEqual({
      withoutExpansions: 1,
      withExpansions: 1,
      wishlist: 1,
    });
    expect(await repository.games(ACTOR, first).toArray()).toHaveLength(1);
    expect(await new BoardGamesRepository(db).findExistingIds([987600])).toEqual([987600]);

    const bob = { id: 42, username: "bob", avatarUrl: null };
    const failed = await repository.stage(ACTOR, bob);
    await repository.failed(ACTOR, failed);
    expect((await repository.get(ACTOR)).active?.snapshot).toBe(first);
    expect((await repository.get(ACTOR)).pending).toBeNull();
    expect(await repository.games(ACTOR, failed).toArray()).toHaveLength(0);

    const empty = await repository.stage(ACTOR, bob);
    await repository.publish(ACTOR, empty, bob, []);
    expect((await repository.get(ACTOR)).active?.username).toBe("bob");
    expect(await repository.games(ACTOR, first).toArray()).toHaveLength(0);
    const session = client.startSession();
    try {
      await session.withTransaction(() => repository.unlink(ACTOR, session));
    } finally {
      await session.endSession();
    }
    expect((await repository.get(ACTOR)).active).toBeNull();
    expect(
      await db.collection(COLLECTIONS.BGG_COLLECTION_GAMES).countDocuments({ userId: ACTOR }),
    ).toBe(0);
    expect(await new BoardGamesRepository(db).findExistingIds([987600])).toEqual([987600]);
  });
});

describe("BGG covers on MongoDB replica set", () => {
  it("claims one global request for concurrent searches and persists the real thumbnail", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<items><item id="1"><thumbnail>https://cf.geekdo-images.com/azul/thumb.jpg</thumbnail><image>https://cf.geekdo-images.com/azul/full.jpg</image></item></items>',
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await new BoardGamesRepository(db).bulkUpsert([
        {
          id: 1,
          name: "Azul",
          yearPublished: 2017,
          average: 7.81,
          rank: 83,
          isExpansion: false,
        },
        { id: 2, name: "Azul expansion", yearPublished: 2020, isExpansion: true },
      ]);
      await Promise.all([searchGames(db, "Azul"), searchGames(db, "Azul")]);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(await searchGames(db, "Azul")).toEqual([
        {
          id: 1,
          name: "Azul",
          year: 2017,
          bayesAverage: null,
          average: 7.81,
          rank: 83,
          imageUrl: "https://cf.geekdo-images.com/azul/full.jpg",
        },
      ]);
      expect(await gameDetails(db, 2)).toMatchObject({ id: 2, name: "Azul expansion" });
      await db
        .collection(COLLECTIONS.BOARD_GAMES)
        .updateOne({ id: 2 }, { $set: { thumbnail: "https://cf.geekdo-images.com/old.jpg" } });
      expect(await new BoardGamesRepository(db).removeLegacyThumbnails()).toBe(1);
      expect(await db.collection(COLLECTIONS.BOARD_GAMES).findOne({ id: 2 })).not.toHaveProperty(
        "thumbnail",
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("match repositories on MongoDB replica set", () => {
  it("serializes public requests, reservations, admin approvals and removals without public discovery", async () => {
    await seedMatchDependencies();
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, isPublic: true, maxPlayers: 2 }),
    );
    const results = await Promise.allSettled(
      [TARGET, THIRD].map((userId) =>
        withMatchTransaction(({ service }) => service.requestJoin(userId, match.id), true),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const repository = new MatchInvitationsRepository(db);
    const [request] = await repository.listByMatch(match.id);
    expect(request).toMatchObject({ kind: "REQUEST", status: "PENDING" });
    expect(await repository.countByMatch(match.id)).toBe(1);
    const outsider = request.inviteeUserId === TARGET ? THIRD : TARGET;
    await expect(
      withMatchTransaction(({ service }) => service.detail(outsider, match.id)),
    ).rejects.toMatchObject({ status: 404 });
    expect(await withMatchTransaction(({ service }) => service.list(outsider))).toEqual([]);
    await expect(
      withMatchTransaction(({ service }) =>
        service.respond(request.inviteeUserId, request.id, "accept"),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withMatchTransaction(({ service }) =>
        service.approveJoinRequest(outsider, match.id, request.id),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await withMatchTransaction(({ service }) =>
      service.approveJoinRequest(ACTOR, match.id, request.id),
    );
    expect(await repository.findById(request.id)).toMatchObject({ status: "ACCEPTED" });
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, match.id, request.id),
    );
    await withMatchTransaction(({ service }) => service.requestJoin(outsider, match.id));
    expect(await repository.countByMatch(match.id)).toBe(1);
    const [next] = await repository.listByMatch(match.id);
    await withMatchTransaction(({ service }) => service.removeInvitation(ACTOR, match.id, next.id));
    expect(await repository.countByMatch(match.id)).toBe(0);
  });
  it("a duplicate request or competing admin invitation cannot consume the last slot twice; aborted requests roll back", async () => {
    await seedMatchDependencies();
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, isPublic: true, maxPlayers: 2 }),
    );
    await expect(
      withMatchTransaction(async ({ service }) => {
        await service.requestJoin(THIRD, match.id);
        throw new Error("abort join");
      }, true),
    ).rejects.toThrow("abort join");
    expect(await new MatchInvitationsRepository(db).countByMatch(match.id)).toBe(0);
    const results = await Promise.allSettled([
      withMatchTransaction(({ service }) => service.invite(ACTOR, match.id, TARGET)),
      withMatchTransaction(({ service }) => service.requestJoin(THIRD, match.id)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await new MatchInvitationsRepository(db).countByMatch(match.id)).toBe(1);
    const [record] = await new MatchInvitationsRepository(db).listByMatch(match.id);
    await expect(
      withMatchTransaction(({ service }) => service.requestJoin(record.inviteeUserId, match.id)),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("group matches stay private and only accepted group members may request or be approved", async () => {
    await seedMatchDependencies();
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, { name: "Public club", isPublic: true, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ groups }) =>
      groups.respond(TARGET, group.invitations[0].id, "accept"),
    );
    await expect(
      withMatchTransaction(({ service }) =>
        service.create(ACTOR, { ...matchInput, groupId: group.id, isPublic: true }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, groupId: group.id }),
    );
    expect(match.isPublic).toBe(false);
    await expect(
      withMatchTransaction(({ service }) => service.requestJoin(THIRD, match.id)),
    ).rejects.toMatchObject({ status: 409 });
    const request = await withMatchTransaction(({ service }) =>
      service.requestJoin(TARGET, match.id),
    );
    await withMatchTransaction(({ groups }) => groups.leave(TARGET, group.id));
    await expect(
      withMatchTransaction(({ service }) =>
        service.approveJoinRequest(ACTOR, match.id, request.id),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, match.id, request.id),
    );
  });
  it("registers exact results once and makes a terminated match immutable and visible to accepted players", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
        date: created.dates[0],
        gameId: created.gameIds[0],
      }),
    );
    const input = {
      lowerWins: true,
      entries: [
        { userId: ACTOR, score: "-2.5" },
        { userId: TARGET, score: null },
      ],
      tieBreaks: [],
    };
    expect(await new MatchesRepository(db).countPlayedByUser(ACTOR)).toBe(0);
    const registered = await withMatchTransaction(
      ({ service }) => service.registerResults(ACTOR, created.id, input),
      true,
    );
    expect((await new NotificationsRepository(db).list(TARGET, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "match_terminated" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .findOne({ recipientUserId: TARGET, kind: "match_terminated" }),
    ).toMatchObject({ recipientUserId: TARGET, actorUserId: ACTOR });
    expect((await new NotificationsRepository(db).list(ACTOR, 10)).notifications).toEqual([]);
    expect(registered).toMatchObject({
      status: "TERMINATED",
      results: {
        lowerWins: true,
        entries: [
          { userId: ACTOR, score: "-2.5", rank: 1 },
          { userId: TARGET, score: null, rank: null },
        ],
      },
    });
    expect(await new MatchesRepository(db).countPlayedByUser(ACTOR)).toBe(1);
    expect(await new MatchesRepository(db).countPlayedByUser(TARGET)).toBe(0);
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).resolves.toMatchObject({
      match: { status: "TERMINATED", results: registered.results },
      gameRatings: [],
    });
    await expect(
      withMatchTransaction(({ service }) => service.registerResults(ACTOR, created.id, input)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, created.id, "PLANNING")),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withMatchTransaction(({ service }) => service.deleteMatch(ACTOR, created.id)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      status: "TERMINATED",
    });
  });
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

  it("persists participant choices without exposing other users and clears them on departure", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    const invited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    await expect(
      withMatchTransaction(({ service }) =>
        service.setChoice(TARGET, created.id, { kind: "games", itemId: 342942, choice: "YES" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await withMatchTransaction(({ service }) => service.respond(TARGET, invited.id, "accept"));
    await withMatchTransaction(({ service }) =>
      service.setChoice(TARGET, created.id, { kind: "games", itemId: 342942, choice: "YES" }),
    );
    await withMatchTransaction(({ service }) =>
      service.setChoice(ACTOR, created.id, {
        kind: "dates",
        itemId: matchInput.dates[0],
        choice: "IF_NEEDED",
      }),
    );
    expect(
      (await withMatchTransaction(({ service }) => service.detail(TARGET, created.id))).choices,
    ).toEqual({ dates: {}, games: { "342942": "YES" }, locations: {} });
    expect(
      (await withMatchTransaction(({ service }) => service.detail(ACTOR, created.id))).choices
        ?.dates?.[String(Date.parse(matchInput.dates[0]))],
    ).toBe("IF_NEEDED");
    await withMatchTransaction(({ service }) => service.leave(TARGET, invited.id));
    expect(
      (await new MatchesRepository(db).findById(created.id))?.choices?.[TARGET],
    ).toBeUndefined();
  });

  it("confirms with shared votes, hides pending invitees, and restores their access on replan", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    const invitations = await new MatchInvitationsRepository(db).listByMatch(created.id);
    const accepted = invitations.find((invitation) => invitation.inviteeUserId === TARGET);
    if (!accepted) throw new Error("Expected target invitation");
    await withMatchTransaction(({ service }) => service.respond(TARGET, accepted.id, "accept"));
    for (const userId of [ACTOR, TARGET]) {
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "dates",
          itemId: matchInput.dates[0],
          choice: "YES",
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "games",
          itemId: matchInput.gameIds[0],
          choice: "IF_NEEDED",
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "locations",
          itemId: matchInput.locations[0].id,
          choice: userId === ACTOR ? "YES" : "IF_NEEDED",
        }),
      );
    }
    const dateKey = String(Date.parse(matchInput.dates[0]));
    const adminDetail = await withMatchTransaction(({ service }) =>
      service.detail(ACTOR, created.id),
    );
    expect(adminDetail.voteSummary).toMatchObject({
      dates: { [dateKey]: { yes: 2, no: 0, ifNeeded: 0, notChosen: 0 } },
      games: { [String(matchInput.gameIds[0])]: { yes: 0, no: 0, ifNeeded: 2, notChosen: 0 } },
      locations: { [matchInput.locations[0].id]: { yes: 1, no: 0, ifNeeded: 1, notChosen: 0 } },
      reasons: [],
      selectedDate: matchInput.dates[0],
      selectedLocationId: matchInput.locations[0].id,
      selectedGameId: matchInput.gameIds[0],
    });
    expect(
      (await withMatchTransaction(({ service }) => service.detail(TARGET, created.id))).voteSummary,
    ).toEqual(adminDetail.voteSummary);
    expect(
      (await withMatchTransaction(({ service }) => service.detail(THIRD, created.id))).voteSummary,
    ).toBeUndefined();
    const confirmed = await withMatchTransaction(
      ({ service }) => service.setStatus(ACTOR, created.id, "CREATED"),
      true,
    );
    expect(confirmed).toMatchObject({
      status: "CREATED",
      selectedDate: matchInput.dates[0],
      selectedGameId: matchInput.gameIds[0],
    });
    expect(confirmed.invitations).toHaveLength(1);
    expect(await withMatchTransaction(({ service }) => service.list(ACTOR))).toEqual([
      expect.objectContaining({ status: "CREATED", selectedGameName: "Ark Nova" }),
    ]);
    expect(await withMatchTransaction(({ service }) => service.list(THIRD))).toEqual([]);
    await expect(
      withMatchTransaction(({ service }) => service.detail(THIRD, created.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withMatchTransaction(({ service }) =>
        service.setChoice(TARGET, created.id, {
          kind: "games",
          itemId: matchInput.gameIds[0],
          choice: "YES",
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await new NotificationsRepository(db).list(TARGET, 10)).notifications.map(
        (item) => item.kind,
      ),
    ).toContain("match_created");
    expect((await new NotificationsRepository(db).list(THIRD, 10)).notifications).toEqual([]);
    await withMatchTransaction(
      ({ service }) => service.setStatus(ACTOR, created.id, "PLANNING"),
      true,
    );
    expect((await new MatchesRepository(db).findById(created.id))?.selectedDate).toBeUndefined();
    expect(
      (await withMatchTransaction(({ service }) => service.detail(THIRD, created.id))).match
        .invitations,
    ).toHaveLength(2);
    expect(
      (await new NotificationsRepository(db).list(TARGET, 10)).notifications.map(
        (item) => item.kind,
      ),
    ).toContain("match_replanning");
    const pending = invitations.find((invitation) => invitation.inviteeUserId === THIRD);
    if (!pending) throw new Error("Expected pending invitation");
    await withMatchTransaction(({ service }) => service.respond(THIRD, pending.id, "accept"));
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, created.id, "CREATED")),
    ).rejects.toMatchObject({ status: 409 });
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

    await new MatchesRepository(db).setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
      date: created.dates[0],
      gameId: created.gameIds[0],
    });
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
          locations: matchInput.locations,
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

  it("atomically updates match fields and reconciles invitations", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );

    const updated = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, created.id, {
        name: "Updated integration match",
        dates: ["2026-11-01T20:00:00.000Z"],
        minPlayers: 2,
        maxPlayers: 3,
        invitedUserIds: [THIRD],
        gameIds: [342942],
      }),
    );

    expect(updated).toMatchObject({
      name: "Updated integration match",
      invitedUserIds: [THIRD],
    });
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([
      expect.objectContaining({ inviteeUserId: THIRD, status: "PENDING" }),
    ]);
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
      { id: 266192, name: "Wingspan", yearPublished: 2019, isExpansion: false },
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

    await new MatchesRepository(db).setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
      date: created.dates[0],
      gameId: created.gameIds[0],
    });
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
    await users.setPreferredLanguage(TARGET, "it");
    // A later webhook/backfill default must not undo the app's choice.
    await seedUser(users, TARGET, "target@example.com");
    expect((await users.findById(TARGET))?.preferredLanguage).toBe("it");
    await notifications.notify({
      kind: "match_invitation",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
      matchName: "Catan",
      matchId: "507f1f77bcf86cd799439011",
    });

    expect(createdIds).toHaveLength(2);
    const italianInbox = await notifications.list(TARGET, 5, undefined, "it");
    expect(italianInbox.notifications.map((row) => row.title)).toEqual([
      "Nuovo invito a una partita",
      "Nuova richiesta di amicizia",
    ]);
    const englishInbox = await notifications.list(TARGET, 5, undefined, "en");
    expect(englishInbox.notifications.map((row) => row.title)).toEqual([
      "New match invitation",
      "New friend request",
    ]);
    expect(italianInbox.unreadCount).toBe(2);
    expect((await db.collection("notifications").findOne({ _id: createdIds[0] }))?.title).toBe(
      "New friend request",
    );
    const firstPage = await notifications.list(TARGET, 1);
    expect(firstPage).toMatchObject({ unreadCount: 2 });
    expect(firstPage.notifications[0]).toMatchObject({
      title: "Nuovo invito a una partita",
      href: "/matches/507f1f77bcf86cd799439011",
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
    expect(
      (await notifications.deleteOne(ACTOR, firstPage.notifications[0]?.id ?? "")).deletedCount,
    ).toBe(0);
    expect(
      (await notifications.deleteOne(TARGET, firstPage.notifications[0]?.id ?? "")).deletedCount,
    ).toBe(1);
    expect((await notifications.list(TARGET, 5)).notifications).toHaveLength(1);
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

  it("bulk-deletes the entire recipient inbox, retaining other inboxes, subscriptions and later arrivals", async () => {
    const notifications = new NotificationsRepository(db);
    await notifications.notifyMany([
      ...Array.from({ length: 27 }, () => ({
        kind: "friend_request" as const,
        recipientUserId: TARGET,
        actorUserId: ACTOR,
      })),
      { kind: "friend_request", recipientUserId: ACTOR, actorUserId: TARGET },
    ]);
    const first = await notifications.list(TARGET, 20);
    expect(first.notifications).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    await notifications.markRead(TARGET, first.notifications[0].id);
    const subscriptions = new PushSubscriptionsRepository(db);
    await subscriptions.upsert(TARGET, "token-1234567890123456", "android", "en");
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        expect(
          (await new NotificationsRepository(db, session).deleteAll(TARGET)).deletedCount,
        ).toBe(27);
      });
    } finally {
      await session.endSession();
    }
    expect(await notifications.list(TARGET, 20)).toEqual({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
    });
    expect((await notifications.list(ACTOR, 20)).notifications).toHaveLength(1);
    expect(await subscriptions.listByUser(TARGET)).toHaveLength(1);
    expect((await notifications.deleteAll(TARGET)).deletedCount).toBe(0);
    await notifications.notify({
      kind: "friend_request",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
    });
    expect((await notifications.list(TARGET, 20)).notifications).toHaveLength(1);
  });

  it("rolls back bulk inbox deletion with its MongoDB transaction", async () => {
    const notifications = new NotificationsRepository(db);
    await notifications.notify({
      kind: "friend_request",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
    });
    const session = client.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          expect(
            (await new NotificationsRepository(db, session).deleteAll(TARGET)).deletedCount,
          ).toBe(1);
          throw new Error("rollback deletion");
        }),
      ).rejects.toThrow("rollback deletion");
    } finally {
      await session.endSession();
    }
    expect((await notifications.list(TARGET, 20)).notifications).toHaveLength(1);
    expect((await notifications.list(TARGET, 20)).unreadCount).toBe(1);
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

  it("keeps existing match access and invitations after a block until the player leaves", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await new RelationshipService(relationships).block(ACTOR, TARGET);
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).resolves.toMatchObject({
      match: {
        invitations: [expect.objectContaining({ inviteeUserId: TARGET, status: "PENDING" })],
      },
    });
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await expect(
      withMatchTransaction(({ service }) => service.detail(ACTOR, created.id)),
    ).resolves.toMatchObject({
      invitedPlayers: [
        expect.objectContaining({
          id: TARGET,
          invitation: expect.objectContaining({ status: "ACCEPTED" }),
        }),
      ],
    });
    await withMatchTransaction(({ service }) => service.leave(TARGET, created.invitations[0].id));
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, TARGET)),
    ).rejects.toMatchObject({ status: 404 });
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

describe("group membership and OpenSkill on the MongoDB replica set", () => {
  it("allows only admin to remove pending or accepted group invitations by id", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, {
        name: "Board Gamers",
        isPublic: false,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    const [pending, accepted] = group.invitations;
    await withMatchTransaction(({ groups }) => groups.respond(THIRD, accepted.id, "accept"));
    await expect(
      withMatchTransaction(({ groups }) => groups.removeInvitation(TARGET, pending.id)),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    await withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, pending.id));
    await withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, accepted.id));
    const updated = await withMatchTransaction(({ groups }) => groups.detail(ACTOR, group.id));
    expect(updated.invitations).toEqual([]);
    expect(updated.memberCount).toBe(1);
    await expect(
      withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, pending.id)),
    ).rejects.toEqual(expect.objectContaining({ status: 404 }));
  });
  it("counts eligible physical table withdrawals/shared wins without backfilling legacy Matches", async () => {
    const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
    await db.collection(COLLECTIONS.MATCHES).insertMany([
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a212",
        groupId,
        status: "TERMINATED",
        selectedGameId: 42,
        results: {
          entries: [
            { userId: ACTOR, score: "5", rank: 1 },
            { userId: TARGET, score: "5", rank: 1 },
            { userId: THIRD, score: null, rank: 3 },
          ],
        },
      },
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a213",
        groupId,
        status: "TERMINATED",
        selectedGameId: 42,
        results: {
          entries: [
            { userId: ACTOR, score: "6", rank: 1 },
            { userId: TARGET, score: null, rank: 2 },
          ],
        },
      },
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a214",
        groupId,
        status: "PLANNING",
        selectedGameId: 99,
      },
    ]);
    const standings = new GroupLeaderboardRepository(db);
    expect(await standings.games(groupId)).toEqual({ games: [], nextCursor: null });
    expect((await standings.players(groupId, 42, 0, 25)).rows).toEqual([]);
    const eventId = "1f454adb-43e3-47ad-8c29-57b97a55a230",
      planningId = "1f454adb-43e3-47ad-8c29-57b97a55a231";
    await db.collection(COLLECTIONS.EVENTS).insertMany([
      { id: eventId, groupId, status: "TERMINATED" },
      { id: planningId, groupId, status: "PLANNING" },
    ]);
    const finishers = [
      { userId: ACTOR, score: "5", rank: 1 },
      { userId: TARGET, score: "5", rank: 1 },
      { userId: THIRD, score: null, rank: 3 },
    ];
    const table = (index: number, entries: typeof finishers) => ({
      id: `1f454adb-43e3-47ad-8c29-57b97a55a24${index}`,
      eventId,
      order: index,
      name: `Physical ${index}`,
      rankingEnabled: true,
      confirmed: { gameId: 42, playerIds: entries.map((row) => row.userId) },
      results: { entries },
    });
    await db.collection(COLLECTIONS.EVENT_TABLES).insertMany([
      table(1, finishers),
      table(2, [
        { userId: ACTOR, score: "6", rank: 1 },
        { userId: THIRD, score: "2", rank: 2 },
        { userId: TARGET, score: null, rank: 3 },
      ]),
      table(3, [
        { userId: ACTOR, score: "6", rank: 1 },
        { userId: TARGET, score: null, rank: 2 },
      ]),
      table(
        4,
        finishers.map((row) => ({ ...row, score: null })),
      ),
      { ...table(5, finishers), rankingEnabled: false },
      { ...table(6, finishers), eventId: planningId },
      { ...table(7, finishers), removedAt: new Date().toISOString() },
    ]);
    expect(await standings.games(groupId)).toEqual({
      games: [{ id: 42, name: "42", imageUrl: null }],
      nextCursor: null,
    });
    expect((await standings.players(groupId, 42, 0, 25)).rows).toMatchObject([
      { _id: ACTOR, gamesPlayed: 2, gamesWon: 2, nd: 0 },
      { _id: TARGET, gamesPlayed: 2, gamesWon: 1, nd: 1 },
      { _id: THIRD, gamesPlayed: 2, gamesWon: 0, nd: 1 },
    ]);
    expect(await db.collection(COLLECTIONS.MATCHES).countDocuments()).toBe(3);
  });

  it("projects current creator, moderator and accepted-member ranking roles without restoring former or pending membership", async () => {
    const groupId = "3f454adb-43e3-47ad-8c29-57b97a55a200";
    const eventId = "3f454adb-43e3-47ad-8c29-57b97a55a201";
    const ids = ["role_admin", "role_moderator", "role_member", "role_former", "role_pending"];
    await db
      .collection(COLLECTIONS.GROUPS)
      .insertOne({ id: groupId, type: "PRIVATE", adminUserId: ids[0] });
    await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertMany([
      { id: "role_moderator", groupId, userId: ids[1], status: "ACCEPTED", role: "MODERATOR" },
      { id: "role_member", groupId, userId: ids[2], status: "ACCEPTED", role: "MEMBER" },
      {
        id: "role_former",
        groupId: "other-group",
        userId: ids[3],
        status: "ACCEPTED",
        role: "MODERATOR",
      },
      { id: "role_pending", groupId, userId: ids[4], status: "PENDING", role: "MODERATOR" },
    ]);
    await db
      .collection(COLLECTIONS.EVENTS)
      .insertOne({ id: eventId, groupId, status: "TERMINATED" });
    await db.collection(COLLECTIONS.EVENT_TABLES).insertOne({
      id: "3f454adb-43e3-47ad-8c29-57b97a55a202",
      eventId,
      rankingEnabled: true,
      confirmed: { gameId: 42, playerIds: ids },
      results: {
        entries: ids.map((userId, index) => ({
          userId,
          score: String(10 - index),
          rank: index + 1,
        })),
      },
    });
    const standings = new GroupLeaderboardRepository(db);
    const read = async () =>
      new Map(
        (await standings.players(groupId, 42, 0, 25)).rows.map((row) => [
          row._id,
          { role: row.groupRole, left: row.left },
        ]),
      );
    expect(await read()).toEqual(
      new Map([
        [ids[0], { role: "ADMIN", left: false }],
        [ids[1], { role: "MODERATOR", left: false }],
        [ids[2], { role: "MEMBER", left: false }],
        [ids[3], { role: null, left: true }],
        [ids[4], { role: null, left: true }],
      ]),
    );
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId, userId: ids[1] }, { $set: { role: "MEMBER" } });
    await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).deleteOne({ groupId, userId: ids[2] });
    expect((await read()).get(ids[1])).toEqual({ role: "MEMBER", left: false });
    expect((await read()).get(ids[2])).toEqual({ role: null, left: true });
  });

  it("accepts invited friends, allows group member match invite after unfriend, and keeps group history after archive", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const group = await withMatchTransaction(
      ({ groups }) =>
        groups.create(ACTOR, {
          name: "Board Gamers",
          isPublic: false,
          invitedUserIds: [TARGET, THIRD],
        }),
      true,
    );
    expect(group.memberCount).toBe(1);
    expect(
      (await withMatchTransaction(({ groups }) => groups.list(TARGET)))[0].memberProfiles.map(
        (person) => person.id,
      ),
    ).toEqual([ACTOR]);
    expect((await new NotificationsRepository(db).list(TARGET, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "group_invitation" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .findOne({ recipientUserId: TARGET, kind: "group_invitation" }),
    ).toMatchObject({ recipientUserId: TARGET, actorUserId: ACTOR });
    const inviteTo = (userId: string) => {
      const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
      if (!invitation) throw new Error("Missing group invitation");
      return invitation.id;
    };
    await withMatchTransaction(
      ({ groups }) => groups.respond(TARGET, inviteTo(TARGET), "accept"),
      true,
    );
    await withMatchTransaction(
      ({ groups }) => groups.respond(THIRD, inviteTo(THIRD), "accept"),
      true,
    );
    expect(
      (await withMatchTransaction(({ groups }) => groups.list(TARGET)))[0].memberProfiles
        .map((person) => person.id)
        .sort(),
    ).toEqual([ACTOR, TARGET, THIRD].sort());
    expect((await new NotificationsRepository(db).list(ACTOR, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "group_invitation_accepted" }),
      expect.objectContaining({ kind: "group_invitation_accepted" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .find({ recipientUserId: ACTOR, kind: "group_invitation_accepted" })
        .sort({ createdAt: -1, _id: -1 })
        .toArray(),
    ).toEqual([
      expect.objectContaining({ recipientUserId: ACTOR, actorUserId: THIRD }),
      expect.objectContaining({ recipientUserId: ACTOR, actorUserId: TARGET }),
    ]);
    expect((await withMatchTransaction(({ groups }) => groups.list(ACTOR)))[0].memberCount).toBe(3);
    await relationships.unfriend(ACTOR, TARGET);
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        groupId: group.id,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, match.invitations[1].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    await withMatchTransaction(({ groups }) => groups.archive(ACTOR, group.id));
    expect(await withMatchTransaction(({ groups }) => groups.list(ACTOR))).toEqual([]);
    const createdDetail = await withMatchTransaction(({ service }) =>
      service.detail(TARGET, match.id),
    );
    expect(createdDetail).not.toHaveProperty("currentGameRatings");
    const createdLeaderboard = await withMatchTransaction(({ service }) =>
      service.leaderboard(TARGET, match.id, match.gameIds[0]),
    );
    expect(createdLeaderboard.ratings).toEqual([
      { userId: ACTOR, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
      { userId: TARGET, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
      { userId: THIRD, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
    ]);
    const results = await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, match.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "5" },
          { userId: TARGET, score: "2" },
          { userId: THIRD, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(results.status).toBe("TERMINATED");
    const ratings = new RatingsRepository(db);
    const global = await ratings.leaderboard(match.gameIds[0], "GLOBAL", null);
    const scoped = await ratings.leaderboard(match.gameIds[0], "GROUP", group.id);
    const standings = new GroupLeaderboardRepository(db);
    // Historical Match outcomes remain stored, but unified group statistics read physical Tables only.
    expect(await standings.games(group.id)).toEqual({ games: [], nextCursor: null });
    const first = await standings.players(group.id, match.gameIds[0], 0, 1);
    expect(first.rows).toEqual([]);
    expect(first.nextCursor).toBeNull();
    const groupStats = await ratings.matchStats([ACTOR, TARGET, THIRD], match.gameIds[0], group.id);
    const globalStats = await ratings.matchStats([ACTOR, TARGET, THIRD], match.gameIds[0], null);
    expect(groupStats).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 1, gamesWon: 1, nd: 0 }],
        [TARGET, { gamesPlayed: 1, gamesWon: 0, nd: 0 }],
        [THIRD, { gamesPlayed: 1, gamesWon: 0, nd: 1 }],
      ]),
    );
    expect(globalStats).toEqual(groupStats);
    expect(
      (
        await withMatchTransaction(({ service }) =>
          service.leaderboard(TARGET, match.id, match.gameIds[0]),
        )
      ).ratings.find((row) => row.userId === THIRD),
    ).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 0,
      nd: 1,
    });
    expect((await standings.players(group.id, match.gameIds[0], 1, 25)).rows).toEqual([]);
    const gameRatings = await ratings.forMatch(match.id, match.gameIds[0]);
    const current = await ratings.currentForPlayers([ACTOR, TARGET, THIRD], match.gameIds[0]);
    const groupCurrent = await ratings.currentForPlayers(
      [ACTOR, TARGET, THIRD, "new_player"],
      match.gameIds[0],
      group.id,
    );
    expect(groupCurrent.find((entry) => entry.userId === ACTOR)?.score).toBeCloseTo(
      500 + (scoped.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? Number.NaN),
    );
    expect(groupCurrent.find((entry) => entry.userId === "new_player")).toEqual({
      userId: "new_player",
      score: 500,
      provisional: true,
    });
    await db.collection(COLLECTIONS.PLAYER_RATINGS).insertOne({
      userId: "global_only",
      gameId: match.gameIds[0],
      scope: "GLOBAL",
      groupId: null,
      mu: 30,
      sigma: 3,
      gamesPlayed: 6,
      conservativeScore: 21,
      updatedAt: new Date().toISOString(),
    });
    expect(await ratings.currentForPlayers(["global_only"], match.gameIds[0], group.id)).toEqual([
      { userId: "global_only", score: 500 + 30 - 3 * (((25 / 3) * 200) / 350), provisional: true },
    ]);
    expect(current.find((entry) => entry.userId === ACTOR)?.score).toBeCloseTo(
      500 + (global.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? NaN),
    );
    expect(gameRatings).toHaveLength(3);
    expect(gameRatings.find((entry) => entry.userId === ACTOR)).toEqual({
      userId: ACTOR,
      score: 500 + (global.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? NaN),
      delta: global.find((entry) => entry.userId === ACTOR)?.conservativeScore,
      provisional: true,
    });
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, match.id)),
    ).resolves.toMatchObject({
      gameRatings,
    });
    expect(global).toHaveLength(3);
    expect(scoped).toHaveLength(3);
    expect(global.every((row) => row.gamesPlayed === 1 && row.provisional)).toBe(true);
    expect(scoped.find((row) => row.userId === THIRD)?.mu).toBeLessThan(25);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(6);
    await expect(
      withMatchTransaction(({ service }) =>
        service.registerResults(ACTOR, match.id, {
          lowerWins: false,
          entries: [{ userId: ACTOR, score: "5" }],
          tieBreaks: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(6);
    const ungrouped = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [THIRD] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, ungrouped.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(ungrouped.id, ACTOR, "PLANNING", "CREATED", {
        date: ungrouped.dates[0],
        gameId: ungrouped.gameIds[0],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, ungrouped.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "1" },
          { userId: THIRD, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(await ratings.matchStats([ACTOR, THIRD], match.gameIds[0], null)).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 2, gamesWon: 2, nd: 0 }],
        [THIRD, { gamesPlayed: 2, gamesWon: 0, nd: 2 }],
      ]),
    );
    expect(await ratings.matchStats([ACTOR, THIRD], match.gameIds[0], group.id)).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 1, gamesWon: 1, nd: 0 }],
        [THIRD, { gamesPlayed: 1, gamesWon: 0, nd: 1 }],
      ]),
    );
  });

  it("edits a planning match group atomically, checks membership again at confirmation, and locks it when created", async () => {
    await seedMatchDependencies();
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, { name: "Tabletop Club", isPublic: false, invitedUserIds: [TARGET] }),
    );
    const invitation = group.invitations[0];
    if (!invitation) throw new Error("Missing group invitation");
    await withMatchTransaction(({ groups }) => groups.respond(TARGET, invitation.id, "accept"));
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    const linked = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, match.id, { groupId: group.id, invitedUserIds: [TARGET] }),
    );
    expect(linked.groupId).toBe(group.id);
    await withMatchTransaction(({ groups }) => groups.leave(TARGET, group.id));
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, match.id, "CREATED")),
    ).rejects.toMatchObject({
      status: 409,
      message: "Every participant must be an accepted group member",
    });
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, match.id, { groupId: group.id, invitedUserIds: [TARGET] }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const unlinked = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, match.id, { groupId: null, invitedUserIds: [TARGET] }),
    );
    expect(unlinked.groupId).toBeUndefined();
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, match.id, { groupId: group.id })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("initializes first group game from pre-match global snapshots and then evolves independently", async () => {
    await seedMatchDependencies();
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, { name: "Local Friends", isPublic: true, invitedUserIds: [TARGET] }),
    );
    const invitation = group.invitations[0];
    if (!invitation) throw new Error("Missing group invitation");
    await withMatchTransaction(({ groups }) => groups.respond(TARGET, invitation.id, "accept"));
    const play = async (groupId?: string) => {
      const match = await withMatchTransaction(({ service }) =>
        service.create(ACTOR, {
          ...matchInput,
          ...(groupId ? { groupId } : {}),
          invitedUserIds: [TARGET],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.respond(TARGET, match.invitations[0].id, "accept"),
      );
      await withMatchTransaction(({ matches }) =>
        matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
          date: match.dates[0],
          gameId: match.gameIds[0],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.registerResults(ACTOR, match.id, {
          lowerWins: false,
          entries: [
            { userId: ACTOR, score: "2" },
            { userId: TARGET, score: "1" },
          ],
          tieBreaks: [],
        }),
      );
      return match;
    };
    const first = await play();
    const firstGlobal = await db.collection(COLLECTIONS.PLAYER_RATINGS).findOne({
      userId: ACTOR,
      gameId: matchInput.gameIds[0],
      scope: "GLOBAL",
      groupId: null,
    });
    if (!firstGlobal) throw new Error("Missing global rating");
    expect(firstGlobal.mu).toBeGreaterThan(25);
    const second = await play(group.id);
    const groupEvent = await db.collection(COLLECTIONS.RATING_EVENTS).findOne({
      matchId: second.id,
      userId: ACTOR,
      scope: "GROUP",
      groupId: group.id,
    });
    if (!groupEvent) throw new Error("Missing group rating event");
    expect(groupEvent.before.mu).toBeCloseTo(firstGlobal.mu);
    expect(groupEvent.before.sigma).toBeCloseTo(
      Math.min(25 / 3, Math.max(((25 / 3) * 200) / 350, firstGlobal.sigma * 1.5)),
    );
    expect(groupEvent.before.gamesPlayed).toBe(0);
    expect(groupEvent.after.gamesPlayed).toBe(1);
    const globalEvent = await db.collection(COLLECTIONS.RATING_EVENTS).findOne({
      matchId: second.id,
      userId: ACTOR,
      scope: "GLOBAL",
      groupId: null,
    });
    expect(globalEvent?.before.mu).toBeCloseTo(firstGlobal.mu);
    expect(globalEvent?.after.gamesPlayed).toBe(2);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: first.id }),
    ).toBe(2);
  });

  it("applies concurrent result submissions once, without duplicate rating events", async () => {
    await seedMatchDependencies();
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    const input = {
      lowerWins: false,
      entries: [
        { userId: ACTOR, score: "5" },
        { userId: TARGET, score: "3" },
      ],
      tieBreaks: [],
    };
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        withMatchTransaction(({ service }) => service.registerResults(ACTOR, match.id, input)),
      ),
    );
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(2);
    const ratings = await db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .find({ gameId: matchInput.gameIds[0] })
      .toArray();
    expect(ratings).toHaveLength(2);
    expect(ratings.map((row) => row.gamesPlayed)).toEqual([1, 1]);
  });

  it("recalculates from fresh ratings when distinct matches for same players finish concurrently", async () => {
    await seedMatchDependencies();
    const matches = [];
    for (let index = 0; index < 2; index++) {
      const match = await withMatchTransaction(({ service }) =>
        service.create(ACTOR, {
          ...matchInput,
          name: `Ranking round ${index + 1}`,
          invitedUserIds: [TARGET],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.respond(TARGET, match.invitations[0].id, "accept"),
      );
      await withMatchTransaction(({ matches: repository }) =>
        repository.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
          date: match.dates[0],
          gameId: match.gameIds[0],
        }),
      );
      matches.push(match);
    }
    await Promise.all(
      matches.map((match) =>
        withMatchTransaction(({ service }) =>
          service.registerResults(ACTOR, match.id, {
            lowerWins: false,
            entries: [
              { userId: ACTOR, score: "2" },
              { userId: TARGET, score: "1" },
            ],
            tieBreaks: [],
          }),
        ),
      ),
    );
    const ratings = await db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .find({ gameId: matchInput.gameIds[0] })
      .toArray();
    expect(ratings).toHaveLength(2);
    expect(ratings.map((row) => row.gamesPlayed)).toEqual([2, 2]);
    const events = await db.collection(COLLECTIONS.RATING_EVENTS).find({ userId: ACTOR }).toArray();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.before.gamesPlayed).sort()).toEqual([0, 1]);
    const second = events.find((event) => event.before.gamesPlayed === 1);
    if (!second) throw new Error("Missing subsequent rating event");
    const change = (await new RatingsRepository(db).forMatch(second.matchId, second.gameId)).find(
      (entry) => entry.userId === ACTOR,
    );
    const score = second.after.mu - 3 * second.after.sigma;
    expect(change?.score).toBeCloseTo(500 + score);
    expect(change?.delta).toBeCloseTo(score - (second.before.mu - 3 * second.before.sigma));
    expect(change?.provisional).toBe(true);
  });

  it("does not create any rating or event when only one player scored", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
        date: created.dates[0],
        gameId: created.gameIds[0],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, created.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "1" },
          { userId: TARGET, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(await db.collection(COLLECTIONS.PLAYER_RATINGS).countDocuments()).toBe(0);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
  });
});
