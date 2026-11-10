import type { EventProposalResponse, EventProposalsResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventRecordKeys,
  eventRecordQuery,
  groupRecordDetailQuery,
  groupRecordKeys,
  useEventProposalActions,
  useEventProposalEditor,
  useEventProposalIntents,
  useEventProposalSection,
  useEventProposals,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventProposalEditor } from "../EventProposalEditor";
import { EventProposalItem } from "../EventProposalItem";
import { EventProposalSection } from "../EventProposalSection";
import { EventWizard } from "../EventWizard";

const navigation = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => o }));
vi.mock("@/components/games/SearchGamePage", () => ({
  SearchGamePage: (p: {
    onSelect: (g: { id: number; name: string }) => void;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => p.onSelect({ id: 2, name: "Selected game" })}>
        Choose candidate game
      </button>
      <button type="button" onClick={p.onClose}>
        Close picker
      </button>
    </div>
  ),
}));
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: (p: {
    onSelect: (v: (typeof plannedEvent.locations)[number]) => void;
    onClose: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => p.onSelect({ ...plannedEvent.locations[0], name: "Selected venue" })}
      >
        Choose candidate venue
      </button>
      <button type="button" onClick={p.onClose}>
        Close picker
      </button>
    </div>
  ),
}));
const o = {
  apiUrl: "https://api.test",
  userId: "actor",
  getToken: vi.fn(async () => "fresh"),
  feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
};
const event = {
  ...plannedEvent,
  adminUserId: "creator",
  groupId: optionId,
  groupType: "PRIVATE" as const,
  canManage: true,
  allowParticipantDates: true,
  allowParticipantLocations: true,
  canProposeDates: true,
  canProposeLocations: true,
  myRegistrations: [seat("actor")],
  canVote: true,
};
const participantEvent = { ...event, canManage: false, role: "participant" as const };
const table = {
  ...plannedTable,
  groupId: optionId,
  groupType: "PRIVATE" as const,
  canProposeGames: true,
  allowParticipantGames: true,
  myRegistration: seat("actor"),
  myPosition: "SEATED" as const,
};
const row = (id = optionId): EventProposalResponse => ({
  id,
  eventId: event.id,
  groupId: optionId,
  userId: "actor",
  authorName: "Player",
  clientRequestId: id,
  label: "New date",
  payload: { kind: "date", day: "2030-06-04", startTime: "20:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
});
const page = (
  items = [row()],
  mode: "mine" | "review" = "review",
  nextCursor: string | null = null,
): EventProposalsResponse => ({
  eventId: event.id,
  groupId: optionId,
  eventVersion: 1,
  mode,
  items,
  nextCursor,
});
const scope = {
  eventId: event.id,
  groupId: optionId,
  kind: "date" as const,
  mode: "review" as const,
};
const clients: QueryClient[] = [];
function setup(asParticipant = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(
    eventRecordKeys.detail(o, event.id),
    asParticipant ? participantEvent : event,
  );
  client.setQueryData(eventRecordKeys.table(o, event.id, table.id), table);
  client.setQueryData(eventProposalKeys.page(o, scope), page());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => {
  clients.splice(0).forEach(clearSessionQueryCache);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("renders date/time icons without zone shifts, verified place labels and the real proposed game cover", () => {
  const view = renderWithI18n(<EventProposalItem row={row()} />);
  const date = screen.getByTestId(`event-proposal-${optionId}`);
  expect(date.querySelectorAll("time")).toHaveLength(2);
  expect(date.querySelectorAll("svg")).toHaveLength(2);
  expect(date.querySelector("time")?.dateTime).toBe("2030-06-04T20:00:00Z");
  view.rerender(
    <EventProposalItem
      row={{ ...row(), payload: { kind: "location", location: event.locations[0] } }}
    />,
  );
  expect(screen.getByText(event.locations[0].name)).toBeTruthy();
  expect(screen.getByText(event.locations[0].address)).toBeTruthy();
  view.rerender(
    <EventProposalItem
      row={{
        ...row(),
        label: "Selected game",
        payload: { kind: "game", tableId: table.id, gameId: 2 },
        game: { id: 2, name: "Selected game", imageUrl: "https://cf.geekdo-images.com/real.jpg" },
      }}
    />,
  );
  expect(screen.getByText("Selected game").parentElement?.textContent).toBe("Selected game");
  expect(date.querySelector("img")?.getAttribute("src")).toBe(
    "https://cf.geekdo-images.com/real.jpg",
  );
  fireEvent.error(date.querySelector("img")!);
  expect(date.querySelector("img")).toBeNull();
  expect(date.querySelector("svg")).toBeTruthy();
});
it("lets a seated non-manager submit a date with the shared inline chooser, without an intermediate route or invented consent", async () => {
  const f = setup(true),
    posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Response.json(
          { ...row(), clientRequestId: body.clientRequestId, payload: body.payload },
          { status: 201 },
        );
      }
      return Response.json(page());
    }),
  );
  renderWithI18n(
    <QueryClientProvider client={f.client}>
      <EventProposalSection event={participantEvent} kind="date" />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-05T21:00" },
  });
  expect(posts).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({
    eventVersion: 1,
    payload: { kind: "date", day: "2030-06-05", startTime: "21:00" },
  });
  expect(navigation.push).not.toHaveBeenCalled();
  expect(f.client.getQueryData(eventRecordKeys.detail(o, event.id))).toEqual(participantEvent);
});
it("reviews a whole game group once and reconciles all receipts/owned scopes after source readback", async () => {
  const f = setup(),
    gameScope = { ...scope, kind: "game" as const, tableId: table.id };
  const first = {
      ...row(),
      userId: "other",
      payload: { kind: "game" as const, tableId: table.id, gameId: 2 },
    },
    second = { ...first, id: "second", userId: o.userId };
  const grouped = {
    ...first,
    groupRevision: "a".repeat(64),
    gameSuggestions: [first, second].map((p) => ({
      id: p.id,
      userId: p.userId,
      authorName: p.authorName,
      version: p.version,
      status: p.status,
    })),
  };
  const reviewKey = eventProposalKeys.page(o, gameScope),
    mineKey = eventProposalKeys.page(o, { ...gameScope, mode: "mine" });
  f.client.setQueryData(reviewKey, page([grouped]));
  f.client.setQueryData(mineKey, page([second], "mine"));
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((r) => (resolve = r));
  const fetch = vi.fn((_url: string, _init?: RequestInit) => pending);
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(() => useEventProposalActions(o, event.id, optionId, "game", table.id), {
    wrapper: f.wrapper,
  });
  act(() =>
    h.result.current.decide({
      proposalId: first.id,
      version: 1,
      eventVersion: 1,
      action: "accept",
      groupRevision: grouped.groupRevision,
      game: { gameId: 2, tableId: table.id },
    }),
  );
  await waitFor(() =>
    expect((f.client.getQueryData(mineKey) as any).items[0]).toMatchObject({
      clientAction: "accept",
      status: "PENDING",
    }),
  );
  const saved = [first, second].map((p) => ({
    ...p,
    status: "ACCEPTED",
    version: 2,
    reviewBatchId: optionId,
  }));
  resolve(Response.json({ proposal: saved[0], proposals: saved, event: { ...event, version: 2 } }));
  await waitFor(() => expect(h.result.current.review.isSuccess).toBe(true));
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    action: "accept",
    version: 1,
    eventVersion: 1,
    groupRevision: "a".repeat(64),
  });
  expect((f.client.getQueryData(mineKey) as EventProposalsResponse).items[0]).toMatchObject({
    id: second.id,
    status: "ACCEPTED",
    version: 2,
  });
  expect(
    (f.client.getQueryData(reviewKey) as EventProposalsResponse).items[0].gameSuggestions?.every(
      (p) => p.status === "ACCEPTED",
    ),
  ).toBe(true);
});
it("source-pages five rows with fresh JWT, distinct scopes and stale/unmounted callback fences", async () => {
  const f = setup();
  let token = 0;
  o.getToken.mockImplementation(async () => `token-${++token}`);
  const fetch = vi.fn(async () => Response.json(page([row("later")], "review", null)));
  vi.stubGlobal("fetch", fetch);
  f.client.setQueryData(eventProposalKeys.page(o, scope), page([row()], "review", "next"));
  const h = renderHook(({ userId }) => useEventProposals({ ...o, userId }, scope), {
    wrapper: f.wrapper,
    initialProps: { userId: "actor" },
  });
  const next = h.result.current.next;
  act(() => {
    next();
    next();
  });
  await waitFor(() => expect(h.result.current.items[0]?.id).toBe("later"));
  expect(h.result.current.page).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("kind=date&mode=review&limit=5&cursor=next"),
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
    }),
  );
  act(() => h.result.current.previous());
  expect(h.result.current.items[0]?.id).toBe(optionId);
  f.client.setQueryData(
    eventProposalKeys.page({ ...o, userId: "other" }, scope),
    page([row("other")]),
  );
  const stale = h.result.current.next;
  h.rerender({ userId: "other" });
  act(() => stale());
  expect(h.result.current.page).toBe(1);
  expect(h.result.current.items[0]?.id).toBe("other");
  const closed = h.result.current.next;
  h.unmount();
  act(() => closed());
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps failures observable and denial terminal without leaking a cached manager queue", async () => {
  const f = setup(),
    fetch = vi.fn(async () => Response.json({ error: "EVENT_ADMIN_REQUIRED" }, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(() => useEventProposals(o, scope), { wrapper: f.wrapper });
  await act(() => h.result.current.refetch());
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.items).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(f.client.getQueryData(eventProposalKeys.page(o, scope))).toBeUndefined();
});
it("submits immediately as local intent, never fabricates an API record, then commits a matching canonical receipt", async () => {
  const f = setup();
  f.client.setQueryData(eventProposalKeys.page(o, { ...scope, mode: "mine" }), page([], "mine"));
  let release: (value: Response) => void = () => {};
  let saved = row();
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body).sort()).toEqual(["clientRequestId", "eventVersion", "payload"]);
      saved = { ...row(), clientRequestId: body.clientRequestId };
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return Response.json(page([saved], String(_url).includes("mode=mine") ? "mine" : "review"));
  });
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(
    () => ({
      a: useEventProposalActions(o, event.id, optionId),
      intents: useEventProposalIntents(o, event.id),
    }),
    { wrapper: f.wrapper },
  );
  act(() =>
    h.result.current.a.propose({
      eventVersion: 1,
      payload: row().payload,
      clientLabel: "Draft date",
    }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(h.result.current.intents[0].variables.clientLabel).toBe("Draft date");
  expect(
    f.client.getQueryData<EventProposalsResponse>(
      eventProposalKeys.page(o, { ...scope, mode: "mine" }),
    )?.items,
  ).toEqual([]);
  expect(o.feedback.onOptimisticUpdate).toHaveBeenCalledWith("propose_event_option");
  await act(async () => release(Response.json(saved, { status: 201 })));
  await waitFor(() => expect(h.result.current.a.submit.isSuccess).toBe(true));
  expect(h.result.current.intents).toEqual([]);
  expect(
    f.client.getQueryData<EventProposalsResponse>(
      eventProposalKeys.page(o, { ...scope, mode: "mine" }),
    )?.items[0].clientRequestId,
  ).toBe(saved.clientRequestId);
});
it("retains a verifiably unsaved draft, gives explicit edited retry a fresh correlation, and replaces only that local failed intent", async () => {
  const f = setup(true);
  let posts = 0;
  const bodies: { clientRequestId: string; payload: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        if (++posts === 1) throw new TypeError("Failed to fetch");
        return Response.json(
          {
            ...row("44444444-4444-4444-8444-444444444444"),
            clientRequestId: body.clientRequestId,
            payload: body.payload,
          },
          { status: 201 },
        );
      }
      return Response.json(page([], "mine"));
    }),
  );
  const first = renderHook(
    () => ({
      a: useEventProposalActions(o, event.id, optionId, "date"),
      intents: useEventProposalIntents(o, event.id, "date"),
    }),
    { wrapper: f.wrapper },
  );
  act(() =>
    first.result.current.a.propose({
      eventVersion: 1,
      payload: row().payload,
      clientLabel: "Original date",
    }),
  );
  await waitFor(() => expect(first.result.current.a.submit.isError).toBe(true));
  expect(first.result.current.a.submit.error).toMatchObject({ code: "PROPOSAL_NOT_SAVED" });
  const draftId = first.result.current.intents[0].draftId;
  const editor = renderHook(() => useEventProposalEditor(o, event.id, "date", undefined, draftId), {
    wrapper: f.wrapper,
  });
  expect(editor.result.current.payload).toEqual(row().payload);
  act(() => editor.result.current.chooseDate("2030-06-08T21:00"));
  act(() => expect(editor.result.current.submit()).toBe(true));
  await waitFor(() => expect(first.result.current.intents).toEqual([]));
  expect(posts).toBe(2);
  expect(bodies[1].clientRequestId).not.toBe(bodies[0].clientRequestId);
  expect(bodies[1].payload).toMatchObject({ day: "2030-06-08" });
});
it("active manager observers clear private rows on role loss, while own proposals remain cached", async () => {
  const f = setup(),
    own = eventProposalKeys.page(o, { ...scope, mode: "mine" });
  f.client.setQueryData(own, page([], "mine"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      String(url).includes("/groups/")
        ? Response.json({ id: optionId, role: "member", myMembership: { status: "ACCEPTED" } })
        : Response.json({ error: "EVENT_ADMIN_REQUIRED" }, { status: 403 }),
    ),
  );
  const h = renderHook(() => useEventProposals(o, scope), { wrapper: f.wrapper });
  expect(h.result.current.items).toHaveLength(1);
  await act(() => f.client.fetchQuery({ ...groupRecordDetailQuery(o, optionId), staleTime: 0 }));
  await waitFor(() => expect(h.result.current.items).toEqual([]));
  expect(h.result.current.hasVerifiedBase).toBe(false);
  expect(f.client.getQueryData(own)).toBeDefined();
});
it("restored cached private content grants no review action before authoritative readback", async () => {
  const f = setup();
  f.client
    .getQueryCache()
    .find({ queryKey: eventProposalKeys.page(o, scope) })
    ?.setState({ isInvalidated: true });
  let complete: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    ),
  );
  const h = renderHook(() => useEventProposalSection(o, event, "date"), { wrapper: f.wrapper });
  expect(h.result.current.q.items).toHaveLength(1);
  act(() => h.result.current.open(row(), "accept"));
  expect(h.result.current.decision).toBeNull();
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  await act(async () => complete(Response.json(page())));
  await waitFor(() => expect(h.result.current.q.hasVerifiedBase).toBe(true));
  act(() => h.result.current.open(row(), "accept"));
  expect(h.result.current.validDecision).toBe(true);
});
it("marks only a pending review, preserves status/options, then selectively rolls back a refused decision", async () => {
  const f = setup();
  let reject: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: unknown, i?: RequestInit) =>
      i?.method === "POST"
        ? new Promise<Response>((resolve) => {
            reject = resolve;
          })
        : Response.json(page()),
    ),
  );
  const h = renderHook(() => useEventProposalActions(o, event.id, optionId), {
    wrapper: f.wrapper,
  });
  act(() =>
    h.result.current.decide({
      proposalId: optionId,
      version: 1,
      eventVersion: 1,
      action: "accept",
    }),
  );
  await waitFor(() =>
    expect(
      f.client.getQueryData<EventProposalsResponse>(eventProposalKeys.page(o, scope))?.items[0],
    ).toHaveProperty("clientAction", "accept"),
  );
  expect(
    f.client.getQueryData<EventProposalsResponse>(eventProposalKeys.page(o, scope))?.items[0]
      .status,
  ).toBe("PENDING");
  expect(f.client.getQueryData(eventRecordKeys.detail(o, event.id))).toEqual(event);
  await act(async () => reject(Response.json({ error: "EVENT_CHANGED" }, { status: 409 })));
  await waitFor(() => expect(h.result.current.review.isError).toBe(true));
  expect(
    f.client.getQueryData<EventProposalsResponse>(eventProposalKeys.page(o, scope))?.items[0],
  ).not.toHaveProperty("clientAction");
  expect(o.feedback.onError).toHaveBeenCalled();
});
it("verifies lost submit/review receipts through bounded GETs, never retries a write", async () => {
  const f = setup();
  let saved = row();
  let posts = 0;
  const fetch = vi.fn(async (url: unknown, i?: RequestInit) => {
    const path = String(url);
    if (i?.method === "POST") {
      posts++;
      const body = JSON.parse(String(i.body));
      if (path.endsWith("/proposals")) saved = { ...row(), clientRequestId: body.clientRequestId };
      else saved = { ...saved, status: "ACCEPTED", version: 2, canonicalOptionId: optionId };
      throw new TypeError("Failed to fetch");
    }
    if (path.includes("clientRequestId=")) return Response.json(page([saved], "mine"));
    if (path.endsWith(`/proposals/${optionId}`))
      return Response.json({ proposal: saved, event: { ...event, version: 2 } });
    return Response.json(page([saved]));
  });
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(() => useEventProposalActions(o, event.id, optionId), {
    wrapper: f.wrapper,
  });
  act(() =>
    h.result.current.propose({ eventVersion: 1, payload: row().payload, clientLabel: "Date" }),
  );
  await waitFor(() => expect(h.result.current.submit.isSuccess).toBe(true));
  expect(posts).toBe(1);
  act(() =>
    h.result.current.decide({
      proposalId: optionId,
      version: 1,
      eventVersion: 1,
      action: "accept",
    }),
  );
  await waitFor(() => expect(h.result.current.review.isSuccess).toBe(true));
  expect(posts).toBe(2);
  expect(fetch.mock.calls.some(([url]) => String(url).includes("clientRequestId="))).toBe(true);
  expect(
    f.client.getQueryData<{ version: number }>(eventRecordKeys.detail(o, event.id))?.version,
  ).toBe(2);
});
it("purges manager-only pages on authoritative Event/Group demotion even when membership remains accepted", async () => {
  const f = setup(),
    own = eventProposalKeys.page(o, { ...scope, mode: "mine" });
  f.client.setQueryData(own, page([], "mine"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      String(url).includes("/groups/")
        ? Response.json({ id: optionId, role: "member", myMembership: { status: "ACCEPTED" } })
        : Response.json({ ...event, canManage: false, role: "participant" }),
    ),
  );
  await f.client.fetchQuery({ ...eventRecordQuery(o, event.id), staleTime: 0 });
  expect(f.client.getQueryState(eventProposalKeys.page(o, scope))).toBeUndefined();
  expect(f.client.getQueryData(own)).toBeDefined();
  f.client.setQueryData(eventProposalKeys.page(o, scope), page());
  await f.client.fetchQuery({ ...groupRecordDetailQuery(o, optionId), staleTime: 0 });
  expect(f.client.getQueryState(eventProposalKeys.page(o, scope))).toBeUndefined();
  expect(f.client.getQueryData(own)).toBeDefined();
});
it("captures decisions, blocks stale or restored/unverified authority, keeps cancel available and freezes outside planning", async () => {
  const f = setup();
  const h = renderHook(
    ({ value, disabled }) => useEventProposalSection(o, value, "date", undefined, disabled),
    { wrapper: f.wrapper, initialProps: { value: event, disabled: false } },
  );
  act(() => h.result.current.open(row(), "accept"));
  expect(h.result.current.validDecision).toBe(true);
  h.rerender({ value: { ...event, version: 2 }, disabled: false });
  expect(h.result.current.validDecision).toBe(false);
  act(() => h.result.current.confirm());
  expect(h.result.current.actions.review.isPending).toBe(false);
  act(() => h.result.current.cancel());
  expect(h.result.current.decision).toBeNull();
  h.rerender({ value: { ...event, status: "CONFIRMED" }, disabled: false });
  expect(h.result.current.canPropose).toBe(false);
  act(() => h.result.current.open(row(), "accept"));
  expect(h.result.current.decision).not.toBeNull();
  expect(h.result.current.validDecision).toBe(false);
  act(() => h.result.current.confirm("reject"));
  expect(h.result.current.actions.review.isPending).toBe(false);
  act(() => h.result.current.cancel());
  expect(h.result.current.decision).toBeNull();
});
it("renders real proposal queues, confirms one optimistic decision, and exposes no manager controls to ordinary/public/frozen viewers", async () => {
  const f = setup();
  let complete: (value: Response) => void = () => {};
  let saved = row();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: unknown, i?: RequestInit) =>
      i?.method === "POST"
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : Response.json(page([saved])),
    ),
  );
  const view = renderWithI18n(
    <QueryClientProvider client={f.client}>
      <EventProposalSection event={event} kind="date" />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Player")).toBeNull();
  const reviewAction = screen.getByRole("button", { name: /^Review proposal:/ });
  expect(reviewAction.className).toContain("button--primary");
  expect(reviewAction.className).toContain("button--sm");
  expect(reviewAction.className).toContain("rounded-full");
  expect(reviewAction.querySelector(".size-7")).toBeNull();
  fireEvent.click(reviewAction);
  expect(within(screen.getByRole("dialog")).getByText("Player")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Review proposal:/ }));
  const button = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Accept",
  });
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject" })).toBeTruthy();
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText("Accepting proposal");
  expect(
    f.client.getQueryData<EventProposalsResponse>(eventProposalKeys.page(o, scope))?.items[0]
      .status,
  ).toBe("PENDING");
  saved = { ...saved, status: "ACCEPTED", version: 2 };
  await act(async () =>
    complete(Response.json({ proposal: saved, event: { ...event, version: 2 } })),
  );
  await screen.findByText("Accepted");
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <QueryClientProvider client={f.client}>
      <EventProposalSection event={{ ...event, status: "CONFIRMED" }} kind="date" />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("button", { name: "Add proposal" })).toBeNull();
  f.client.setQueryData(eventProposalKeys.page(o, { ...scope, mode: "mine" }), page([], "mine"));
  view.rerender(
    <QueryClientProvider client={f.client}>
      <EventProposalSection
        event={{ ...event, canManage: false, canProposeDates: false }}
        kind="date"
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "Proposed dates/times" })).toBeTruthy();
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.queryByRole("button", { name: /Accept proposal/ })).toBeNull();
  view.rerender(
    <QueryClientProvider client={f.client}>
      <EventProposalSection event={{ ...event, groupType: "PUBLIC", readOnly: true }} kind="date" />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("heading", { name: /Proposed/ })).toBeNull();
});
it.each(["date", "game", "location"] as const)(
  "opens %s chooser directly, cancels without a write and submits only final picker selection",
  async (kind) => {
    const f = setup(true),
      posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, i?: RequestInit) => {
        if (i?.method === "POST") {
          posts.push(JSON.parse(String(i.body)));
          return Response.json(
            {
              ...row(),
              clientRequestId: (posts[0] as { clientRequestId: string }).clientRequestId,
              payload: (posts[0] as { payload: unknown }).payload,
            },
            { status: 201 },
          );
        }
        return Response.json({ items: [], nextCursor: null });
      }),
    );
    const chooser = (
      <QueryClientProvider client={f.client}>
        <EventProposalEditor eventId={event.id} kind={kind} tableId={table.id} />
      </QueryClientProvider>
    );
    const view = renderWithI18n(chooser);
    expect(posts).toEqual([]);
    if (kind === "date") {
      fireEvent.change(screen.getByLabelText("Choose date and time"), {
        target: { value: "2030-06-05T21:00" },
      });
      expect(posts).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Send proposal" }));
    } else {
      expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close picker" }));
      expect(posts).toEqual([]);
      expect(navigation.back).toHaveBeenCalledTimes(1);
      view.unmount();
      navigation.back.mockClear();
      renderWithI18n(chooser);
      fireEvent.click(
        screen.getByRole("button", {
          name: kind === "game" ? "Choose candidate game" : "Choose candidate venue",
        }),
      );
    }
    expect(navigation.back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ eventVersion: 1, payload: { kind } });
    expect(posts[0]).not.toHaveProperty("clientLabel");
  },
);
it("edits private category opt-ins through the real wizard and sends all three flags only on final save", async () => {
  const f = setup(),
    group = { ...groupRecord, id: optionId, adminUserId: "creator", role: "moderator" as const };
  f.client.setQueryData(groupRecordKeys.detail(o, optionId), group);
  f.client.setQueryData(eventRecordKeys.detail(o, event.id), {
    ...event,
    allowParticipantDates: false,
    allowParticipantLocations: false,
    canProposeDates: false,
    canProposeLocations: false,
  });
  f.client.setQueryData(eventRecordKeys.tables(o, event.id), {
    pages: [
      {
        items: [{ ...table, allowParticipantGames: false, canProposeGames: false }],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  });
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        return Response.json({ ...event, ...body, version: 2 });
      }
      if (String(url).includes("/groups/")) return Response.json(group);
      if (String(url).includes("/tables"))
        return Response.json({ items: [table], nextCursor: null });
      return Response.json(event);
    }),
  );
  renderWithI18n(
    <QueryClientProvider client={f.client}>
      <EventWizard eventId={event.id} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("switch", { name: "Allow date proposals" }));
  fireEvent.click(screen.getByRole("switch", { name: "Allow location proposals" }));
  expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("button", { name: table.name }));
  fireEvent.click(await screen.findByRole("switch", { name: "Allow game proposals" }));
  expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Save event" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    allowParticipantDates: true,
    allowParticipantLocations: true,
    tables: [{ allowParticipantGames: true }],
  });
});
it("editor keeps picker choice unsaved until explicit send and does not use another Table or unknown category", () => {
  const f = setup(true),
    fetch = vi.fn(async () => Response.json(page()));
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(({ kind }) => useEventProposalEditor(o, event.id, kind, table.id), {
    wrapper: f.wrapper,
    initialProps: { kind: "date" },
  });
  expect(h.result.current.canSubmit).toBe(false);
  act(() => h.result.current.chooseDate("2030-06-05T21:00"));
  expect(h.result.current.canSubmit).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  h.rerender({ kind: "invalid" });
  expect(h.result.current.canSubmit).toBe(false);
  expect(h.result.current.payload).toBeNull();
  expect(h.result.current.submit()).toBe(false);
});
