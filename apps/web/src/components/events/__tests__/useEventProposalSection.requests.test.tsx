import {
  type EventProposalResponse,
  type EventProposalsResponse,
  type PlannedEventResponse,
  type ReviewEventProposalInput,
  reviewEventProposalSchema,
  type SubmitEventProposalInput,
  submitEventProposalSchema,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventRecordKeys,
  useEventProposalEditor,
  useEventProposalSection,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { optionId, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";

const API = "https://proposal-hook.test";
const owner = { apiUrl: API, userId: "owner", getToken: async () => "fresh" };
const another = { ...owner, userId: "another-owner" };
const secondTableId = "44444444-4444-4444-8444-444444444444";
const proposalId = "55555555-5555-4555-8555-555555555555";
const nextId = "66666666-6666-4666-8666-666666666666";
const event: PlannedEventResponse = {
  ...plannedEvent,
  groupId: optionId,
  groupType: "PRIVATE",
  canManage: true,
  allowParticipantDates: true,
};
const participant: PlannedEventResponse = {
  ...event,
  canManage: false,
  role: "participant",
  canProposeDates: true,
  canProposeLocations: true,
  myRegistrations: [seat(owner.userId)],
};
const table = { ...plannedTable, allowParticipantGames: true, canProposeGames: true };
const row: EventProposalResponse = {
  id: proposalId,
  eventId: event.id,
  groupId: optionId,
  userId: owner.userId,
  authorName: "Player",
  clientRequestId: "77777777-7777-4777-8777-777777777777",
  label: "Terraforming Mars",
  payload: { kind: "game", gameId: 167791, tableId: table.id },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  groupRevision: "a".repeat(64),
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
const path = `/api/events/${event.id}/proposals`;
const submissions: SubmitEventProposalInput[] = [];
const decisions: ReviewEventProposalInput[] = [];
const reads: { cursor: string | null; kind: string | null; table: string | null }[] = [];
let client: QueryClient;
let rows: EventProposalResponse[];
let nextCursor: string | null;
let pendingPage: Promise<Response> | undefined;
let pendingSubmission: Promise<Response> | undefined;
let pendingDecision: Promise<Response> | undefined;
let serverVersion: number;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function page(mode: "review" | "mine", items = rows): EventProposalsResponse {
  return {
    eventId: event.id,
    groupId: optionId,
    eventVersion: serverVersion,
    items,
    nextCursor,
    mode,
  };
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  rows = [];
  reads.length = submissions.length = decisions.length = 0;
  pendingPage = pendingSubmission = pendingDecision = undefined;
  nextCursor = null;
  serverVersion = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh");
      if (url.pathname === `/api/events/${event.id}` && init?.method === "GET")
        return Response.json(participant);
      if (url.pathname.startsWith(`/api/events/${event.id}/tables/`) && init?.method === "GET")
        return Response.json({ ...table, id: url.pathname.split("/").at(-1) });
      if (url.pathname === path && init?.method === "GET") {
        const cursor = url.searchParams.get("cursor");
        reads.push({
          cursor,
          table: url.searchParams.get("tableId"),
          kind: url.searchParams.get("kind"),
        });
        const mode = url.searchParams.get("mode") === "mine" ? "mine" : "review";
        return (
          pendingPage ??
          Response.json(
            cursor ? { ...page(mode, [{ ...row, id: nextId }]), nextCursor: null } : page(mode),
          )
        );
      }
      if (url.pathname === path && init?.method === "POST") {
        submissions.push(submitEventProposalSchema.parse(JSON.parse(String(init.body))));
        if (!pendingSubmission) throw new Error("Expected the participant write gate");
        return pendingSubmission;
      }
      if (url.pathname === `${path}/${proposalId}` && init?.method === "POST") {
        decisions.push(reviewEventProposalSchema.parse(JSON.parse(String(init.body))));
        if (!pendingDecision) throw new Error("Expected the manager review gate");
        return pendingDecision;
      }
      throw new Error(`Unexpected proposal request ${url.pathname}`);
    }),
  );
});

