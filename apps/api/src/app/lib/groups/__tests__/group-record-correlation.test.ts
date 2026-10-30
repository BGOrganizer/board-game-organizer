import type { CreateGroupRecordInput, GroupRecord } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { GroupRecordsService } from "../group-records.service";

// Service protocol tests; provider verification and Mongo transaction acceptance are separate suites.
vi.mock("../../locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (location) => location),
}));
const owner = "user_owner",
  clientRequestId = "99999999-9999-4999-8999-999999999999";
const logo = "88888888-8888-4888-8888-888888888888";
const location = {
  id: logo,
  name: "Club venue",
  address: "Via Roma 1",
  latitude: 41.9,
  longitude: 12.5,
  timeZone: "Europe/Rome",
};
function setup() {
  const records = new Map<string, GroupRecord>();
  const repo = {
    create: vi.fn(async (row: GroupRecord) => {
      records.set(row.id, structuredClone(row));
    }),
    save: vi.fn(async (row: GroupRecord) => {
      records.set(row.id, structuredClone(row));
    }),
    find: vi.fn(async (id: string) => structuredClone(records.get(id) ?? null)),
    lock: vi.fn(async (id: string) => structuredClone(records.get(id) ?? null)),
    membership: vi.fn(async () => null),
    ban: vi.fn(async () => null),
    countMembers: vi.fn(async () => 0),
    countEvents: vi.fn(async () => 0),
    list: vi.fn(async () => [...records.values()].map((row) => structuredClone(row))),
  };
  const assets = {
    claim: vi.fn(async () => true),
    find: vi.fn(async () => ({ thumbnailBase64: "AAAA" })),
    expireUnused: vi.fn(async () => undefined),
  };
  const users = { moderatorIds: vi.fn(async () => []) };
  const relationships = { isFriend: vi.fn(async () => true), isBlocked: vi.fn(async () => false) };
  const notifications = { notifyMany: vi.fn(async () => []) };
  const service = new GroupRecordsService(
    repo as never,
    assets as never,
    users as never,
    relationships as never,
    notifications as never,
    vi.fn(async () => undefined),
    vi.fn(async () => undefined),
    {} as never,
  );
  return { service, repo, records };
}

describe("Group creation correlation, not identity or idempotency", () => {
  it.each(["PRIVATE", "PUBLIC"] as const)(
    "persists/echoes optional correlation and preserves it on %s edits without replacing the server ID",
    async (type) => {
      const f = setup();
      const base = { name: "Club group", invitedUserIds: [], clientRequestId };
      const input: CreateGroupRecordInput =
        type === "PUBLIC" ? { ...base, type, logoAssetId: logo, location } : { ...base, type };
      const created = await f.service.save(owner, input);
      expect(created.clientRequestId).toBe(clientRequestId);
      expect(created.id).not.toBe(clientRequestId);
      expect(f.records.get(created.id)).toMatchObject({
        id: created.id,
        adminUserId: owner,
        clientRequestId,
      });
      expect((await f.service.detail(owner, created.id)).clientRequestId).toBe(clientRequestId);
      expect((await f.service.list(owner, "mine", { limit: 20 })).items[0].clientRequestId).toBe(
        clientRequestId,
      );
      const {
        type: _type,
        invitedUserIds: _invites,
        clientRequestId: _request,
        ...revision
      } = input;
      const edited = await f.service.save(
        owner,
        { ...revision, name: "Edited club", version: created.version },
        created.id,
      );
      expect(edited).toMatchObject({
        id: created.id,
        clientRequestId,
        name: "Edited club",
        version: 2,
      });
      expect(f.records.get(created.id)?.clientRequestId).toBe(clientRequestId);
      expect(f.repo.create).toHaveBeenCalledTimes(1);
      expect(f.repo.save).toHaveBeenCalledTimes(1);
    },
  );
});
