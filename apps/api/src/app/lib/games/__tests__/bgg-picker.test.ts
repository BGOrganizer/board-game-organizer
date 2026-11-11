import { bggPickerQuerySchema } from "@board-game-organizer/schemas";
import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "../../community.error";
import { bggPickerPage } from "../bgg-picker";

const mocks = vi.hoisted(() => ({
  exclusions: vi.fn(),
  scope: vi.fn(),
  visible: vi.fn(),
  search: vi.fn(),
  hydrate: vi.fn(),
}));
vi.mock("@/app/lib/community/record-services", () => ({
  recordServices: () => ({
    events: {
      proposalPickerExclusions: mocks.exclusions,
      collectionPickerScope: mocks.scope,
    },
  }),
}));
vi.mock("@/app/lib/profile/profile.service", () => ({
  ProfileService: class {
    requireVisible = mocks.visible;
  },
}));
vi.mock("@/app/lib/games/bgg", async (original) => ({
  ...(await original<typeof import("../bgg")>()),
  searchGames: mocks.search,
  hydrateGames: mocks.hydrate,
}));
const event = "11111111-1111-4111-8111-111111111111";
const table = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const card = (id: number) => ({ id, name: `Game ${id}`, year: null, imageUrl: null });
const row = (id: number, imageUrl: string | null = null) => ({
  _id: id,
  name: `Game ${id}`,
  year: 2020,
  imageUrl,
  xml: "PRIVATE XML",
  userRating: 10,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exclusions.mockResolvedValue([99, 98, 99]);
  mocks.scope.mockResolvedValue({ eventVersion: 3, userIds: ["seated", "queue"] });
  mocks.visible.mockResolvedValue({ clerkId: "visible" });
  mocks.search.mockResolvedValue([]);
  mocks.hydrate.mockResolvedValue(undefined);
});

function setup() {
  const state = {
    snapshots: [
      { userId: "viewer", active: { snapshot: "own", username: "PRIVATE PROVIDER" } },
      { userId: "seated", active: { snapshot: "seat", username: "PRIVATE PROVIDER" } },
      { userId: "queue", active: { snapshot: "queue", username: "PRIVATE PROVIDER" } },
    ],
    rows: [row(1), row(2)],
    catalog: [
      {
        ...card(1),
        image: "https://cf.geekdo-images.com/cover.png",
        minPlayers: 2,
        maxPlayers: 6,
        minPlayMinutes: 30,
        maxPlayMinutes: 45,
      },
    ],
  };
  const accountFind = vi.fn((filter: { userId: { $in: string[] } }) => ({
    toArray: async () =>
      state.snapshots.filter((account) => filter.userId.$in.includes(account.userId)),
  }));
  const aggregate = vi.fn((_pipeline: unknown[]) => ({ toArray: async () => state.rows }));
  const catalogFind = vi.fn(() => ({ toArray: async () => state.catalog }));
  const sessions: {
    withTransaction: ReturnType<typeof vi.fn>;
    endSession: ReturnType<typeof vi.fn>;
  }[] = [];
  const startSession = vi.fn(() => {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
      endSession: vi.fn(async () => undefined),
    };
    sessions.push(session);
    return session;
  });
  const db = {
    client: { startSession },
    collection: (name: string) => {
      if (name === "bggAccounts") return { find: accountFind };
      if (name === "bggCollectionGames") return { aggregate };
      if (name === "boardGames") return { find: catalogFind };
      throw new Error(`Unexpected unit collection: ${name}`);
    },
  };
  const input = (change: Record<string, unknown> = {}) => bggPickerQuerySchema.parse({ ...change });
  const read = (change: Record<string, unknown> = {}, actor = "viewer") =>
    bggPickerPage(db as never, actor, input(change));
  return { state, db, accountFind, aggregate, catalogFind, sessions, startSession, input, read };
}

it("defaults neither chip to local catalog, observes the four-character minimum and ignores the obsolete Search toggle", async () => {
  const f = setup();
  expect((await f.read({ query: "Azu", search: "1" })).items).toEqual([]);
  expect(mocks.search).not.toHaveBeenCalled();
  mocks.search.mockResolvedValue([card(1), card(2)]);
  const result = await f.read({ query: "Azul", search: "0", limit: 1 });
  expect(result.items).toEqual([{ ...card(1), source: "search" }]);
  expect(result.nextCursor).toBeTruthy();
  expect(mocks.search).toHaveBeenCalledWith(f.db, "Azul", 0, 2, []);
  expect(f.accountFind).not.toHaveBeenCalled();
  expect(f.startSession).not.toHaveBeenCalled();
});

