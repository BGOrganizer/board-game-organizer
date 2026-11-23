import { tableLeaderboardQuery, useTableLeaderboard } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { Activity, type ComponentProps, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableResults } from "../EventTableResults";

const m = vi.hoisted(() => ({ actor: "owner", more: [] as Array<() => void> }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: m.actor,
    enabled: false,
    getToken: async () => "fresh",
  }),
}));
vi.mock("@heroui/react", async (original) => {
  const ui = await original<typeof import("@heroui/react")>();
  return {
    ...ui,
    Button: (props: ComponentProps<typeof ui.Button>) => {
      if (props.children === "Load more" && props.onPress)
        m.more.push(() => props.onPress?.({} as Parameters<NonNullable<typeof props.onPress>>[0]));
      return <ui.Button {...props} />;
    },
  };
});
const clients: QueryClient[] = [];
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  enabled: false,
  getToken: async () => "fresh",
};
const ids = Array.from({ length: 40 }, (_, i) => `p${String(i).padStart(2, "0")}`);
const row = (userId: string) => ({
  userId,
  name: userId,
  avatarUrl: null,
  score: 500,
  provisional: false,
  gamesPlayed: 5,
  gamesWon: 1,
  nd: 0,
});
const table = {
  ...plannedTable,
  maxPlayers: 40,
  eventStatus: "CONFIRMED" as const,
  confirmed: { gameId: 1, playerIds: ids, startsAt: plannedTable.createdAt },
};
function setup(activity = { hidden: false }) {
  m.actor = "owner";
  m.more = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const key = tableLeaderboardQuery(options, table.eventId, table.id, 1, ids).queryKey;
  client.setQueryData(key, {
    pages: [
      { gameId: 1, scope: "GLOBAL", items: ids.slice(0, 20).map(row), nextCursor: "20" },
      { gameId: 1, scope: "GLOBAL", items: ids.slice(20).map(row), nextCursor: null },
    ],
    pageParams: ["", "20"],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Activity mode={activity.hidden ? "hidden" : "visible"}>{children}</Activity>
    </QueryClientProvider>
  );
  return { client, key, wrapper };
}
afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
  vi.unstubAllGlobals();
});
it("resets current-rating presentation after Activity reentry and rejects the old callback", () => {
  const activity = { hidden: false };
  const { client, key, wrapper } = setup(activity);
  const h = renderHook(() => useTableLeaderboard(options, table.eventId, table.id, 1, ids), {
    wrapper,
  });
  act(() => h.result.current.loadMore());
  expect(h.result.current.items).toHaveLength(40);
  const late = h.result.current.loadMore;
  activity.hidden = true;
  h.rerender();
  act(() => late());
  activity.hidden = false;
  h.rerender();
  expect(h.result.current.items).toHaveLength(20);
  act(() => late());
  expect(h.result.current.items).toHaveLength(20);
  act(() => h.result.current.loadMore());
  expect(h.result.current.items).toHaveLength(40);
  expect((client.getQueryData(key) as { pages: unknown[] }).pages).toHaveLength(2);
});
it("reveals cached rows and pages progressively, resets on owner change and rejects old button callbacks", async () => {
  const { client, key, wrapper: Wrapper } = setup();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const view = renderWithI18n(
    <Wrapper>
      <EventTableResults table={table} />
    </Wrapper>,
  );
  expect(screen.getByText("p07")).toBeTruthy();
  expect(screen.queryByText("p08")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(screen.getByText("p15")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(screen.getByText("p19")).toBeTruthy();
  expect(screen.queryByText("p20")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("p31")).toBeTruthy();
  expect((client.getQueryData(key) as { pages: unknown[] }).pages).toHaveLength(2);
  const late = m.more.at(-1)!;
  m.actor = "other";
  view.rerender(
    <Wrapper>
      <EventTableResults table={table} />
    </Wrapper>,
  );
  act(() => late());
  expect(screen.queryByText("p00")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("coalesces cached-page callbacks and rejects late work across roster snapshots and unmount", () => {
  const { client, key, wrapper } = setup();
  const h = renderHook(
    ({ roster }) => useTableLeaderboard(options, table.eventId, table.id, 1, roster),
    { wrapper, initialProps: { roster: ids } },
  );
  expect(h.result.current.items).toHaveLength(20);
  const first = h.result.current.loadMore;
  act(() => {
    first();
    first();
  });
  expect(h.result.current.items).toHaveLength(40);
  expect((client.getQueryData(key) as { pages: unknown[] }).pages).toHaveLength(2);
  h.rerender({ roster: ids.slice(0, 2) });
  act(() => first());
  expect(h.result.current.items).toEqual([]);
  const late = h.result.current.loadMore;
  h.unmount();
  act(() => late());
});
it("uses stable non-mutating roster cache identity and supports the legacy factory without roster metadata", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const roster = ["beta", "alpha"];
  const query = tableLeaderboardQuery(options, table.eventId, table.id, 1, roster);
  expect(query.queryKey.at(-1)).toEqual(["alpha", "beta"]);
  expect(roster).toEqual(["beta", "alpha"]);
  expect(
    tableLeaderboardQuery(options, table.eventId, table.id, 1, ["alpha"]).queryKey,
  ).not.toEqual(query.queryKey);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ gameId: 1, scope: "GLOBAL", items: [row("alpha")], nextCursor: null }),
    ),
  );
  const data = await client.fetchInfiniteQuery(
    tableLeaderboardQuery(options, table.eventId, table.id, 1),
  );
  expect(data.pages[0].items[0].userId).toBe("alpha");
});

