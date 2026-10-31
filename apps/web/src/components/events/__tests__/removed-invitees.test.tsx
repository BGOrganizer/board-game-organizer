import {
  type TableInviteeResponse,
  tableRegistrationReceiptSchema,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  eventRecordKeys,
  tableInviteesPageQuery,
  useEventRecordActions,
  usePeoplePicker,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableOverview } from "../EventTableOverview";

const mocks = vi.hoisted(() => ({ options: {} as CommunityApiOptions }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) {
    clearSessionQueryCache(client);
    client.clear();
  }
  vi.unstubAllGlobals();
});
function setup(groupType: "PRIVATE" | "PUBLIC" | null = null) {
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
  };
  mocks.options = options;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const registration = { ...seat("guest"), name: "Guest Player", username: "guest-player" };
  const person = {
    userId: registration.userId,
    name: registration.name,
    username: registration.username,
    avatarUrl: registration.avatarUrl,
  };
  let removed = false;
  let version = 1;
  let finishRemoval: ((response: Response) => void) | undefined;
  const candidates: Array<{ resolve: (response: Response) => void; url: string }> = [];
  const writes: Array<{ method: string; body: unknown }> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      writes.push({ method: "PATCH", body: JSON.parse(String(init.body)) });
      return new Promise<Response>((resolve) => {
        finishRemoval = resolve;
      });
    }
    if (init?.method === "POST") {
      writes.push({ method: "POST", body: JSON.parse(String(init.body)) });
      version = 3;
      return Response.json(
        tableRegistrationReceiptSchema
          .strip()
          .parse({ ...registration, status: "PENDING", version: 3, eventVersion: 3 }),
      );
    }
    if (url.includes("/invitations?"))
      return new Promise<Response>((resolve) => {
        candidates.push({ resolve, url });
      });
    if (url.includes("/seats?"))
      return Response.json({
        items: removed || url.includes("pending=true") ? [] : [registration],
        nextCursor: null,
      });
    const group = { groupId: groupType ? optionId : null, groupType };
    return Response.json(
      url.includes(`/tables/${tableId}`)
        ? {
            ...plannedTable,
            ...group,
            seatedCount: removed ? 0 : 1,
            acceptedCount: removed ? 0 : 1,
          }
        : { ...plannedEvent, ...group, version },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  client.setQueryData(eventRecordKeys.detail(options, eventId), {
    ...plannedEvent,
    groupType,
    groupId: groupType ? optionId : null,
  });
  const actions = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const remove = () =>
    actions.result.current.respond.mutateAsync({
      tableId,
      registrationId: registration.id,
      person,
      input: { action: "remove", version: 1 },
    });
  const finish = (ok: boolean, override = {}, failureStatus = 409) => {
    if (!finishRemoval) throw Error("Missing held removal");
    if (ok) {
      removed = true;
      version = 2;
    }
    finishRemoval(
      ok
        ? Response.json({
            ...tableRegistrationReceiptSchema.strip().parse({
              ...registration,
              status: "CANCELLED",
              version: 2,
              eventVersion: 2,
            }),
            ...override,
          })
        : Response.json({ code: "REGISTRATION_CHANGED" }, { status: failureStatus }),
    );
  };
  return {
    options,
    client,
    wrapper,
    actions,
    registration,
    person,
    remove,
    finish,
    candidates,
    writes,
  };
}
it.each([null, "PRIVATE", "PUBLIC"] as const)(
  "makes removed players selectable on first paint/cold searches before PATCH/GET; no actor/API/Table leakage (%s)",
  async (groupType) => {
    const s = setup(groupType);
    renderWithI18n(
      <QueryClientProvider client={s.client}>
        <EventTableOverview eventId={eventId} tableId={tableId} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove player: Guest Player" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(s.writes).toHaveLength(1));
    const picker = renderHook(
      ({ options, target, query }) =>
        usePeoplePicker(options, query, !groupType, undefined, target),
      {
        wrapper: s.wrapper,
        initialProps: { options: s.options, target: { eventId, tableId }, query: "" },
      },
    );
    expect(picker.result.current.items.map((row) => row.id)).toEqual(["guest"]);
    expect(picker.result.current.isPending).toBe(false);
    expect(picker.result.current.items[0]).toMatchObject({ name: "Guest Player", email: null });
    picker.rerender({
      options: { ...s.options, userId: "foreign" },
      target: { eventId, tableId },
      query: "Guest",
    });
    expect(picker.result.current.items).toEqual([]);
    picker.rerender({
      options: { ...s.options, apiUrl: "https://foreign.test" },
      target: { eventId, tableId },
      query: "Guest",
    });
    expect(picker.result.current.items).toEqual([]);
    picker.rerender({ options: s.options, target: { eventId, tableId: optionId }, query: "Guest" });
    expect(picker.result.current.items).toEqual([]);
    picker.rerender({ options: s.options, target: { eventId: optionId, tableId }, query: "Guest" });
    expect(picker.result.current.items).toEqual([]);
    picker.rerender({ options: s.options, target: { eventId, tableId }, query: "Guest" });
    expect(picker.result.current.items.map((row) => row.id)).toEqual(["guest"]);
    await act(async () => {
      for (const request of s.candidates.splice(0))
        request.resolve(Response.json({ items: [], nextCursor: null, eventVersion: 1 }));
    });
    expect(picker.result.current.items.map((row) => row.id)).toEqual(["guest"]);
    await act(async () => s.finish(true));
    await waitFor(() =>
      expect(
        s.client.getMutationCache().findAll({
          mutationKey: eventRecordKeys.mutation(s.options, eventId, "respond"),
          status: "success",
        }),
      ).toHaveLength(1),
    );
    expect(picker.result.current.items.map((row) => row.id)).toEqual(["guest"]);
    expect(s.writes).toEqual([{ method: "PATCH", body: { action: "remove", version: 1 } }]);
    // A fresh complete, matching post-ACK source may revoke eligibility. Even a
    // newly opened search must not resurrect that known-ineligible release hint.
    await act(async () => {
      for (const request of s.candidates.splice(0))
        request.resolve(Response.json({ items: [], nextCursor: null, eventVersion: 2 }));
    });
    await waitFor(() => expect(picker.result.current.items).toEqual([]));
    picker.rerender({ options: s.options, target: { eventId, tableId }, query: "Player" });
    expect(picker.result.current.items).toEqual([]);
  },
);
it.each([true, false])(
  "queues immediate reinvitation behind exact removal, never POSTs after rejection (commit=%s)",
  async (ok) => {
    const s = setup();
    const picker = renderHook(
      () => usePeoplePicker(s.options, "", true, undefined, { eventId, tableId }),
      { wrapper: s.wrapper },
    );
    let removal!: Promise<unknown>;
    act(() => {
      removal = s.remove().catch((error) => error);
    });
    await waitFor(() => expect(s.writes).toHaveLength(1));
    expect(picker.result.current.items.map((row) => row.id)).toEqual(["guest"]);
    let invitation!: Promise<unknown>;
    act(() => {
      invitation = s.actions.result.current.invite
        .mutateAsync({ tableId, userId: "guest", person: s.person })
        .catch((error) => error);
    });
    await waitFor(() => expect(picker.result.current.items).toEqual([]));
    expect(s.writes.map((write) => write.method)).toEqual(["PATCH"]);
    await act(async () => {
      s.finish(ok);
      await removal;
      await invitation;
    });
    expect(s.writes.map((write) => write.method)).toEqual(ok ? ["PATCH", "POST"] : ["PATCH"]);
    await waitFor(() =>
      expect(s.actions.result.current.invite.status).toBe(ok ? "success" : "error"),
    );
    expect(picker.result.current.items).toEqual([]);
    if (ok) expect(s.writes[1].body).toEqual({ userId: "guest" });
  },
);
it.each([
  { id: eventId },
  { tableId: optionId },
  { userId: "other" },
  { version: 3 },
  { status: "PENDING" },
  { eventVersion: null },
])(
  "does not dispatch dependent invitation without exact cancellation proof: %j",
  async (override) => {
    const s = setup();
    let removal!: Promise<unknown>, invitation!: Promise<unknown>;
    act(() => {
      removal = s.remove().catch((error) => error);
    });
    await waitFor(() => expect(s.writes).toHaveLength(1));
    act(() => {
      invitation = s.actions.result.current.invite
        .mutateAsync({ tableId, userId: "guest", person: s.person })
        .catch((error) => error);
    });
    await act(async () => {
      s.finish(true, override);
      await removal;
      await invitation;
    });
    expect(s.writes.map((write) => write.method)).toEqual(["PATCH"]);
    expect(await invitation).toMatchObject({ code: "EVENT_CHANGED" });
  },
);
it("keeps dependent invitation queued when a foreign-Event receipt cannot be verified", async () => {
  const s = setup();
  act(() => {
    void s.remove().catch(() => undefined);
  });
  await waitFor(() => expect(s.writes).toHaveLength(1));
  act(() => {
    s.actions.result.current.invite.mutate({ tableId, userId: "guest", person: s.person });
  });
  await act(async () => s.finish(true, { eventId: optionId }));
  await waitFor(() => expect(s.actions.result.current.invite.isPending).toBe(true));
  expect(s.writes.map((write) => write.method)).toEqual(["PATCH"]);
});
it("never treats an empty candidate read as proof after unknown removal, or automatically retries either write", async () => {
  const s = setup();
  act(() => {
    void s.remove().catch(() => undefined);
  });
  await waitFor(() => expect(s.writes).toHaveLength(1));
  const picker = renderHook(
    () => usePeoplePicker(s.options, "", true, undefined, { eventId, tableId }),
    { wrapper: s.wrapper },
  );
  expect(picker.result.current.items).toHaveLength(1);
  act(() => {
    s.actions.result.current.invite.mutate({ tableId, userId: "guest", person: s.person });
  });
  await act(async () => s.finish(false, {}, 500));
  await act(async () => {
    for (const request of s.candidates.splice(0))
      request.resolve(Response.json({ items: [], nextCursor: null, eventVersion: 1 }));
  });
  expect(picker.result.current.items).toEqual([]);
  expect(s.writes.map((write) => write.method)).toEqual(["PATCH"]);
  expect(s.actions.result.current.respond.isPending).toBe(true);
  expect(s.actions.result.current.invite.isPending).toBe(true);
});
it("rolls only rejected release back, without waiting for candidate refetch", async () => {
  const s = setup();
  let pending!: Promise<unknown>;
  act(() => {
    pending = s.remove().catch((error) => error);
  });
  await waitFor(() => expect(s.writes).toHaveLength(1));
  const picker = renderHook(
    () => usePeoplePicker(s.options, "", true, undefined, { eventId, tableId }),
    { wrapper: s.wrapper },
  );
  expect(picker.result.current.items).toHaveLength(1);
  await act(async () => {
    s.finish(false);
    await pending;
  });
  await waitFor(() => expect(picker.result.current.items).toEqual([]));
  expect(s.options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "remove_event_player");
});
it("prefers authorized canonical identity/conflict metadata when source catches up", async () => {
  const s = setup();
  let pending!: Promise<unknown>;
  act(() => {
    pending = s.remove();
  });
  await waitFor(() => expect(s.writes).toHaveLength(1));
  const picker = renderHook(
    () => usePeoplePicker(s.options, "", true, undefined, { eventId, tableId }),
    { wrapper: s.wrapper },
  );
  await act(async () => {
    s.finish(true);
    await pending;
  });
  const canonical: TableInviteeResponse = {
    id: "guest",
    name: "Canonical Guest",
    username: "current",
    avatarUrl: null,
    email: null,
    invitationBlockReason: "TABLE_TIME_CONFLICT",
  };
  await act(async () => {
    for (const request of s.candidates.splice(0))
      request.resolve(Response.json({ items: [canonical], nextCursor: null, eventVersion: 2 }));
  });
  await waitFor(() => expect(picker.result.current.items).toEqual([canonical]));
  expect(
    s.client.getQueryData(tableInviteesPageQuery(s.options, eventId, tableId).queryKey),
  ).toMatchObject({ pages: [{ items: [canonical], eventVersion: 2, nextCursor: null }] });
});