it("pages only the chosen own snapshot, never adds catalog search or personal provider fields", async () => {
  const f = setup();
  const result = await f.read({ collection: "1", query: "Ga(me)+", limit: 1 });
  expect(result.items).toEqual([
    {
      id: 1,
      name: "Game 1",
      year: 2020,
      imageUrl: "https://cf.geekdo-images.com/cover.png",
      average: null,
      rank: null,
      averageWeight: null,
      bayesAverage: null,
      minPlayers: 2,
      maxPlayers: 6,
      minPlayMinutes: 30,
      maxPlayMinutes: 45,
      source: "collection",
    },
  ]);
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.visible).not.toHaveBeenCalled();
  const pipeline = f.aggregate.mock.calls[0][0] as Record<string, any>[];
  expect(pipeline[0].$match.$or).toEqual([{ userId: "viewer", snapshot: "own" }]);
  expect(pipeline[0].$match.name.test("Ga(me)+")).toBe(true);
  expect(pipeline[0].$match.name.test("Game")).toBe(false);
  expect(pipeline.findIndex((stage) => stage.$group)).toBeLessThan(
    pipeline.findIndex((stage) => "$skip" in stage),
  );
  const cursor = JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString());
  expect(cursor).toEqual({ offset: 1, scope: result.sourceEpoch });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|snapshot|viewer|userRating|xml/);
  await f.read({ collection: "1", query: "Ga(me)+", limit: 1, cursor: result.nextCursor });
  expect(f.aggregate.mock.calls[1][0]).toContainEqual({ $skip: 1 });
});

it("returns community player-count metadata from the collection catalog", async () => {
  const f = setup();
  const suggestedPlayers = {
    fetchedAt: "2026-11-11T12:00:00.000Z",
    totalVotes: 16,
    rows: [
      { players: 4, orMore: false, best: 12, recommended: 3, notRecommended: 1, sampleCount: 16 },
    ],
  };
  Object.assign(f.state.catalog[0], { suggestedPlayers });
  const result = await f.read({ collection: "1" });
  expect(result.items[0]).toMatchObject({ id: 1, suggestedPlayers });
  expect(result.items[1]).not.toHaveProperty("suggestedPlayers");
});

it.each([false, true])(
  "unions all authorized accepted/queue owners and optionally own publication before paging: own=%s",
  async (own) => {
    const f = setup();
    await f.read({
      participants: "1",
      participantEventId: event,
      participantTableId: table,
      collection: own ? "1" : "0",
    });
    expect(mocks.scope).toHaveBeenCalledTimes(2);
    expect(mocks.scope).toHaveBeenCalledWith("viewer", event, table);
    const owners = own ? ["queue", "seated", "viewer"] : ["queue", "seated"];
    const match = (f.aggregate.mock.calls[0][0][0] as { $match: { $or: { userId: string }[] } })
      .$match;
    expect(match.$or.map((source) => source.userId).sort()).toEqual(owners);
    expect(mocks.visible.mock.calls.map((args) => args[1]).sort()).toEqual([
      "queue",
      "queue",
      "seated",
      "seated",
    ]);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(f.sessions).toHaveLength(2);
    for (const session of f.sessions) expect(session.endSession).toHaveBeenCalledOnce();
  },
);

it.each([403, 404])(
  "excludes inaccessible Profiles before source aggregation without failing other selected publications: %s",
  async (status) => {
    const f = setup();
    mocks.visible.mockImplementation(async (_viewer, owner) => {
      if (owner === "queue") throw new CommunityError(status, "PROFILE_NOT_FOUND");
      return {};
    });
    await f.read({ participants: "1", participantEventId: event, participantTableId: table });
    expect(f.aggregate.mock.calls[0][0]).toContainEqual(
      expect.objectContaining({
        $match: expect.objectContaining({ $or: [{ userId: "seated", snapshot: "seat" }] }),
      }),
    );
  },
);

it("does not turn Profile infrastructure errors into successful empty collections", async () => {
  const f = setup();
  mocks.visible.mockRejectedValueOnce(new Error("offline"));
  await expect(
    f.read({ participants: "1", participantEventId: event, participantTableId: table }),
  ).rejects.toThrow("offline");
  expect(f.aggregate).not.toHaveBeenCalled();
});

it("keeps an explicitly selected unavailable publication empty, not catalog fallback", async () => {
  const f = setup();
  f.state.snapshots = [];
  expect(await f.read({ collection: "1", query: "Azul" })).toMatchObject({
    items: [],
    nextCursor: null,
  });
  expect(f.aggregate).not.toHaveBeenCalled();
  expect(mocks.search).not.toHaveBeenCalled();
  f.state.snapshots.push({ userId: "viewer", active: { snapshot: "empty", username: "PRIVATE" } });
  f.state.rows = [];
  expect((await f.read({ collection: "1" })).items).toEqual([]);
  expect(f.catalogFind).not.toHaveBeenCalled();
});

it("preserves missing catalog duration/player bounds and image fallbacks without inventing metadata", async () => {
  const f = setup();
  f.state.rows = [row(2)];
  expect((await f.read({ collection: "1" })).items[0]).toMatchObject({
    id: 2,
    imageUrl: null,
    minPlayers: null,
    maxPlayers: null,
    minPlayMinutes: null,
    maxPlayMinutes: null,
  });
  f.state.rows = [{ ...row(1), imageUrl: "https://cf.geekdo-images.com/collection.png" }];
  expect((await f.read({ collection: "1" })).items[0].imageUrl).toBe(
    "https://cf.geekdo-images.com/collection.png",
  );
});

