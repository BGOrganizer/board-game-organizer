import type {
  EventProposalResponse,
  EventProposalsResponse,
  ReviewEventProposalResponse,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventRecordKeys,
  eventRecordsQuery,
  useEventProposalActions,
  useEventProposalIntents,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { optionId, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";

const API = "https://proposal-receipts.test";
const clients: QueryClient[] = [];
const requestId = "44444444-4444-4444-8444-444444444444";
function setup(groupId: string | null = optionId, kind: "date" | "game" = "date") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
  const options = {
    apiUrl: API,
    userId: "owner",
    getToken: vi.fn(async () => "fresh-proposal-token"),
    feedback,
  };
  const event = { ...plannedEvent, groupId, canManage: true };
  const row: EventProposalResponse = {
    id: optionId,
    eventId: event.id,
    groupId,
    userId: "owner",
    authorName: "Owner",
    clientRequestId: requestId,
    label: kind === "date" ? "New date" : "New game",
    payload:
      kind === "date"
        ? { kind: "date", day: "2030-06-04", startTime: "20:00" }
        : { kind: "game", tableId: plannedTable.id, gameId: 2 },
    status: "PENDING",
    version: 1,
    submittedEventVersion: 1,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
  const scope = {
    eventId: event.id,
    groupId,
    kind,
    ...(kind === "game" ? { tableId: plannedTable.id } : {}),
  };
  const mineKey = eventProposalKeys.page(options, { ...scope, mode: "mine" });
  const reviewKey = eventProposalKeys.page(options, { ...scope, mode: "review" });
  const page = (
    mode: "mine" | "review",
    items: EventProposalResponse[],
  ): EventProposalsResponse => ({
    eventId: event.id,
    groupId,
    eventVersion: 1,
    mode,
    items,
    nextCursor: null,
  });
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(mineKey, page("mine", []));
  client.setQueryData(reviewKey, page("review", [row]));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const h = renderHook(
    () => ({
      actions: useEventProposalActions(
        options,
        event.id,
        groupId,
        kind,
        kind === "game" ? plannedTable.id : undefined,
      ),
      intents: useEventProposalIntents(
        options,
        event.id,
        kind,
        kind === "game" ? plannedTable.id : undefined,
      ),
    }),
    { wrapper },
  );
  const owner = { apiUrl: API, userId: "owner", eventId: event.id, groupId };
  const submit = {
    eventVersion: 1,
    payload: row.payload,
    clientLabel: row.label,
    clientRequestId: requestId,
  };
  const review = { proposalId: row.id, version: 1, eventVersion: 1, action: "reject" as const };
  return {
    client,
    h,
    options,
    owner,
    row,
    event,
    mineKey,
    reviewKey,
    page,
    submit,
    review,
    feedback,
  };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(clearSessionQueryCache);
  vi.unstubAllGlobals();
});

it.each(["missing", "api", "user", "event", "group"] as const)(
  "rejects a %s captured owner before submitting or reviewing, without any HTTP or feedback",
  async (changed) => {
    const f = setup();
    const owner =
      changed === "missing"
        ? undefined
        : {
            ...f.owner,
            ...(changed === "api" ? { apiUrl: "https://other.test" } : {}),
            ...(changed === "user" ? { userId: "other" } : {}),
            ...(changed === "event" ? { eventId: plannedTable.id } : {}),
            ...(changed === "group" ? { groupId: null } : {}),
          };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await act(async () => {
      await expect(
        f.h.result.current.actions.submit.mutateAsync({ ...f.submit, clientOwner: owner }),
      ).rejects.toThrow("MUTATION_OWNER_CHANGED");
    });
    await act(async () => {
      await expect(
        f.h.result.current.actions.review.mutateAsync({ ...f.review, clientOwner: owner }),
      ).rejects.toThrow("MUTATION_OWNER_CHANGED");
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(f.feedback.onOptimisticUpdate).not.toHaveBeenCalled();
    expect(f.feedback.onError).not.toHaveBeenCalled();
    expect(f.client.getQueryData(eventRecordKeys.detail(f.options, f.event.id))).toEqual(f.event);
  },
);

it("verifies a lost game submission through its exact table/correlation scope and ignores a nonexistent replaced draft", async () => {
  const f = setup(null, "game");
  const ownPicker = ["bgg-picker", API, "owner", "", false, false, null, { eventId: f.event.id }];
  const otherPicker = [
    "bgg-picker",
    API,
    "owner",
    "",
    false,
    false,
    null,
    { eventId: plannedTable.id },
  ];
  const catalog = ["bgg-picker", API, "owner", "", false, false, null, null];
  for (const key of [ownPicker, otherPicker, catalog])
    f.client.setQueryData(key, { marker: "cached" });
  const calls: { url: URL; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-proposal-token");
      if (method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({
          eventVersion: 1,
          payload: f.row.payload,
          clientRequestId: requestId,
        });
        return Response.json({ error: "LOST" }, { status: 503 });
      }
      expect(url.searchParams.get("mode")).toBe("mine");
      expect(url.searchParams.get("kind")).toBe("game");
      expect(url.searchParams.get("tableId")).toBe(plannedTable.id);
      expect(url.searchParams.get("clientRequestId")).toBe(requestId);
      expect(url.searchParams.get("limit")).toBe("1");
      return Response.json(f.page("mine", [f.row]));
    }),
  );
  act(() =>
    f.h.result.current.actions.propose({ ...f.submit, clientReplaces: "nonexistent-error-draft" }),
  );
  await waitFor(() => expect(f.h.result.current.actions.submit.isSuccess).toBe(true));
  expect(calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  expect(f.client.getQueryData<EventProposalsResponse>(f.mineKey)?.items).toEqual([f.row]);
  expect(f.h.result.current.intents).toEqual([]);
  expect(f.client.getQueryData(ownPicker)).toBeUndefined();
  expect(f.client.getQueryData(otherPicker)).toEqual({ marker: "cached" });
  expect(f.client.getQueryData(catalog)).toEqual({ marker: "cached" });
});

it.each(["refused", "not-saved"] as const)(
  "preserves a failed local proposal for %s without repeating the write",
  async (failure) => {
    const f = setup(null, "game");
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        methods.push(method);
        if (method === "POST")
          return Response.json({ error: "REFUSED" }, { status: failure === "refused" ? 409 : 503 });
        return Response.json(f.page("mine", []));
      }),
    );
    act(() => f.h.result.current.actions.propose(f.submit));
    await waitFor(() => expect(f.h.result.current.actions.submit.isError).toBe(true));
    expect(methods).toEqual(failure === "refused" ? ["POST"] : ["POST", "GET"]);
    expect(f.h.result.current.intents).toHaveLength(1);
    expect(f.h.result.current.intents[0].variables.payload).toEqual(f.row.payload);
    expect(f.client.getQueryData<EventProposalsResponse>(f.mineKey)?.items).toEqual([]);
    expect(f.h.result.current.actions.busy).toBe(false);
    expect(f.feedback.onError).toHaveBeenCalledOnce();
  },
);