afterEach(async () => {
  cleanup();
  await clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("scopes an actual game review to its table, submits its grouped revision, and removes the accepted game", async () => {
  rows = [row];
  client.setQueryData(eventRecordKeys.detail(owner, event.id), event);
  const combined = eventRecordKeys.tables(owner, null);
  const internal = eventRecordKeys.tables(owner, "other-event");
  client.setQueryData(combined, { pages: [], pageParams: [] });
  client.setQueryData(internal, { pages: [], pageParams: [] });
  const decision = Promise.withResolvers<Response>();
  pendingDecision = decision.promise;
  const { result } = renderHook(() => useEventProposalSection(owner, event, "game", table), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.q.hasVerifiedBase).toBe(true));
  expect(reads).toEqual([{ cursor: null, kind: "game", table: table.id }]);
  expect(result.current.q.items).toEqual([row]);
  act(() => result.current.confirm());
  expect(decisions).toEqual([]);
  act(() =>
    result.current.open({
      ...row,
      payload: { kind: "game", gameId: 167791, tableId: secondTableId },
    }),
  );
  expect(result.current.decision).toBeNull();
  act(() => result.current.open(row));
  expect(result.current.validDecision).toBe(true);
  act(() => result.current.confirm());
  await waitFor(() =>
    expect(decisions).toEqual([
      { action: "accept", version: 1, eventVersion: 1, groupRevision: row.groupRevision },
    ]),
  );
  const saved: EventProposalResponse = { ...row, version: 2, status: "ACCEPTED" };
  rows = [saved];
  serverVersion = 2;
  await act(async () => {
    decision.resolve(Response.json({ proposal: saved, event: { ...event, version: 2 } }));
  });
  await waitFor(() => expect(result.current.actions.review.isSuccess).toBe(true));
  expect(result.current.q.items).toEqual([]);
  expect(result.current.decision).toBeNull();
  expect(client.getQueryState(combined)?.isInvalidated).toBe(true);
  expect(client.getQueryState(internal)?.isInvalidated).toBe(false);
  expect(client.getQueryData(eventRecordKeys.detail(owner, event.id))).toMatchObject({
    version: 2,
  });
});

it("validates and coalesces inline date confirmation while a real participant write is pending", async () => {
  const request = Promise.withResolvers<Response>();
  const second = Promise.withResolvers<Response>();
  pendingSubmission = request.promise;
  const { result } = renderHook(() => useEventProposalSection(owner, participant, "date"), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.q.hasVerifiedBase).toBe(true));
  expect(result.current.canPropose).toBe(true);
  expect(result.current.submitDate("invalid local date")).toBe(false);
  expect(submissions).toEqual([]);
  act(() => {
    expect(result.current.submitDate("2030-06-04T20:00")).toBe(true);
    expect(result.current.submitDate("2030-06-04T20:00")).toBe(false);
  });
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0]).toMatchObject({
    eventVersion: 1,
    payload: { kind: "date", day: "2030-06-04", startTime: "20:00" },
  });
  const saved = {
    ...row,
    label: "Tuesday evening",
    payload: submissions[0].payload,
    clientRequestId: submissions[0].clientRequestId,
  };
  rows = [saved];
  await act(async () => request.resolve(Response.json(saved, { status: 201 })));
  await waitFor(() => expect(result.current.q.items).toEqual([saved]));
  await waitFor(() => expect(result.current.canPropose).toBe(true));
  pendingSubmission = second.promise;
  act(() => expect(result.current.submitDate("2030-06-05T20:00")).toBe(true));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1].clientRequestId).not.toBe(submissions[0].clientRequestId);
  await act(async () =>
    second.resolve(Response.json({ error: "DATE_DUPLICATE" }, { status: 400 })),
  );
  await waitFor(() => expect(result.current.actions.submit.isError).toBe(true));
});

it("holds source-page boundaries during loading and ignores a previous-page callback from another account", async () => {
  const list = Promise.withResolvers<Response>();
  pendingPage = list.promise;
  rows = [row];
  nextCursor = "game-cursor";
  const scope = {
    eventId: event.id,
    groupId: optionId,
    kind: "game",
    tableId: table.id,
    mode: "review",
  } as const;
  const { result, rerender } = renderHook(
    ({ options }) => useEventProposalSection(options, event, "game", table),
    { wrapper: Wrapper, initialProps: { options: owner } },
  );
  act(() => result.current.q.next());
  expect(result.current.q.page).toBe(1);
  expect(reads.filter(({ cursor }) => cursor !== null)).toEqual([]);

  pendingPage = undefined;
  await act(async () => list.resolve(Response.json(page("review"))));
  await waitFor(() => expect(result.current.q.items).toEqual([row]));
  act(() => result.current.q.next());
  await waitFor(() => expect(result.current.q.items[0]?.id).toBe(nextId));
  const previousOwner = result.current.q.previous;
  expect(result.current.q.page).toBe(2);

  client.setQueryData(eventProposalKeys.page(another, scope), page("review"));
  rerender({ options: another });
  act(() => {
    previousOwner();
    result.current.q.previous();
  });
  expect(result.current.q.page).toBe(1);
  act(() => result.current.q.next());
  await waitFor(() => expect(result.current.q.items[0]?.id).toBe(nextId));
  expect(result.current.q.page).toBe(2);
  expect(reads.filter(({ cursor }) => cursor === "game-cursor")).toHaveLength(2);
});