it("source-excludes canonical and all own proposal history in both selected collection and catalog modes", async () => {
  const f = setup();
  const scope = { proposalEventId: event, proposalTableId: table };
  await f.read({ ...scope, collection: "1" });
  expect((f.aggregate.mock.calls[0][0][0] as Record<string, any>).$match.gameId).toEqual({
    $nin: [98, 99],
  });
  await f.read({ ...scope, query: "Azul" });
  expect(mocks.search).toHaveBeenCalledWith(f.db, "Azul", 0, 26, [98, 99]);
});

it("rejects stale exclusion, actor, query, Table and snapshot cursors instead of mixing source pages", async () => {
  const f = setup();
  const scope = {
    participants: "1",
    participantEventId: event,
    participantTableId: table,
    limit: 1,
  };
  const first = await f.read(scope);
  expect(first.nextCursor).toBeTruthy();
  for (const changed of [
    { query: "Game" },
    { participantTableId: other },
    { participantEventId: other },
    { collection: "1" },
  ])
    await expect(f.read({ ...scope, ...changed, cursor: first.nextCursor })).rejects.toMatchObject({
      code: "BGG_PICKER_CHANGED",
    });
  await expect(
    f.read({ ...scope, cursor: first.nextCursor }, "other-viewer"),
  ).rejects.toMatchObject({ code: "BGG_PICKER_CHANGED" });
  f.state.snapshots[1].active.snapshot = "replaced";
  await expect(f.read({ ...scope, cursor: first.nextCursor })).rejects.toMatchObject({
    code: "BGG_PICKER_CHANGED",
  });
  const proposed = await f.read({
    proposalEventId: event,
    proposalTableId: table,
    collection: "1",
    limit: 1,
  });
  mocks.exclusions.mockResolvedValue([1]);
  await expect(
    f.read({
      proposalEventId: event,
      proposalTableId: table,
      collection: "1",
      limit: 1,
      cursor: proposed.nextCursor,
    }),
  ).rejects.toMatchObject({ code: "BGG_PICKER_CHANGED" });
});

it.each([
  "invalid",
  Buffer.from("{}").toString("base64url"),
  Buffer.from(JSON.stringify({ offset: -1, scope: "f".repeat(64) })).toString("base64url"),
])("rejects malformed cursor %s", async (cursor) => {
  const f = setup();
  await expect(f.read({ cursor })).rejects.toMatchObject({
    status: 409,
    code: "BGG_PICKER_CHANGED",
  });
});

it("rechecks role, roster and active publications after page derivation and closes every native session", async () => {
  const f = setup();
  const input = { participants: "1", participantEventId: event, participantTableId: table };
  mocks.scope
    .mockResolvedValueOnce({ eventVersion: 3, userIds: ["seated"] })
    .mockRejectedValueOnce(new CommunityError(403, "EVENT_ADMIN_REQUIRED"));
  await expect(f.read(input)).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
  expect(f.sessions).toHaveLength(2);
  for (const session of f.sessions) expect(session.endSession).toHaveBeenCalledOnce();
  mocks.scope
    .mockResolvedValueOnce({ eventVersion: 3, userIds: ["seated"] })
    .mockResolvedValueOnce({ eventVersion: 4, userIds: ["seated", "queue"] });
  await expect(f.read(input)).rejects.toMatchObject({ code: "BGG_PICKER_CHANGED" });
  f.aggregate.mockImplementationOnce(() => ({
    toArray: async () => {
      f.state.snapshots[0].active.snapshot = "concurrent-publication";
      return f.state.rows;
    },
  }));
  await expect(f.read({ collection: "1" })).rejects.toMatchObject({ code: "BGG_PICKER_CHANGED" });
});

it("never reads selected collections when current management or proposal eligibility already fails", async () => {
  const f = setup();
  mocks.scope.mockRejectedValueOnce(new CommunityError(403, "EVENT_ADMIN_REQUIRED"));
  await expect(
    f.read({ participants: "1", participantEventId: event, participantTableId: table }),
  ).rejects.toMatchObject({ status: 403 });
  mocks.exclusions.mockRejectedValueOnce(new CommunityError(403, "PROPOSAL_MANAGER_CANNOT_SUBMIT"));
  await expect(f.read({ proposalEventId: event, proposalTableId: table })).rejects.toMatchObject({
    status: 403,
  });
  expect(f.accountFind).not.toHaveBeenCalled();
  expect(f.aggregate).not.toHaveBeenCalled();
  expect(mocks.search).not.toHaveBeenCalled();
  for (const session of f.sessions) expect(session.endSession).toHaveBeenCalledOnce();
});