it.each(["event", "author", "correlation"] as const)(
  "does not publish a successful submit response with the wrong %s identity",
  async (changed) => {
    const f = setup();
    const saved = {
      ...f.row,
      ...(changed === "event" ? { eventId: plannedTable.id } : {}),
      ...(changed === "author" ? { userId: "other" } : {}),
      ...(changed === "correlation" ? { clientRequestId: plannedTable.id } : {}),
    };
    const fetcher = vi.fn(async () => Response.json(saved));
    vi.stubGlobal("fetch", fetcher);
    let done: Promise<unknown>;
    act(() => {
      done = f.h.result.current.actions.submit
        .mutateAsync({ ...f.submit, clientOwner: f.owner })
        .catch((error: unknown) => error);
    });
    await waitFor(() =>
      expect(f.feedback.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "MUTATION_READ_UNVERIFIED" }),
        "verify_saved_changes",
      ),
    );
    expect(f.client.getQueryData<EventProposalsResponse>(f.mineKey)?.items).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
    // An unverifiable receipt stays uncertain. Logout cancels that real operation,
    // rather than turning uncertainty into an invented rejection or successful row.
    await act(async () => {
      clearSessionQueryCache(f.client);
      await done;
    });
    expect(f.client.getQueryData(f.mineKey)).toBeUndefined();
  },
);

