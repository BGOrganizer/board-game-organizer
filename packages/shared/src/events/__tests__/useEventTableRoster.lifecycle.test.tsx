// @vitest-environment jsdom
import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import { Activity, act, createElement, StrictMode, startTransition, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useEventTableRoster } from "../hooks/useEventTableRoster";

const adapters = vi.hoisted(() => {
  const stream = () => ({
    items: [] as TableSeatResponse[],
    data: {} as object | undefined,
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    resetPresentation: vi.fn(),
  });
  return {
    accepted: stream(),
    pending: stream(),
    self: undefined as
      | { id: string; name: string; username: string; avatarUrl: string | null }
      | undefined,
    mutations: [] as Array<{
      mutationId: number;
      state: {
        variables: {
          tableId: string;
          userId: string;
          person?: { name: string; username: string; avatarUrl: string | null };
        };
      };
    }>,
    intent: undefined as
      | { key: string; action: "join" | "accept"; phase: "saving" | "verifying" | "failed" }
      | undefined,
    profile: vi.fn(),
    seats: vi.fn(),
    scoped: vi.fn(),
    participation: vi.fn(),
  };
});
vi.mock("../hooks/useEventRecords", async (original) => ({
  ...(await original<typeof import("../hooks/useEventRecords")>()),
  useTableSeats: (o: CommunityApiOptions, eventId: string, tableId: string, pending = false) => {
    adapters.seats(o, eventId, tableId, pending);
    return pending ? adapters.pending : adapters.accepted;
  },
}));
vi.mock("../../profile/hooks/useProfile", () => ({
  useProfileQuery: (o: CommunityApiOptions) => {
    adapters.profile(o);
    return { data: adapters.self };
  },
}));
vi.mock("../../common/hooks/useScopedMutations", () => ({
  useScopedMutations: (filters: unknown) => {
    adapters.scoped(filters);
    return adapters.mutations;
  },
}));
vi.mock("../hooks/useEventParticipationIntent", () => ({
  useEventParticipationIntent: (...args: unknown[]) => {
    adapters.participation(...args);
    return adapters.intent;
  },
}));

type Result = ReturnType<typeof useEventTableRoster>;
const roots = new Map<Root, HTMLDivElement>();
const at = "2030-06-01T10:00:00Z";
const fixture: PlannedTableResponse = {
  id: "table",
  eventId: "event",
  name: "Owned table",
  order: 0,
  minPlayers: 2,
  maxPlayers: 60,
  rankingEnabled: false,
  games: [{ gameId: 1 }],
  createdAt: at,
  updatedAt: at,
  eventName: "Owned event",
  groupId: null,
  groupType: null,
  eventStatus: "PLANNING",
  adminUserId: "owner",
  canManage: true,
  myRegistration: null,
  myPosition: null,
  seatedCount: 45,
  pendingCount: 0,
  waitingCount: 0,
  occupiedSeatIndices: Array.from({ length: 45 }, (_, i) => i),
  canRegister: true,
  canRespond: false,
  canLeave: false,
  canInvite: true,
  gamesDetail: [],
  ratingChanges: [],
};
function seat(
  id: string,
  index = 0,
  status: TableSeatResponse["status"] = "ACCEPTED",
): TableSeatResponse {
  return {
    id,
    eventId: "event",
    tableId: "table",
    userId: id,
    kind: status === "PENDING" ? "INVITATION" : "SELF",
    status,
    position: "SEATED",
    seatIndex: index,
    priorityAt: at,
    sequence: index,
    version: 1,
    gameVotes: {},
    createdAt: at,
    updatedAt: at,
    name: id,
    username: id,
    email: `${id}@example.test`,
    avatarUrl: null,
  };
}
beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  for (const stream of [adapters.accepted, adapters.pending])
    Object.assign(stream, {
      items: [],
      data: {},
      isPending: false,
      isError: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      hasNextPage: false,
    });
  adapters.accepted.items = Array.from({ length: 45 }, (_, i) => seat(`player-${i}`, i));
  adapters.self = undefined;
  adapters.intent = undefined;
  adapters.mutations = [];
});
afterEach(async () => {
  for (const [root, host] of roots) {
    await act(async () => root.unmount());
    host.remove();
  }
  roots.clear();
});
function Probe({
  options,
  table,
  publish,
  control,
}: {
  options: CommunityApiOptions;
  table: PlannedTableResponse;
  publish: (result: Result) => void;
  control: (queue: () => void) => void;
}) {
  const [, setVersion] = useState(0);
  control(() => setVersion((version) => version + 1));
  const result = useEventTableRoster(options, table);
  publish(result);
  return createElement("output", null, result.rows.map((row) => row.key).join(","));
}
async function harness(patch: Partial<PlannedTableResponse> = {}, strict = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.set(root, host);
  let options: CommunityApiOptions = {
    apiUrl: "https://preview.test",
    userId: "owner",
    getToken: async () => "fixture",
  };
  let table = { ...fixture, ...patch },
    visible = true;
  const results: Result[] = [];
  let queueRender!: () => void;
  const renderTree = () => {
    const panel = createElement(
      Activity,
      { mode: visible ? "visible" : "hidden" },
      createElement(Probe, {
        options,
        table,
        publish: (result) => results.push(result),
        control: (queue) => {
          queueRender = queue;
        },
      }),
    );
    root.render(strict ? createElement(StrictMode, null, panel) : panel);
  };
  const render = async () => {
    await act(async () => renderTree());
  };
  await render();
  return {
    host,
    results,
    current: () => results[results.length - 1],
    render,
    queueRender: () => queueRender(),
    hideSync: () => {
      visible = false;
      renderTree();
    },
    updateSync: (owner: Partial<CommunityApiOptions>) => {
      options = { ...options, ...owner };
      renderTree();
    },
    update: async (
      next: Partial<PlannedTableResponse> = {},
      owner: Partial<CommunityApiOptions> = {},
    ) => {
      table = { ...table, ...next };
      options = { ...options, ...owner };
      await render();
    },
    hide: async () => {
      visible = false;
      await render();
    },
    show: async () => {
      visible = true;
      await render();
    },
    dispose: async () => {
      await act(async () => root.unmount());
      roots.delete(root);
      host.remove();
    },
  };
}
async function more(result: Result) {
  await act(async () => result.more());
}
async function reset(result: Result) {
  await act(async () => result.resetPresentation());
}

