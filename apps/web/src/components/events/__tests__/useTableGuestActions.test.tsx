import {
  clearSessionQueryCache,
  eventRecordKeys,
  tableGuestVotesQuery,
  useTableGuestActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { eventId, seat, tableId } from "@/test-fixtures/eventRecords";

const options = {
  apiUrl: "https://guest-host.test",
  userId: "owner",
  getToken: async () => "event-manager",
};
const collection = `/api/events/${eventId}/tables/${tableId}/guests`;
const guest = { ...seat("guest"), eventVersion: 2 };
const clients: QueryClient[] = [];
const details = { name: "Guest Alice" };

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useTableGuestActions(options, eventId, tableId), { wrapper }),
  };
}

function transport(reply: (init?: RequestInit) => Promise<Response> | Response) {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    expect(new URL(url).origin).toBe(options.apiUrl);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer event-manager");
    return reply(init);
  });
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("keeps one registration in flight, retries with the same receipt ID, and starts a new request after success", async () => {
  const { result } = setup();
  const responses: ((response: Response) => void)[] = [];
  const send = transport(() => new Promise<Response>((resolve) => responses.push(resolve)));
  const onSaved = vi.fn();
  const untouched = vi.fn();

  act(() => {
    result.current.addGuest(details, onSaved);
    result.current.addGuest({ name: "Another guest" }, untouched);
  });
  await waitFor(() => expect(responses).toHaveLength(1));
  await act(() => responses[0](Response.json({ error: "UNAVAILABLE" }, { status: 503 })));
  await waitFor(() => expect(result.current.add.isError).toBe(true));

  act(() => result.current.addGuest(details, onSaved));
  await waitFor(() => expect(responses).toHaveLength(2));
  await act(() => responses[1](Response.json(guest)));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());

  act(() => result.current.addGuest(details, onSaved));
  await waitFor(() => expect(responses).toHaveLength(3));
  await act(() => responses[2](Response.json(guest)));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));

  const bodies = send.mock.calls.map(([url, init]) => {
    expect(new URL(url).pathname).toBe(collection);
    expect(init?.method).toBe("POST");
    return JSON.parse(String(init?.body));
  });
  expect(bodies[0]).toMatchObject({ ...details, requestId: expect.any(String) });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2].requestId).not.toBe(bodies[0].requestId);
  expect(untouched).not.toHaveBeenCalled();
});

it.each([{ name: "Guest Bea" }, { ...details, email: "alice@example.test" }])(
  "assigns a new request ID after an ambiguous failure if the guest details change to %j",
  async (changed) => {
    const { result } = setup();
    const send = transport(() => Response.json({ error: "UNAVAILABLE" }, { status: 503 }));
    const onSaved = vi.fn();
    act(() => result.current.addGuest(details, onSaved));
    await waitFor(() => expect(result.current.add.isError).toBe(true));
    act(() => result.current.addGuest(changed, onSaved));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.add.isError).toBe(true));
    const [first, updated] = send.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(updated).toMatchObject(changed);
    expect(updated.requestId).not.toBe(first.requestId);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

it("writes only preferences and invalidates related owned records after an acknowledged vote", async () => {
  const { client, result } = setup();
  const same = [
    eventRecordKeys.list(options),
    eventRecordKeys.tables(options, null),
    eventRecordKeys.tables(options, eventId),
  ];
  const other = [
    eventRecordKeys.detail(options, "another-event"),
    eventRecordKeys.detail({ ...options, userId: "other-user" }, eventId),
    eventRecordKeys.detail({ ...options, apiUrl: "https://other-api.test" }, eventId),
  ];
  for (const key of [...same, ...other]) client.setQueryData(key, { receipt: true });
  const response = { guestName: details.name, dateVotes: {}, locationVotes: {}, gameVotes: {} };
  const send = transport(() => Response.json(response));
  const votes = [{ kind: "game" as const, tableId, gameId: 1, vote: "YES" as const }];

  await act(async () => {
    expect(await result.current.vote.mutateAsync({ registrationId: "guest/one", votes })).toEqual(
      response,
    );
  });
  const [[url, init]] = send.mock.calls;
  expect(new URL(url).pathname).toBe(`${collection}/guest%2Fone/votes`);
  expect(JSON.parse(String(init?.body))).toEqual({ votes });
  for (const key of same) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of other) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});

it.each(["add", "vote"] as const)(
  "drops a delayed %s receipt after the session owner has been cleared",
  async (kind) => {
    const { client, result } = setup();
    let respond: (response: Response) => void = () => {};
    const send = transport(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const onSaved = vi.fn();
    act(() => {
      if (kind === "add") result.current.addGuest(details, onSaved);
      else result.current.vote.mutate({ registrationId: "guest-one", votes: [] });
    });
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    await act(async () => {
      clearSessionQueryCache(client);
      respond(Response.json(guest));
    });
    await waitFor(() => expect(result.current[kind].error?.message).toBe("MUTATION_OWNER_CHANGED"));
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

it.each([
  [{ ...options, userId: "" }, "guest"],
  [{ ...options, apiUrl: "" }, "guest"],
  [{ ...options, enabled: false }, "guest"],
  [options, ""],
] as const)("disables receipt reads for an incomplete or disabled query (%j, %s)", (owner, id) => {
  expect(tableGuestVotesQuery(owner, eventId, tableId, id).enabled).toBe(false);
});