it.each(["version", "status"] as const)(
  "rejects a lost review readback with changed %s without repeating the decision",
  async (changed) => {
    const f = setup(null);
    const proposal = {
      ...f.row,
      version: changed === "version" ? 4 : 2,
      status: changed === "status" ? ("ACCEPTED" as const) : ("REJECTED" as const),
    };
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        methods.push(method);
        if (method === "POST") return Response.json({ error: "LOST" }, { status: 503 });
        return Response.json({ proposal, event: { ...f.event, version: 2 } });
      }),
    );
    act(() => f.h.result.current.actions.decide(f.review));
    await waitFor(() => expect(f.h.result.current.actions.review.isError).toBe(true));
    expect(f.h.result.current.actions.review.error).toMatchObject({ code: "PROPOSAL_CHANGED" });
    expect(methods).toEqual(["POST", "GET"]);
    expect(f.client.getQueryData<EventProposalsResponse>(f.reviewKey)?.items[0]).toEqual(f.row);
    expect(f.client.getQueryData(eventRecordKeys.detail(f.options, f.event.id))).toEqual(f.event);
    expect(f.h.result.current.actions.busy).toBe(false);
  },
);

it.each(["event", "proposal", "proposal-event", "version", "status"] as const)(
  "keeps a directly returned review with wrong %s identity uncommitted until owner cancellation",
  async (changed) => {
    const f = setup();
    const saved: ReviewEventProposalResponse = {
      proposal: {
        ...f.row,
        version: changed === "version" ? 3 : 2,
        status: changed === "status" ? "ACCEPTED" : "REJECTED",
        ...(changed === "proposal" ? { id: plannedTable.id } : {}),
        ...(changed === "proposal-event" ? { eventId: plannedTable.id } : {}),
      },
      event: { ...f.event, id: changed === "event" ? plannedTable.id : f.event.id, version: 2 },
    };
    const fetcher = vi.fn(async () => Response.json(saved));
    vi.stubGlobal("fetch", fetcher);
    let done: Promise<unknown>;
    act(() => {
      done = f.h.result.current.actions.review
        .mutateAsync({ ...f.review, clientOwner: f.owner })
        .catch((error: unknown) => error);
    });
    await waitFor(() =>
      expect(f.feedback.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "MUTATION_READ_UNVERIFIED" }),
        "verify_saved_changes",
      ),
    );
    expect(f.client.getQueryData(eventRecordKeys.detail(f.options, f.event.id))).toEqual(f.event);
    expect(f.client.getQueryData<EventProposalsResponse>(f.reviewKey)?.items[0].status).toBe(
      "PENDING",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    await act(async () => {
      clearSessionQueryCache(f.client);
      await done;
    });
    expect(f.client.getQueryData(f.reviewKey)).toBeUndefined();
  },
);