it("reveals bounded cached roster pages once per render and explicitly resets only presentation", async () => {
  const canonical = adapters.accepted.items;
  const h = await harness();
  const initial = h.current(),
    resetIdentity = initial.resetPresentation;
  expect(initial.rows).toHaveLength(20);
  expect(initial.seatRows).toHaveLength(20);
  expect(initial.waitingRows).toEqual([]);
  expect(initial.hasNextPage).toBe(true);
  await act(async () => {
    initial.more();
    initial.more();
  });
  expect(h.current().rows).toHaveLength(40);
  expect(h.current().resetPresentation).toBe(resetIdentity);
  await more(h.current());
  expect(h.current().rows).toHaveLength(60);
  expect(h.current().hasNextPage).toBe(false);
  const stale = h.current();
  await reset(stale);
  expect(h.current().rows).toHaveLength(20);
  expect(h.current().resetPresentation).toBe(resetIdentity);
  expect(adapters.accepted.resetPresentation).toHaveBeenCalledOnce();
  expect(adapters.pending.resetPresentation).toHaveBeenCalledOnce();
  await more(stale);
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
  expect(adapters.accepted.items).toBe(canonical);
  expect(adapters.accepted.fetchNextPage).not.toHaveBeenCalled();
  expect(adapters.pending.fetchNextPage).not.toHaveBeenCalled();
});
it("resets on real Activity cleanup and rejects callbacks captured before hide/reentry", async () => {
  const h = await harness();
  await more(h.current());
  const stale = h.current();
  await h.hide();
  await more(stale);
  await h.show();
  expect(h.current().rows).toHaveLength(20);
  await more(stale);
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
  const detached = h.current();
  await h.dispose();
  await more(detached);
  expect(adapters.accepted.fetchNextPage).not.toHaveBeenCalled();
});
it("refreshes captured callbacks after StrictMode effect replay", async () => {
  const h = await harness({}, true);
  const firstRender = h.results[0];
  await more(firstRender);
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
  await h.hide();
  await h.show();
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
});
it.each([
  [{}, { apiUrl: "https://other-preview.test" }],
  [{}, { userId: "other-owner" }],
  [{ eventId: "other-event" }, {}],
  [{ id: "other-table" }, {}],
] as const)(
  "resets the combined budget and rejects old more/reset callbacks on scope change %j/%j",
  async (table, owner) => {
    const h = await harness();
    await more(h.current());
    const stale = h.current();
    await h.update(table, owner);
    expect(h.current().rows).toHaveLength(20);
    const acceptedResets = adapters.accepted.resetPresentation.mock.calls.length;
    await more(h.current());
    await more(stale);
    await reset(stale);
    expect(h.current().rows).toHaveLength(40);
    expect(adapters.accepted.resetPresentation).toHaveBeenCalledTimes(acceptedResets);
  },
);
it("rejects an old lower-priority budget updater when a synchronous reset wins", async () => {
  const h = await harness();
  const stale = h.current();
  await act(async () => {
    // Mark this fiber pending first so the roster updater is evaluated only after the urgent reset.
    startTransition(() => {
      h.queueRender();
      stale.more();
    });
    flushSync(() => stale.resetPresentation());
  });
  expect(h.current().rows).toHaveLength(20);
  await more(stale);
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
});
it("requests accepted then pending pages only on demand, blocks fetch overlap, and retries only failed streams", async () => {
  adapters.accepted.hasNextPage = adapters.pending.hasNextPage = true;
  const h = await harness();
  await more(h.current());
  expect(adapters.accepted.fetchNextPage).toHaveBeenCalledOnce();
  expect(adapters.pending.fetchNextPage).not.toHaveBeenCalled();
  adapters.accepted.hasNextPage = false;
  await h.render();
  await more(h.current());
  expect(adapters.pending.fetchNextPage).toHaveBeenCalledOnce();
  adapters.pending.isFetchingNextPage = true;
  adapters.pending.isFetchNextPageError = true;
  adapters.pending.isError = true;
  await h.render();
  expect(h.current()).toMatchObject({
    isFetchingNextPage: true,
    isFetchNextPageError: true,
    isError: true,
  });
  await more(h.current());
  expect(adapters.pending.fetchNextPage).toHaveBeenCalledOnce();
  await act(async () => h.current().refetch());
  expect(adapters.pending.refetch).toHaveBeenCalledOnce();
  expect(adapters.accepted.refetch).not.toHaveBeenCalled();
  adapters.accepted.isError = true;
  await h.render();
  await act(async () => h.current().refetch());
  expect(adapters.accepted.refetch).toHaveBeenCalledOnce();
});
it.each([
  { status: "PLANNING" as const, manager: true, enabled: true, allowed: true },
  { status: "PLANNING" as const, manager: true, enabled: false, allowed: false },
  { status: "PLANNING" as const, manager: false, enabled: true, allowed: false },
  { status: "CONFIRMED" as const, manager: true, enabled: true, allowed: false },
])(
  "keeps the pending stream gated by current capability and lifecycle %j",
  async ({ status, manager, enabled, allowed }) => {
    adapters.pending.items = [seat("private-pending", 1, "PENDING")];
    adapters.pending.isError = true;
    const h = await harness({ eventStatus: status, canManage: manager, adminUserId: "owner" });
    await h.update({}, { enabled });
    const pendingCall = adapters.seats.mock.calls.filter((call) => call[3] === true).at(-1);
    expect(pendingCall?.[0].enabled).toBe(allowed);
    const includePending = status === "PLANNING" && manager;
    expect(h.current().isError).toBe(includePending);
    expect(JSON.stringify(h.current().rows).includes("private-pending")).toBe(includePending);
  },
);
it("preserves missing-data loading, visible cached data and observable stream failures", async () => {
  adapters.accepted.isPending = true;
  adapters.accepted.data = undefined;
  const h = await harness();
  expect(h.current().isPending).toBe(true);
  adapters.accepted.data = {};
  await h.render();
  expect(h.current().isPending).toBe(false);
  adapters.accepted.isPending = false;
  adapters.pending.isPending = true;
  adapters.pending.data = undefined;
  await h.render();
  expect(h.current().isPending).toBe(true);
  adapters.pending.data = {};
  await h.render();
  expect(h.current().isPending).toBe(false);
});
it("includes only matching manager invitations and preserves pending participation without fabricated consent", async () => {
  adapters.mutations = [
    {
      mutationId: 1,
      state: {
        variables: {
          tableId: "table",
          userId: "invited",
          person: { name: "Invited", username: "invited", avatarUrl: null },
        },
      },
    },
    { mutationId: 2, state: { variables: { tableId: "other-table", userId: "foreign" } } },
  ];
  adapters.self = { id: "owner", name: "Owned profile", username: "owned", avatarUrl: null };
  adapters.intent = { key: "joining", action: "join", phase: "saving" };
  const h = await harness({ maxPlayers: 1, seatedCount: 1, occupiedSeatIndices: [0] });
  expect(h.current().rows).toContainEqual(
    expect.objectContaining({ kind: "pending", userId: "invited", key: "sending:1" }),
  );
  expect(h.current().rows).toContainEqual(
    expect.objectContaining({
      kind: "pending",
      userId: "owner",
      action: "join",
      name: "Owned profile",
    }),
  );
  expect(JSON.stringify(h.current().rows)).not.toContain("foreign");
  expect(adapters.profile).toHaveBeenLastCalledWith(
    expect.objectContaining({ userId: "owner", enabled: false }),
  );
  expect(adapters.scoped).toHaveBeenLastCalledWith({
    mutationKey: ["events", "https://preview.test", "owner", "mutation", "event", "invite"],
    status: "pending",
  });
  expect(adapters.participation).toHaveBeenLastCalledWith(
    expect.anything(),
    "event",
    "table",
    false,
  );
  await h.update({ canManage: false });
  expect(JSON.stringify(h.current().rows)).not.toContain("invited");
});
it.each([
  "accepted-page",
  "pending-page",
  "accepted-receipt",
  "pending-receipt",
  "foreign-receipt",
  "anonymous",
])("derives self consent only from an accepted owned registration: %s", async (kind) => {
  adapters.accepted.items =
    kind === "accepted-page"
      ? [seat("owner")]
      : kind === "pending-page"
        ? [seat("owner", 0, "PENDING")]
        : [];
  const registration =
    kind === "accepted-receipt"
      ? seat("owner")
      : kind === "pending-receipt"
        ? seat("owner", 0, "PENDING")
        : kind === "foreign-receipt"
          ? seat("someone-else")
          : null;
  const h = await harness({ myRegistration: registration });
  if (kind === "anonymous") await h.update({}, { userId: undefined });
  expect(adapters.participation.mock.calls.at(-1)?.[3]).toBe(
    kind === "accepted-page" || kind === "accepted-receipt",
  );
});