it.each([
  { rank: 1, icon: "trophy", tone: "warning" },
  { rank: 2, icon: "medal", tone: "accent" },
  { rank: 3, icon: "medal", tone: "default" },
  { rank: 4, icon: null, tone: "default" },
  { rank: null, icon: null, tone: "default" },
])(
  "keeps historical position $rank on the avatar without another control",
  ({ rank, icon, tone }) => {
    const { wrapper: Wrapper } = setup();
    renderWithI18n(
      <Wrapper>
        <EventTableResults
          table={{
            ...table,
            eventStatus: "TERMINATED",
            results: {
              lowerWins: false,
              entries: [{ userId: "p00", rank, score: rank === null ? null : "10" }],
              tieBreaks: [],
              finalizedAt: plannedTable.createdAt,
            },
            resultProfiles: [
              {
                userId: "p00",
                name: "Historic player",
                username: "historic",
                email: null,
                avatarUrl: null,
              },
            ],
          }}
        />
      </Wrapper>,
    );
    const label = `Position: ${rank === null ? "ND" : `#${rank}`}`;
    expect(screen.queryByText(label)).toBeNull();
    const badge = screen.getByRole("img", { name: label });
    const chip = badge.matches(".chip") ? badge : badge.querySelector(".chip");
    expect(chip).toHaveClass(`chip--${tone}`);
    if (icon) expect(badge.querySelector(`.lucide-${icon}`)).not.toBeNull();
    else expect(badge.textContent).toBe(rank === null ? "ND" : `#${rank}`);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(Boolean(screen.queryByText("Winner"))).toBe(rank === 1);
    expect(screen.getByRole("heading", { name: "Chess" }).closest(".card")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "How OpenSkill works" })).toBeNull();
  },
);

it("shows a winning guest by name with the physical score, without a rating control", () => {
  const { wrapper: Wrapper } = setup();
  const guest = {
    participantId: "guest:00000000-0000-4000-8000-000000000005",
    name: "Ada",
  } as const;
  renderWithI18n(
    <Wrapper>
      <EventTableResults
        table={{
          ...table,
          eventStatus: "TERMINATED",
          confirmed: {
            ...table.confirmed,
            playerIds: [guest.participantId, "p00"],
            guestPlayers: [guest],
          },
          results: {
            lowerWins: false,
            finalizedAt: table.createdAt,
            tieBreaks: [],
            entries: [
              { userId: guest.participantId, score: "14", rank: 1 },
              { userId: "p00", score: "10", rank: 2 },
            ],
          },
        }}
      />
    </Wrapper>,
  );
  const guestRow = screen.getByText("Ada").closest("li");
  expect(guestRow?.textContent).toContain("14");
  expect(guestRow?.querySelector("[role='img'][aria-label='Position: #1']")).toBeTruthy();
  expect(guestRow?.querySelectorAll("button")).toHaveLength(0);
  expect(screen.queryByText(guest.participantId)).toBeNull();
});