it("coalesces a pending game submission when its authoritative proposal arrives before the receipt", async () => {
  const reply = Promise.withResolvers<Response>();
  pendingSubmission = reply.promise;
  const scope = {
    eventId: event.id,
    groupId: optionId,
    kind: "game",
    tableId: table.id,
    mode: "mine",
  } as const;
  const { result } = renderHook(() => useEventProposalSection(owner, participant, "game", table), {
    wrapper: Wrapper,
  });
  await waitFor(() =>
    expect(result.current.q.hasVerifiedBase && result.current.canPropose).toBe(true),
  );
  act(() =>
    result.current.actions.propose({
      eventVersion: 1,
      payload: row.payload,
      clientLabel: row.label,
    }),
  );
  await waitFor(() => {
    expect(submissions).toHaveLength(1);
    expect(result.current.intents).toHaveLength(1);
  });

  const authoritative = { ...row, clientRequestId: submissions[0].clientRequestId };
  rows = [authoritative];
  act(() => client.setQueryData(eventProposalKeys.page(owner, scope), page("mine")));
  await waitFor(() => expect(result.current.q.items).toEqual([authoritative]));
  expect(result.current.actions.submit.isPending).toBe(true);
  expect(result.current.intents).toEqual([]);

  await act(async () => reply.resolve(Response.json(authoritative, { status: 201 })));
  await waitFor(() => expect(result.current.actions.submit.isSuccess).toBe(true));
  expect(result.current.q.items).toEqual([authoritative]);
  expect(submissions).toHaveLength(1);
});

it("keeps a venue draft stable while discarding invalid coordinates and stale game picker output", async () => {
  const reply = Promise.withResolvers<Response>();
  pendingSubmission = reply.promise;
  const { result } = renderHook(() => useEventProposalEditor(owner, event.id, "location"), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.allowed).toBe(true));
  const venue = { ...event.locations[0], name: "Central library" };

  act(() => result.current.chooseLocation({ ...venue, latitude: 900 }));
  expect(result.current.payload).toBeNull();
  expect(result.current.canSubmit).toBe(false);
  act(() => result.current.chooseLocation(venue));
  expect(result.current.label).toBe("Central library");
  act(() => result.current.chooseGame({ id: 13, name: "Wrong picker result" }));
  expect(result.current.payload).toEqual({ kind: "location", location: venue });
  expect(result.current.canSubmit).toBe(true);

  act(() => expect(result.current.submit()).toBe(true));
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].payload).toEqual({ kind: "location", location: venue });
  await act(async () =>
    reply.resolve(
      Response.json({
        ...row,
        clientRequestId: submissions[0].clientRequestId,
        payload: submissions[0].payload,
        label: "Central library",
      }),
    ),
  );
  await waitFor(() => expect(result.current.actions.submit.isSuccess).toBe(true));
});

it("recovers a rejected game proposal only for the original table and reuses its request identity", async () => {
  const first = Promise.withResolvers<Response>();
  pendingSubmission = first.promise;
  const open = () => useEventProposalEditor(owner, event.id, "game", table.id);
  const initial = renderHook(open, { wrapper: Wrapper });
  await waitFor(() => expect(initial.result.current.allowed).toBe(true));
  act(() => initial.result.current.chooseGame({ id: 167791, name: "Terraforming Mars" }));
  act(() => expect(initial.result.current.submit()).toBe(true));
  await waitFor(() => expect(submissions).toHaveLength(1));
  await act(async () =>
    first.resolve(Response.json({ error: "CATALOG_CHANGED" }, { status: 400 })),
  );
  await waitFor(() => expect(initial.result.current.actions.submit.isError).toBe(true));
  const failed = client
    .getMutationCache()
    .getAll()
    .find((entry) => entry.state.status === "error");
  if (!failed) throw new Error("Expected an actual rejected game proposal");
  initial.unmount();

  const { result, rerender } = renderHook(
    ({ id }) => useEventProposalEditor(owner, event.id, "game", id, String(failed.mutationId)),
    { wrapper: Wrapper, initialProps: { id: secondTableId } },
  );
  await waitFor(() => expect(result.current.table.data?.id).toBe(secondTableId));
  expect(result.current.allowed).toBe(false);
  expect(result.current.payload).toBeNull();
  expect(result.current.submit()).toBe(false);
  rerender({ id: table.id });
  // Recovery is initialized at route mount. A reused form cannot inherit another table's input.
  await waitFor(() => expect(result.current.allowed).toBe(true));
  expect(result.current.payload).toBeNull();
  act(() => result.current.chooseGame({ id: 167791, name: "Terraforming Mars" }));

  const second = Promise.withResolvers<Response>();
  pendingSubmission = second.promise;
  act(() => expect(result.current.submit()).toBe(true));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toEqual(submissions[0]);
  await act(async () =>
    second.resolve(Response.json({ ...row, clientRequestId: submissions[1].clientRequestId })),
  );
  await waitFor(() => expect(result.current.actions.submit.isSuccess).toBe(true));
});
