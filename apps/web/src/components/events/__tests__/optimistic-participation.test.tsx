import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  eventRecordKeys,
  useRecordTable,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import { EventTableSeats } from "../EventTableSeats";

const mocks = vi.hoisted(() => ({ options: {} as CommunityApiOptions, push: vi.fn() }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
const secondId = "55555555-5555-4555-8555-555555555555";
function Seats({ id, options }: { id: string; options: CommunityApiOptions }) {
  const query = useRecordTable(options, eventId, id);
  return query.data ? (
    <EventTableSeats table={query.data} onRemove={() => undefined} hasJoinedEvent={false} />
  ) : null;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["join", "commit"],
  ["join", "reject"],
  ["join", "unknown"],
  ["accept", "commit"],
  ["accept", "reject"],
  ["accept", "unknown"],
] as const)(
  "closes two explicit Table consent sheets before HTTP, queues writes and preserves earlier commits: %s/%s",
  async (mode, outcome) => {
    const options = {
      apiUrl: "https://api.test",
      userId: "guest",
      getToken: vi.fn(async () => "fresh"),
      feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    };
    mocks.options = options;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    let server: PlannedEventResponse = {
      ...plannedEvent,
      groupId: optionId,
      groupType: "PUBLIC",
      groupName: "Public club",
      role: "member",
      tableCount: 2,
      participantCount: 0,
      myRegistrations: [],
      canEdit: false,
      canInvite: false,
      canVote: false,
      canConfirm: false,
      canReplan: false,
      canFinalize: false,
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T18:00:00Z",
    };
    const tables = new Map<string, PlannedTableResponse>(
      [tableId, secondId].map((id, index) => [
        id,
        {
          ...plannedTable,
          id,
          name: index ? "Second table" : "First table",
          groupId: optionId,
          groupType: "PUBLIC",
          groupName: server.groupName,
          startsAt: index ? "2030-06-03T20:00:00Z" : "2030-06-03T18:00:00Z",
          canInvite: false,
          canRegister: true,
          canLeave: false,
          myRegistration: null,
          myPosition: null,
        },
      ]),
    );
    const registrations = new Map<string, TableSeatResponse>();
    const raw = (row: TableSeatResponse) => {
      const {
        name: _name,
        username: _username,
        avatarUrl: _avatar,
        email: _email,
        position: _position,
        ...record
      } = row;
      return record;
    };
    if (mode === "accept") {
      for (const [id, row] of tables) {
        const pending: TableSeatResponse = {
          ...seat("guest"),
          id:
            id === tableId
              ? "66666666-6666-4666-8666-666666666666"
              : "77777777-7777-4777-8777-777777777777",
          tableId: id,
          name: "Guest",
          kind: "INVITATION",
          status: "PENDING",
          gameVotes: {},
          position: "SEATED",
        };
        registrations.set(id, pending);
        tables.set(id, {
          ...row,
          myRegistration: pending,
          myPosition: "SEATED",
          canRegister: false,
          canRespond: true,
          pendingCount: 1,
          pendingRegistrationCount: 1,
        });
      }
      server = {
        ...server,
        version: 3,
        role: "invited",
        myRegistrations: [...registrations.values()].map(raw),
      };
    }
    client.setQueryData(eventRecordKeys.detail(options, eventId), server);
    for (const [id, row] of tables)
      client.setQueryData(eventRecordKeys.table(options, eventId, id), row);
    const initialVersion = server.version;
    const caption = mode === "join" ? "Joining table" : "Accepting invitation";
    const action = mode === "join" ? "Join table" : "Accept invitation";
    const writes: Array<{
      tableId: string;
      input: unknown;
      resolve: (response: Response) => void;
    }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url),
        parts = parsed.pathname.split("/");
      const target =
        init?.method === "PATCH"
          ? [...registrations.values()].find((row) => row.id === parts.at(-1))!.tableId
          : parts[parts.indexOf("tables") + 1];
      if (init?.method === "POST" || init?.method === "PATCH")
        return new Promise<Response>((resolve) =>
          writes.push({ tableId: target, input: JSON.parse(String(init.body)), resolve }),
        );
      if (parsed.pathname.endsWith("/seats"))
        return Response.json({
          items:
            registrations.get(target)?.status === "ACCEPTED" ? [registrations.get(target)] : [],
          nextCursor: null,
        });
      return Response.json(parsed.pathname.includes("/tables/") ? tables.get(target) : server);
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(
      <QueryClientProvider client={client}>
        <Seats id={tableId} options={options} />
        <Seats id={secondId} options={options} />
      </QueryClientProvider>,
    );
    const region = (index: number) =>
      within(screen.getAllByRole("region", { name: "Seats list" })[index]);
    for (let index = 0; index < 2; index++) {
      fireEvent.click(
        mode === "join"
          ? region(index).getAllByRole("button", { name: "Free place" })[0]
          : region(index).getByRole("button", { name: action }),
      );
      const dialog = await screen.findByRole("dialog", { name: "Choose availability" });
      fireEvent.click(await within(dialog).findByRole("button", { name: "Chess: Yes" }));
      await waitFor(() =>
        expect(
          (within(dialog).getByRole("button", { name: action }) as HTMLButtonElement).disabled,
        ).toBe(false),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: action }));
      expect(screen.queryByRole("dialog", { name: "Choose availability" })).toBeNull();
      await waitFor(() => expect(region(index).getByText(caption)).toBeTruthy());
      expect(region(index).queryByText("Accepted player")).toBeNull();
    }
    await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2));
    expect(writes).toHaveLength(1);
    expect(
      (
        client.getQueryData(eventRecordKeys.detail(options, eventId)) as PlannedEventResponse
      ).myRegistrations.filter((row) => row.status === "ACCEPTED"),
    ).toEqual([]);
    expect(writes[0].input).toEqual(
      mode === "join"
        ? { version: initialVersion, gameVotes: { "1": "YES" } }
        : {
            action: "accept",
            version: 1,
            participation: { version: initialVersion, gameVotes: { "1": "YES" } },
          },
    );
    function commit(id: string) {
      const row: TableSeatResponse = {
        ...(registrations.get(id) ?? seat("guest")),
        id:
          id === tableId
            ? "66666666-6666-4666-8666-666666666666"
            : "77777777-7777-4777-8777-777777777777",
        tableId: id,
        name: "Guest",
        gameVotes: { "1": "YES" },
        status: "ACCEPTED",
        version: mode === "accept" ? 2 : 1,
        position: "SEATED",
      };
      registrations.set(id, row);
      const saved = raw(row);
      server = {
        ...server,
        version: server.version + 1,
        role: "participant",
        canVote: true,
        participantCount: 1,
        myRegistrations: [
          ...server.myRegistrations.filter((registration) => registration.tableId !== id),
          saved,
        ],
      };
      tables.set(id, {
        ...tables.get(id)!,
        myRegistration: row,
        myPosition: "SEATED",
        acceptedCount: 1,
        seatedCount: 1,
        pendingCount: 0,
        pendingRegistrationCount: 0,
        canRegister: false,
        canRespond: false,
        canLeave: true,
      });
      return { ...saved, eventVersion: server.version };
    }
    const first = commit(tableId);
    await act(async () => writes[0].resolve(Response.json(first, { status: 201 })));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].tableId).toBe(secondId);
    expect(writes[1].input).toEqual(
      mode === "join"
        ? { version: initialVersion + 1, gameVotes: { "1": "YES" } }
        : {
            action: "accept",
            version: 1,
            participation: { version: initialVersion + 1, gameVotes: { "1": "YES" } },
          },
    );
    expect(region(1).getByText(caption)).toBeTruthy();
    expect(
      (
        client.getQueryData(
          eventRecordKeys.table(options, eventId, tableId),
        ) as PlannedTableResponse
      ).myRegistration,
    ).not.toHaveProperty("eventVersion");
    if (outcome === "commit") {
      const second = commit(secondId);
      await act(async () => writes[1].resolve(Response.json(second, { status: 201 })));
      await waitFor(() => expect(region(1).getByText("Accepted player")).toBeTruthy());
    } else if (outcome === "reject") {
      server = { ...server, version: server.version + 1 };
      await act(async () =>
        writes[1].resolve(Response.json({ error: "EVENT_CHANGED" }, { status: 409 })),
      );
      await waitFor(() => expect(region(1).queryByText(caption)).toBeNull());
      expect(region(0).getByText("Accepted player")).toBeTruthy();
      fireEvent.click(
        mode === "join"
          ? region(1).getAllByRole("button", { name: "Free place" })[0]
          : region(1).getByRole("button", { name: action }),
      );
      const restored = await screen.findByRole("dialog", { name: "Choose availability" });
      await waitFor(() =>
        expect(
          within(restored).getByRole("button", { name: "Chess: Yes" }).getAttribute("aria-pressed"),
        ).toBe("true"),
      );
      expect(
        within(restored).getByText(
          mode === "join" ? "Could not join table" : "Could not accept invitation",
        ),
      ).toBeTruthy();
      expect(writes).toHaveLength(2);
      await waitFor(() =>
        expect(
          (within(restored).getByRole("button", { name: action }) as HTMLButtonElement).disabled,
        ).toBe(false),
      );
      fireEvent.click(within(restored).getByRole("button", { name: action }));
      expect(screen.queryByRole("dialog", { name: "Choose availability" })).toBeNull();
      await waitFor(() => expect(writes).toHaveLength(3));
      expect(writes[2].input).toEqual(
        mode === "join"
          ? { version: server.version, gameVotes: { "1": "YES" } }
          : {
              action: "accept",
              version: 1,
              participation: { version: server.version, gameVotes: { "1": "YES" } },
            },
      );
      const recovered = commit(secondId);
      await act(async () => writes[2].resolve(Response.json(recovered, { status: 201 })));
      await waitFor(() => expect(region(1).getByText("Accepted player")).toBeTruthy());
    } else {
      await act(async () => writes[1].resolve(Response.json({}, { status: 503 })));
      await waitFor(() => expect(region(1).getByText("Checking saved changes")).toBeTruthy());
      expect(
        region(1).queryByText(
          mode === "join" ? "Could not join table" : "Could not accept invitation",
        ),
      ).toBeNull();
      expect(
        (region(0).getByRole("button", { name: "Leave table" }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(writes).toHaveLength(2);
      commit(secondId);
      await act(async () => {
        await client.refetchQueries(
          { queryKey: eventRecordKeys.root(options), type: "active" },
          { cancelRefetch: false },
        );
      });
      await waitFor(() => expect(region(1).getByText("Accepted player")).toBeTruthy());
      await waitFor(() =>
        expect(
          client
            .getMutationCache()
            .getAll()
            .some(
              (mutation) =>
                (mutation.state.variables as { tableId?: string } | undefined)?.tableId ===
                secondId,
            ),
        ).toBe(false),
      );
      // A later authoritative departure must not resurrect the resolved uncertain intent.
      const departed = registrations.get(secondId);
      if (!departed) throw new Error("Missing committed registration");
      registrations.set(secondId, {
        ...departed,
        status: "CANCELLED",
        version: departed.version + 1,
      });
      const previous = tables.get(secondId);
      if (!previous) throw new Error("Missing Table");
      tables.set(secondId, {
        ...previous,
        myRegistration: null,
        myPosition: null,
        canRegister: true,
        canRespond: false,
        canLeave: false,
        acceptedCount: 0,
        seatedCount: 0,
      });
      server = {
        ...server,
        version: server.version + 1,
        myRegistrations: server.myRegistrations.filter((row) => row.tableId !== secondId),
      };
      await act(async () => {
        await client.refetchQueries(
          { queryKey: eventRecordKeys.root(options), type: "active" },
          { cancelRefetch: false },
        );
      });
      await waitFor(() =>
        expect(region(1).getAllByRole("button", { name: "Free place" })[0]).toBeTruthy(),
      );
      expect(region(1).queryByText("Checking saved changes")).toBeNull();
      expect(region(1).queryByText(caption)).toBeNull();
    }
    expect(writes).toHaveLength(outcome === "reject" ? 3 : 2);
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(
      fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("pending") === "true"),
    ).toBe(false);
    cleanup();
    clearSessionQueryCache(client);
  },
);
