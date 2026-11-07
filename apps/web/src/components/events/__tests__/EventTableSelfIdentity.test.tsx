import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import type { CommunityApiOptions } from "@board-game-organizer/shared";
import {
  eventRecordKeys,
  useEventRecordActions,
  useRecordTable,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
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
import { EventTableSeats } from "../EventTableSeats";

const mocks = vi.hoisted(() => ({ options: {} as CommunityApiOptions }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const actor = "user_current_123",
  fullName = "Mario Rossi";
function Seats() {
  const query = useRecordTable(mocks.options, eventId, tableId);
  return query.data ? (
    <EventTableSeats table={query.data} onRemove={() => undefined} hasJoinedEvent={false} />
  ) : null;
}
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
it.each(["known", "cold", "foreign"] as const)(
  "never flashes the self Clerk ID before or after a raw enrollment receipt while roster HTTP is held: %s profile",
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    clients.push(client);
    const options = { apiUrl: "https://api.test", userId: actor, getToken: async () => "fresh" };
    mocks.options = options;
    const table = {
      ...plannedTable,
      groupId: optionId,
      groupType: "PUBLIC" as const,
      adminUserId: "organizer",
      canInvite: false,
    };
    let event = {
      ...plannedEvent,
      groupId: optionId,
      groupType: "PUBLIC" as const,
      adminUserId: "organizer",
      role: "member" as const,
    };
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), table);
    client.setQueryData(eventRecordKeys.detail(options, eventId), event);
    if (kind !== "cold")
      client.setQueryData(["profile", options.apiUrl, actor], {
        id: kind === "known" ? actor : "foreign",
        name: kind === "known" ? fullName : "Other Person",
        avatarUrl: "https://images.test/profile",
      });
    let finish: ((response: Response) => void) | undefined,
      acknowledged = false;
    const rosterReads: Array<(response: Response) => void> = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (url.includes("/seats"))
        return acknowledged
          ? new Promise<Response>((resolve) => rosterReads.push(resolve))
          : Response.json({ items: [], nextCursor: null });
      return Response.json(url.includes(`/tables/${tableId}`) ? table : event);
    });
    vi.stubGlobal("fetch", fetch);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const actions = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    renderWithI18n(wrapper({ children: <Seats /> }));
    const paints: string[] = [],
      observer = new MutationObserver(() => paints.push(document.body.textContent ?? ""));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    try {
      act(() =>
        actions.result.current.register.mutate({
          tableId,
          version: 1,
          gameVotes: { "1": "YES" },
        }),
      );
      await waitFor(() => expect(finish).toBeDefined());
      expect(
        JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body)),
      ).toEqual({ version: 1, gameVotes: { "1": "YES" } });
      expect(screen.getByText(kind === "known" ? fullName : "You")).toBeTruthy();
      const enriched = { ...seat(actor), name: fullName };
      const {
        name: _name,
        username: _username,
        email: _email,
        avatarUrl: _avatar,
        position: _position,
        ...raw
      } = enriched;
      await act(async () => {
        acknowledged = true;
        event = { ...event, version: 2, myRegistrations: [raw] };
        finish?.(Response.json({ ...raw, eventVersion: 2 }));
      });
      await waitFor(() => expect(rosterReads.length).toBeGreaterThan(0));
      expect(
        client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
          ?.myRegistration?.status,
      ).toBe("ACCEPTED");
      expect(screen.getByText(kind === "known" ? fullName : "You")).toBeTruthy();
      expect(screen.queryByText(actor)).toBeNull();
      expect(screen.queryByText("Other Person")).toBeNull();
      expect(paints.every((text) => !text.includes(actor) && !text.includes("Other Person"))).toBe(
        true,
      );
      expect(fetch.mock.calls.some(([url]) => url.includes("/profiles"))).toBe(false);
      if (kind !== "known") {
        act(() =>
          client.setQueryData(["profile", options.apiUrl, actor], {
            id: actor,
            name: fullName,
            avatarUrl: "https://images.test/profile",
          }),
        );
        await waitFor(() => expect(screen.getByText(fullName)).toBeTruthy());
      }
      await act(async () => {
        for (const resolve of rosterReads)
          resolve(Response.json({ items: [enriched], nextCursor: null }));
      });
      await waitFor(() => expect(actions.result.current.register.isSuccess).toBe(true));
      expect(screen.getByText(fullName)).toBeTruthy();
    } finally {
      observer.disconnect();
    }
  },
);