it("rejects a queued old-owner updater when a synchronous owner switch wins", async () => {
  const h = await harness();
  const stale = h.current();
  await act(async () => {
    startTransition(() => {
      h.queueRender();
      stale.more();
    });
    flushSync(() => h.updateSync({ userId: "other-owner" }));
  });
  expect(h.current().rows).toHaveLength(20);
  await more(stale);
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
});

it("does not revive a previously expanded owner when visiting another owner without paging", async () => {
  const h = await harness();
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
  await h.update({}, { userId: "other-owner" });
  expect(h.current().rows).toHaveLength(20);
  await h.update({}, { userId: "owner" });
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
});
it("rejects callbacks published by hidden background renders, including a new hidden owner", async () => {
  adapters.accepted.hasNextPage = true;
  const h = await harness();
  await h.hide();
  await h.render();
  await more(h.current());
  expect(h.current().rows).toHaveLength(20);
  expect(adapters.accepted.fetchNextPage).not.toHaveBeenCalled();
  await h.update({}, { userId: "hidden-new-owner" });
  await more(h.current());
  expect(h.current().rows).toHaveLength(20);
  expect(adapters.accepted.fetchNextPage).not.toHaveBeenCalled();
  await h.show();
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
  expect(adapters.accepted.fetchNextPage).toHaveBeenCalledOnce();
});
it("rejects a pending budget updater when Activity cleanup deactivates its owner", async () => {
  const h = await harness();
  const stale = h.current();
  await act(async () => {
    startTransition(() => {
      h.queueRender();
      stale.more();
    });
    flushSync(() => h.hideSync());
  });
  await h.show();
  expect(h.current().rows).toHaveLength(20);
  await more(h.current());
  expect(h.current().rows).toHaveLength(40);
});
