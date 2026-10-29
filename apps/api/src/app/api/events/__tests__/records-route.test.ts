import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  factory: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}), withTransaction: mocks.transaction }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: async () => {} }));
vi.mock("@/app/lib/community/record-services", () => ({ recordServices: mocks.factory }));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: vi.fn() }));

import * as oldBooking from "../../event-bookings/[bookingId]/route";
import * as response from "../../table-registrations/[registrationId]/route";
import * as mine from "../../tables/route";
import * as result from "../[eventId]/results/route";
import * as detail from "../[eventId]/route";
import * as state from "../[eventId]/state/route";
import * as oldBookings from "../[eventId]/tables/[tableId]/bookings/route";
import * as invitation from "../[eventId]/tables/[tableId]/invitations/route";
import * as leaderboard from "../[eventId]/tables/[tableId]/leaderboard/route";
import * as registration from "../[eventId]/tables/[tableId]/registrations/route";
import * as table from "../[eventId]/tables/[tableId]/route";
import * as seats from "../[eventId]/tables/[tableId]/seats/route";
import * as tables from "../[eventId]/tables/route";
import * as vote from "../[eventId]/votes/route";
import * as root from "../route";

const id = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ eventId: id, tableId, registrationId: id }) };
const input = {
  groupId: null,
  name: "Friday games",
  timeZone: "Europe/Rome",
  startTime: "20:00",
  dates: [{ id, day: "2030-06-03" }],
  locations: [{ id, name: "Club venue", address: "Via Roma 1", latitude: 41.9, longitude: 12.5 }],
  tables: [
    {
      name: "Table one",
      minPlayers: 2,
      maxPlayers: 4,
      games: [{ gameId: 1 }],
      rankingEnabled: true,
    },
  ],
};
it("rejects bare invitation acceptance and choice payloads on non-accept actions before service writes", async () => {
  for (const input of [
    { action: "accept", version: 1 },
    { action: "decline", version: 1, participation: { version: 1, gameVotes: { "1": "YES" } } },
  ]) {
    const result = await response.PATCH(request("PATCH", input), context);
    expect(result.status).toBe(400);
  }
  expect(events.registrationAction).not.toHaveBeenCalled();
});
const request = (method = "GET", body?: unknown, query = "") =>
  new Request(`https://api.test/api/events${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const events = {
  list: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  tables: vi.fn(),
  tableDetail: vi.fn(),
  register: vi.fn(),
  join: vi.fn(),
  registrationAction: vi.fn(),
  seats: vi.fn(),
  vote: vi.fn(),
  transition: vi.fn(),
  finalize: vi.fn(),
  personalTables: vi.fn(),
  tableLeaderboard: vi.fn(),
  invitationCandidates: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ userId: "actor" });
  mocks.transaction.mockImplementation(async (fn) => fn({}, {}));
  mocks.factory.mockReturnValue({ events });
  for (const method of Object.values(events)) method.mockReset().mockResolvedValue({ id });
});
afterEach(() => vi.restoreAllMocks());
it("passes strict unified event create/edit contracts without legacy drafts or partial table deletion", async () => {
  expect((await root.POST(request("POST", input))).status).toBe(201);
  expect(events.create).toHaveBeenCalledWith("actor", input);
  const { groupId: _group, ...values } = input,
    update = { ...values, tables: [], removedTableIds: [tableId], version: 2 };
  expect((await detail.PATCH(request("PATCH", update), context)).status).toBe(200);
  expect(events.update).toHaveBeenCalledWith("actor", id, update);
  expect(
    (await detail.PATCH(request("PATCH", { ...update, removedTableIds: undefined }), context))
      .status,
  ).toBe(400);
  expect((await root.POST(request("POST", { ...input, status: "DRAFT" }))).status).toBe(400);
  expect("DELETE" in detail).toBe(false);
  expect("POST" in tables).toBe(false);
  expect("PATCH" in table).toBe(false);
});
it("source-pages event/table feeds with explicit periods and UUID-scoped detail", async () => {
  await root.GET(request("GET", undefined, `?groupId=${id}&periods=future&limit=2`));
  expect(events.list).toHaveBeenCalledWith("actor", { limit: 2, periods: ["future"] }, id);
  await mine.GET(request("GET", undefined, "?periods=past"));
  expect(events.personalTables).toHaveBeenCalledWith("actor", { limit: 20, periods: ["past"] });
  expect((await mine.GET(request("GET", undefined, `?groupId=${id}`))).status).toBe(400);
  await detail.GET(request(), context);
  expect(events.detail).toHaveBeenCalledWith("actor", id);
  await tables.GET(request("GET", undefined, "?query=table"), context);
  expect(events.tables).toHaveBeenCalledWith("actor", id, { limit: 20, query: "table" });
  await table.GET(request(), context);
  expect(events.tableDetail).toHaveBeenCalledWith("actor", id, tableId);
  expect((await root.OPTIONS(request("OPTIONS"))).status).toBe(204);
});
it("source-pages only the selected frozen Table leaderboard with strict IDs/query/auth", async () => {
  expect(
    (await leaderboard.GET(request("GET", undefined, "?limit=1&cursor=2"), context)).status,
  ).toBe(200);
  expect(events.tableLeaderboard).toHaveBeenCalledWith("actor", id, tableId, {
    limit: 1,
    cursor: "2",
  });
  expect((await leaderboard.OPTIONS(request("OPTIONS"))).status).toBe(204);
  for (const query of [
    "?gameId=2",
    "?limit=51",
    "?cursor=-1",
    "?cursor=Infinity",
    "?cursor=1&cursor=2",
    "?query=game",
  ])
    expect((await leaderboard.GET(request("GET", undefined, query), context)).status).toBe(400);
  expect(
    (await leaderboard.GET(request(), { params: Promise.resolve({ eventId: id, tableId: "bad" }) }))
      .status,
  ).toBe(400);
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await leaderboard.GET(request(), context)).status).toBe(401);
});
it("keeps explicit registrations, invitations and invitation consent distinct", async () => {
  const choices = { version: 1, gameVotes: { "1": "YES" } };
  expect((await registration.POST(request("POST", choices), context)).status).toBe(201);
  expect(events.join).toHaveBeenLastCalledWith("actor", id, tableId, choices);
  expect((await invitation.POST(request("POST", { userId: "friend" }), context)).status).toBe(201);
  expect(events.register).toHaveBeenLastCalledWith("actor", id, tableId, "friend");
  expect(vi.mocked(console.info).mock.calls.at(-1)).toEqual([
    "[bgo.event-write]",
    expect.objectContaining({ operation: "event.table.invite", phase: "completed", status: 201 }),
  ]);
  const participation = { version: 1, gameVotes: { "1": "YES" } };
  await response.PATCH(request("PATCH", { action: "accept", version: 1, participation }), context);
  expect(events.registrationAction).toHaveBeenCalledWith("actor", id, {
    action: "accept",
    version: 1,
    participation,
  });
  const cursor = `2030-06-01T12:00:00.000Z|3|${id}`;
  await seats.GET(
    request("GET", undefined, `?pending=true&cursor=${encodeURIComponent(cursor)}`),
    context,
  );
  expect(events.seats).toHaveBeenCalledWith("actor", id, tableId, { limit: 20, cursor }, true);
});
it.each([
  "REGISTRATION_ALREADY_ACTIVE",
  "TABLE_TIME_CONFLICT",
  "EVENT_NOT_PLANNING",
  "EVENT_BOOKING_CLOSED",
])(
  "traces invitation conflict %s without request/user data or changing the response",
  async (code) => {
    events.register.mockRejectedValueOnce(new CommunityError(409, code));
    const response = await invitation.POST(
      new Request(
        `https://api.test/api/events/${id}/tables/${tableId}/invitations?x-vercel-protection-bypass=private-preview-sentinel`,
        {
          method: "POST",
          headers: { Authorization: "Bearer private-auth-sentinel" },
          body: JSON.stringify({ userId: "private-target-sentinel" }),
        },
      ),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: code });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const calls = vi.mocked(console.info).mock.calls;
    expect(calls.every(([tag]) => tag === "[bgo.event-write]")).toBe(true);
    const entries = calls.map(([, entry]) => entry);
    expect(entries[0]).toMatchObject({
      operation: "event.table.invite",
      phase: "received",
      stage: "auth",
    });
    expect(entries.at(-1)).toMatchObject({
      operation: "event.table.invite",
      phase: "failed",
      stage: "transaction",
      status: 409,
      code,
    });
    expect(new Set(entries.map((entry) => entry.requestId)).size).toBe(1);
    for (const privateValue of [
      "private-preview-sentinel",
      "private-auth-sentinel",
      "private-target-sentinel",
      id,
      tableId,
    ])
      expect(JSON.stringify(calls)).not.toContain(privateValue);
    expect(mocks.after).not.toHaveBeenCalled();
  },
);
it("traces unauthorized invitations before services without invoking registration", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  const response = await invitation.POST(request("POST", { userId: "friend" }), context);
  expect(response.status).toBe(401);
  expect(events.register).not.toHaveBeenCalled();
  expect(mocks.factory).not.toHaveBeenCalled();
  expect(vi.mocked(console.info).mock.calls.at(-1)).toEqual([
    "[bgo.event-write]",
    expect.objectContaining({
      phase: "rejected",
      stage: "auth",
      status: 401,
      code: "UNAUTHORIZED",
    }),
  ]);
});
it("redacts arbitrary invitation exceptions and preserves the generic 500 response", async () => {
  events.register.mockRejectedValueOnce(new Error("private-user-and-address-sentinel"));
  const response = await invitation.POST(request("POST", { userId: "friend" }), context);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Internal server error" });
  expect(vi.mocked(console.info).mock.calls.at(-1)).toEqual([
    "[bgo.event-write]",
    expect.objectContaining({ phase: "failed", status: 500, code: "INTERNAL_ERROR" }),
  ]);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
    "private-user-and-address-sentinel",
  );
});
it("emits one terminal invitation result even when MongoDB retries a consumed request body", async () => {
  events.register
    .mockResolvedValueOnce({ id })
    .mockRejectedValueOnce(new CommunityError(409, "REGISTRATION_ALREADY_ACTIVE"));
  mocks.transaction.mockImplementationOnce(async (fn) => {
    await fn({}, {});
    return fn({}, {});
  });
  expect((await invitation.POST(request("POST", { userId: "friend" }), context)).status).toBe(409);
  expect(events.register).toHaveBeenCalledTimes(2);
  const entries = vi.mocked(console.info).mock.calls.map(([, entry]) => entry);
  expect(entries.filter((entry) => entry.phase === "received")).toHaveLength(1);
  expect(entries.filter((entry) => entry.phase === "failed")).toHaveLength(1);
  expect(entries.filter((entry) => entry.phase === "completed")).toHaveLength(0);
  expect(mocks.after).not.toHaveBeenCalled();
});
it("keeps Table invitation candidate reads outside write diagnostics", async () => {
  expect((await invitation.GET(request(), context)).status).toBe(200);
  expect(console.info).not.toHaveBeenCalled();
});
it("validates initial availability and game preferences, rejecting UNKNOWN in every write", async () => {
  const availability = {
    version: 1,
    dateVotes: { [id]: "YES" },
    locationVotes: { [id]: "IF_NEEDED" },
  };
  const choices = { version: 1, gameVotes: { "1": "IF_NEEDED" }, availability };
  expect((await registration.POST(request("POST", choices), context)).status).toBe(201);
  expect(events.join).toHaveBeenLastCalledWith("actor", id, tableId, choices);
  for (const body of [
    { actor: "forged" },
    { ...choices, availability: { ...availability, version: 0 } },
    { ...choices, availability: { ...availability, dateVotes: { forged: "YES" } } },
    { ...choices, availability: { ...availability, dateVotes: { [id]: "UNKNOWN" } } },
    { ...choices, gameVotes: { "1": "UNKNOWN" } },
    { ...choices, gameVotes: { "0": "YES" } },
  ])
    expect((await registration.POST(request("POST", body), context)).status).toBe(400);
  for (const kind of ["date", "location"])
    expect(
      (await vote.PATCH(request("PATCH", { kind, optionId: id, vote: "UNKNOWN" }), context)).status,
    ).toBe(400);
  expect(
    (
      await vote.PATCH(
        request("PATCH", { kind: "game", tableId, gameId: 1, vote: "UNKNOWN" }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(events.vote).not.toHaveBeenCalled();
});
it("authenticates and source-pages Table invitation candidates using strict IDs and search/cursors", async () => {
  expect(
    (
      await invitation.GET(
        request("GET", undefined, "?query=board&limit=1&cursor=user_first"),
        context,
      )
    ).status,
  ).toBe(200);
  expect(events.invitationCandidates).toHaveBeenLastCalledWith("actor", id, tableId, {
    query: "board",
    limit: 1,
    cursor: "user_first",
  });
  for (const query of [
    "?limit=51",
    "?query=abc",
    "?limit=1&limit=2",
    "?pending=true",
    "?groupId=forged",
  ])
    expect((await invitation.GET(request("GET", undefined, query), context)).status).toBe(400);
  expect(
    (await invitation.GET(request(), { params: Promise.resolve({ eventId: id, tableId: "bad" }) }))
      .status,
  ).toBe(400);
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await invitation.GET(request(), context)).status).toBe(401);
});
it("delegates voting, authoritative state transitions and whole-event results without inventing participants", async () => {
  const choice = { kind: "game", tableId, gameId: 1, vote: "YES" };
  await vote.PATCH(request("PATCH", choice), context);
  expect(events.vote).toHaveBeenCalledWith("actor", id, choice);
  expect(events.register).not.toHaveBeenCalled();
  await state.PATCH(request("PATCH", { action: "confirm", version: 2 }), context);
  expect(events.transition).toHaveBeenCalledWith("actor", id, { action: "confirm", version: 2 });
  const outcome = {
    version: 3,
    results: [
      {
        tableId,
        lowerWins: false,
        entries: [
          { userId: "actor", score: "12.50" },
          { userId: "guest", score: null },
        ],
        tieBreaks: [],
      },
    ],
  };
  await result.POST(request("POST", outcome), context);
  expect(events.finalize).toHaveBeenCalledWith(
    "actor",
    id,
    expect.objectContaining({ version: 3, results: expect.any(Array) }),
  );
  expect(
    (await vote.PATCH(request("PATCH", { ...choice, participantIds: ["forged"] }), context)).status,
  ).toBe(400);
  expect(
    (await state.PATCH(request("PATCH", { action: "publish", version: 2 }), context)).status,
  ).toBe(400);
});
it("retired booking URLs cannot invoke legacy writers; new mutations still require auth and valid IDs", async () => {
  expect((await oldBooking.PATCH(request("PATCH"))).status).toBe(410);
  expect((await oldBookings.POST(request("POST"))).status).toBe(410);
  expect((await oldBookings.GET(request())).status).toBe(410);
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await root.POST(request("POST", input))).status).toBe(401);
  expect(
    (await detail.GET(request(), { params: Promise.resolve({ eventId: "bad" }) })).status,
  ).toBe(400);
});
