import type { EventProposalResponse, EventProposalsResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventProposalsPageQuery,
  eventRecordKeys,
  eventRecordQuery,
  useEventProposalActions,
  useEventProposalIntents,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const owner = { apiUrl: "https://api.test", userId: "actor", getToken: async () => "fresh" };
const eventId = "11111111-1111-4111-8111-111111111111";
const event = { id: eventId, groupId: null, groupType: null, version: 1, canManage: false };
const scope = { eventId, groupId: null, mode: "mine" as const, kind: "date" as const };
const page: EventProposalsResponse = {
  eventId,
  groupId: null,
  eventVersion: 1,
  mode: "mine",
  items: [],
  nextCursor: null,
};
const clients: QueryClient[] = [];
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  client.getQueryCache().build(client, {
    ...eventRecordQuery(owner, eventId),
    queryKey: eventRecordKeys.detail(owner, eventId),
  });
  client.getQueryCache().build(client, {
    ...eventProposalsPageQuery(owner, scope),
    queryKey: eventProposalKeys.page(owner, scope),
  });
  client.setQueryData(eventRecordKeys.detail(owner, eventId), event);
  client.setQueryData(eventProposalKeys.page(owner, scope), page);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      actions: useEventProposalActions(owner, eventId, null, "date"),
      intents: useEventProposalIntents(owner, eventId, "date"),
    }),
    { wrapper },
  );
  return { client, hook };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(clearSessionQueryCache);
  vi.unstubAllGlobals();
});
it("retains authorized standalone data and recovery when a POST denial is followed by successful source reads", async () => {
  const { client, hook } = await setup();
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST")
      return Response.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    return Response.json(String(url).includes("/proposals") ? page : event);
  });
  vi.stubGlobal("fetch", fetch);
  act(() =>
    hook.result.current.actions.propose({
      eventVersion: 1,
      payload: { kind: "date", day: "2030-06-03", startTime: "20:00" },
      clientLabel: "Date proposal",
    }),
  );
  await waitFor(() => expect(hook.result.current.actions.submit.isError).toBe(true));
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(fetch.mock.calls.some(([, init]) => init?.method === "GET")).toBe(true);
  expect(client.getQueryData(eventRecordKeys.detail(owner, eventId))).toEqual(event);
  expect(client.getQueryData(eventProposalKeys.page(owner, scope))).toEqual(page);
  expect(hook.result.current.intents).toHaveLength(1);
  expect(hook.result.current.intents[0].variables.clientLabel).toBe("Date proposal");
});
it("a verified standalone source denial aborts the pending submit and fences its late receipt", async () => {
  const { client, hook } = await setup();
  let signal: AbortSignal | null | undefined;
  let finish: ((value: Response) => void) | undefined;
  let body: { clientRequestId: string } | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        signal = init.signal;
        body = JSON.parse(String(init.body));
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return Response.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }),
  );
  act(() =>
    hook.result.current.actions.propose({
      eventVersion: 1,
      payload: { kind: "date", day: "2030-06-03", startTime: "20:00" },
      clientLabel: "Date proposal",
    }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => {
    await client
      .fetchQuery({ ...eventProposalsPageQuery(owner, scope), staleTime: 0 })
      .catch(() => undefined);
  });
  expect(signal?.aborted).toBe(true);
  expect(client.getQueryData(eventRecordKeys.detail(owner, eventId))).toBeUndefined();
  expect(client.getQueryData(eventProposalKeys.page(owner, scope))).toBeUndefined();
  if (!body || !finish) throw new Error("Submission did not reach transport");
  const saved: EventProposalResponse = {
    id: eventId,
    eventId,
    groupId: null,
    userId: owner.userId,
    authorName: "Player",
    clientRequestId: body.clientRequestId,
    payload: { kind: "date", day: "2030-06-03", startTime: "20:00" },
    label: "Date proposal",
    status: "PENDING",
    version: 1,
    submittedEventVersion: 1,
    createdAt: "2030-06-01T00:00:00Z",
    updatedAt: "2030-06-01T00:00:00Z",
  };
  await act(async () => finish?.(Response.json(saved, { status: 201 })));
  await waitFor(() => expect(hook.result.current.intents).toEqual([]));
  expect(client.getQueryData(eventProposalKeys.page(owner, scope))).toBeUndefined();
  expect(client.getQueryState(eventProposalKeys.page(owner, scope))?.error).toMatchObject({
    code: "EVENT_NOT_FOUND",
  });
});
