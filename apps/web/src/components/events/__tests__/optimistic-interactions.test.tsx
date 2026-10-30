import type { ChangeEventVoteInput, PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventAvailabilityVoteIsAllowed,
  eventRecordKeys,
  useEventRecord,
  useEventRecordActions,
  useEventTableRoster,
  useRecordTable,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
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
import { EventInvitationPicker } from "../EventInvitationPicker";

const mocks = vi.hoisted(() => ({ back: vi.fn(), options: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("@/components/contacts/PeoplePicker", () => ({
  PeoplePicker: ({
    disabled,
    onSelect,
  }: {
    disabled: boolean;
    onSelect: (person: object) => void;
  }) => (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect({ id: "guest", name: "Guest", username: "guest", avatarUrl: null })}
      >
        Invite Guest
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSelect({ id: "second", name: "Second", username: "second", avatarUrl: null })
        }
      >
        Invite Second
      </button>
    </>
  ),
}));
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  mocks.options = options;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(["date", "location", "game"] as const)(
  "paints rapid %s votes and success feedback before HTTP and preserves latest intent over older ACKs",
  async (kind) => {
    const { client, options, wrapper } = setup();
    const registration = {
      ...seat("owner"),
      gameVotes: { "1": "NO" as const, "2": "YES" as const },
    };
    let server: PlannedEventResponse = {
      ...plannedEvent,
      groupId: optionId,
      groupType: "PRIVATE",
      groupName: "Friday group",
      canVote: true,
      myRegistrations: [registration],
      dates: [...plannedEvent.dates, { id: tableId, day: "2030-06-04" }],
      locations: [
        ...plannedEvent.locations,
        { ...plannedEvent.locations[0], id: tableId, address: "Via Milano 2", latitude: 41.91 },
      ],
      myVotes: {
        dateVotes: { [optionId]: "NO", [tableId]: "YES" },
        locationVotes: { [optionId]: "NO", [tableId]: "YES" },
      },
    };
    const table = {
      ...plannedTable,
      groupId: optionId,
      groupType: "PRIVATE" as const,
      groupName: server.groupName,
      games: [...plannedTable.games, { ...plannedTable.games[0], gameId: 2 }],
      myRegistration: registration,
    };
    client.setQueryData(eventRecordKeys.detail(options, eventId), server);
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), table);
    const writes: Array<{ input: ChangeEventVoteInput; resolve: (response: Response) => void }> =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH")
          return new Promise<Response>((resolve) =>
            writes.push({ input: JSON.parse(String(init.body)), resolve }),
          );
        return Response.json(
          url.includes(`/tables/${tableId}`)
            ? { ...table, myRegistration: server.myRegistrations[0] }
            : server,
        );
      }),
    );
    const hook = renderHook(
      () => ({
        actions: useEventRecordActions(options, eventId),
        event: useEventRecord(options, eventId),
        table: useRecordTable(options, eventId, tableId),
      }),
      { wrapper },
    );
    const input = (vote: "YES" | "IF_NEEDED" | "NO"): ChangeEventVoteInput =>
      kind === "game" ? { kind, tableId, gameId: 1, vote } : { kind, optionId, vote };
    act(() => {
      hook.result.current.actions.vote.mutate(input("YES"));
      hook.result.current.actions.vote.mutate(input("NO"));
      hook.result.current.actions.vote.mutate(input("IF_NEEDED"));
    });
    await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(3));
    expect(writes).toHaveLength(1);
    expect(hook.result.current.actions.blocking).toBe(false);
    const current = () =>
      kind === "game"
        ? hook.result.current.table.data?.myRegistration?.gameVotes["1"]
        : hook.result.current.event.data?.myVotes?.[
            kind === "date" ? "dateVotes" : "locationVotes"
          ][optionId];
    expect(current()).toBe("IF_NEEDED");
    for (let index = 0; index < 3; index++) {
      await waitFor(() => expect(writes).toHaveLength(index + 1));
      const vote = writes[index].input.vote;
      const field = kind === "date" ? "dateVotes" : "locationVotes";
      expect(
        eventAvailabilityVoteIsAllowed(
          kind === "game"
            ? table.games.map((row) => ({ id: String(row.gameId) }))
            : kind === "date"
              ? server.dates
              : server.locations,
          kind === "game" ? server.myRegistrations[0].gameVotes : server.myVotes![field],
          kind === "game" ? "1" : optionId,
          vote,
        ),
      ).toBe(true);
      server =
        kind === "game"
          ? {
              ...server,
              version: server.version + 1,
              myRegistrations: [
                {
                  ...registration,
                  version: index + 2,
                  gameVotes: { ...registration.gameVotes, "1": vote },
                },
              ],
            }
          : {
              ...server,
              version: server.version + 1,
              myVotes: {
                ...server.myVotes!,
                [field]: { ...server.myVotes![field], [optionId]: vote },
              },
            };
      await act(async () => writes[index].resolve(Response.json(server)));
      expect(current()).toBe("IF_NEEDED");
    }
    await waitFor(() => expect(hook.result.current.actions.busy).toBe(false));
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(options.feedback.onError).not.toHaveBeenCalled();
    hook.unmount();
    client.clear();
  },
);

it("returns from the picker and shows both recipients before their POST responses, rolling back only the rejected invitation", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(eventRecordKeys.detail(options, eventId), plannedEvent);
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), plannedTable);
  for (const pending of [false, true])
    client.setQueryData(
      [...eventRecordKeys.root(options), "seats", eventId, tableId, pending, ""],
      { pages: [{ items: [], nextCursor: null }], pageParams: [""] },
    );
  const invitation = { ...seat("guest"), status: "PENDING" as const };
  let saved = false;
  const writes: Array<(response: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => writes.push(resolve));
      if (url.includes("/seats?"))
        return Response.json({
          items: url.includes("pending=true") && saved ? [invitation] : [],
          nextCursor: null,
        });
      return Response.json({ ...plannedEvent, version: saved ? 2 : 1 });
    }),
  );
  const hook = renderHook(
    () => ({
      actions: useEventRecordActions(options, eventId),
      roster: useEventTableRoster(options, plannedTable),
    }),
    { wrapper },
  );
  const ui = renderWithI18n(
    wrapper({ children: <EventInvitationPicker eventId={eventId} tableId={tableId} /> }),
  );
  fireEvent.click(ui.getByRole("button", { name: "Invite Guest" }));
  expect(mocks.back).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(hook.result.current.roster.rows).toContainEqual(
      expect.objectContaining({ kind: "pending", name: "Guest" }),
    ),
  );
  expect((ui.getByRole("button", { name: "Invite Second" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.click(ui.getByRole("button", { name: "Invite Second" }));
  expect(mocks.back).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2));
  expect(writes).toHaveLength(1);
  expect(hook.result.current.roster.rows.filter((row) => row.kind === "pending")).toHaveLength(2);
  saved = true;
  await act(async () => writes[0](Response.json(invitation)));
  await waitFor(() => expect(writes).toHaveLength(2));
  await act(async () =>
    writes[1](Response.json({ error: "TABLE_TIME_CONFLICT" }, { status: 409 })),
  );
  await waitFor(() => expect(hook.result.current.actions.busy).toBe(false));
  expect(hook.result.current.roster.rows.filter((row) => row.kind === "pending")).toHaveLength(0);
  expect(hook.result.current.roster.rows).toContainEqual({
    key: invitation.id,
    kind: "player",
    user: invitation,
  });
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "invite_event_player");
  hook.unmount();
  client.clear();
});