it.each(["missing", "older", "newer"] as const)(
  "reconciles a verified rejection against %s detail and leaves newer or unrelated list records intact",
  async (detail) => {
    const f = setup(null);
    const detailKey = eventRecordKeys.detail(f.options, f.event.id);
    if (detail === "missing") f.client.removeQueries({ queryKey: detailKey, exact: true });
    if (detail === "newer")
      f.client.setQueryData(detailKey, { ...f.event, version: 5, name: "Newer event name" });
    const listKey = eventRecordsQuery(f.options, { section: "mine" }).queryKey;
    const newerKey = eventRecordsQuery(f.options, { section: "mine", query: "Newer" }).queryKey;
    const unrelated = { ...f.event, id: plannedTable.id, name: "Unrelated event" };
    f.client.setQueryData(listKey, {
      pages: [{ items: [f.event, unrelated], nextCursor: null }],
      pageParams: [""],
    });
    f.client.setQueryData(newerKey, {
      pages: [{ items: [{ ...f.event, version: 5, name: "Newer event name" }], nextCursor: null }],
      pageParams: [""],
    });
    const saved: ReviewEventProposalResponse = {
      proposal: { ...f.row, version: 2, status: "REJECTED" },
      event: { ...f.event, version: 2, name: "Authoritative event" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(saved)),
    );
    act(() => f.h.result.current.actions.decide(f.review));
    await waitFor(() => expect(f.h.result.current.actions.review.isSuccess).toBe(true));
    expect(f.client.getQueryData(detailKey)).toEqual(
      detail === "newer" ? { ...f.event, version: 5, name: "Newer event name" } : saved.event,
    );
    expect(
      f.client.getQueryData<{ pages: { items: (typeof f.event)[] }[] }>(listKey)?.pages[0].items,
    ).toEqual([saved.event, unrelated]);
    expect(
      f.client.getQueryData<{ pages: { items: (typeof f.event)[] }[] }>(newerKey)?.pages[0]
        .items[0],
    ).toMatchObject({ version: 5, name: "Newer event name" });
    expect(f.client.getQueryData<EventProposalsResponse>(f.reviewKey)?.items[0]).toEqual(
      saved.proposal,
    );
    expect(f.client.getQueryState(listKey)?.isInvalidated).toBe(false);
  },
);

it("reconciles a lost rejection receipt and revokes private review data after authoritative manager loss", async () => {
  const f = setup();
  const saved: ReviewEventProposalResponse = {
    proposal: { ...f.row, version: 2, status: "REJECTED" },
    event: { ...f.event, version: 2, canManage: false },
  };
  const methods: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (method === "POST") throw new TypeError("Lost response");
      return Response.json(saved);
    }),
  );
  act(() => f.h.result.current.actions.decide(f.review));
  await waitFor(() => expect(f.h.result.current.actions.review.isSuccess).toBe(true));
  expect(methods).toEqual(["POST", "GET"]);
  expect(f.client.getQueryData(f.reviewKey)).toBeUndefined();
  expect(f.client.getQueryData(f.mineKey)).toBeDefined();
  expect(f.client.getQueryData(eventRecordKeys.detail(f.options, f.event.id))).toMatchObject({
    canManage: false,
    version: 2,
  });
});

it.each(["submit", "review"] as const)(
  "does not reconcile late %s completion or feedback after the owner is cancelled",
  async (action) => {
    for (const status of [200, 409]) {
      const f = setup();
      let finish: (response: Response) => void = () => {};
      const fetcher = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      let done: Promise<unknown>;
      act(() => {
        done = (
          action === "submit"
            ? f.h.result.current.actions.submit.mutateAsync({ ...f.submit, clientOwner: f.owner })
            : f.h.result.current.actions.review.mutateAsync({ ...f.review, clientOwner: f.owner })
        ).catch((error: unknown) => error);
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      act(() => clearSessionQueryCache(f.client));
      const foreign = ["events", API, "next-owner", "detail", f.event.id];
      f.client.setQueryData(foreign, { ...f.event, name: "Next owner event" });
      await act(async () => {
        finish(
          status === 409
            ? Response.json({ error: "REFUSED" }, { status })
            : Response.json(
                action === "submit"
                  ? f.row
                  : {
                      proposal: { ...f.row, version: 2, status: "REJECTED" },
                      event: { ...f.event, version: 2 },
                    },
              ),
        );
        await done;
      });
      expect(f.client.getQueryData(foreign)).toMatchObject({ name: "Next owner event" });
      expect(f.client.getQueryData(f.reviewKey)).toBeUndefined();
      expect(f.feedback.onError).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
      f.h.unmount();
    }
  },
);
