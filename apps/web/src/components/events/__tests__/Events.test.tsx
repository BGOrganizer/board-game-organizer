import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventGroupSelect } from "../EventGroupSelect";
import { EventList } from "../EventList";
import { Events } from "../Events";
import { TableList } from "../TableList";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const render = (props: Parameters<typeof Events>[0] = {}) =>
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Events {...props} />
    </QueryClientProvider>,
  );
it("warms only the creator-filtered first page before creation and reuses it without a second request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/groups?")
        ? { items: [groupRecord], nextCursor: "more" }
        : { items: [], nextCursor: null },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  const view = renderWithI18n(wrap(<Events />));
  await waitFor(() =>
    expect(fetcher.mock.calls.filter(([url]) => url.includes("/groups?"))).toHaveLength(1),
  );
  const request = fetcher.mock.calls.find(([url]) => url.includes("/groups?"));
  if (!request) throw Error("Missing preload");
  const params = new URL(request[0]).searchParams;
  expect(params.get("roles")).toBe("admin");
  expect(params.get("limit")).toBe("20");
  expect(params.has("cursor")).toBe(false);
  await screen.findByText("No events found");
  view.rerender(
    wrap(<EventGroupSelect groupId={null} locked={false} busy={false} onChange={vi.fn()} />),
  );
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  await screen.findByRole("option", { name: /Friday group/ });
  expect(fetcher.mock.calls.filter(([url]) => url.includes("/groups?"))).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => new URL(url).searchParams.has("cursor"))).toBe(false);
});
it("source-pages canonical group/period/search lists and exposes contextual creation", async () => {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          items: [{ ...plannedEvent, id: url.includes("cursor=") ? "second" : plannedEvent.id }],
          nextCursor: url.includes("cursor=") ? null : "next",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render({ groupId: "group", canCreate: true });
  expect(await screen.findByRole("link", { name: "Open event: Friday games" })).not.toBeNull();
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("groupId")).toBe("group");
  expect(screen.getByRole("link", { name: "Create event" }).getAttribute("href")).toBe(
    "/events/new?groupId=group",
  );
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: "Open event: Friday games" })).toHaveLength(2),
  );
  expect(fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("cursor") === "next")).toBe(
    true,
  );
});
it("keeps failure observable and retries without displaying an empty success state", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail ? new Response("{}", { status: 503 }) : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  render({ canCreate: false });
  expect(await screen.findByText("Could not load events")).not.toBeNull();
  expect(screen.queryByText("No events found")).toBeNull();
  fail = false;
  const failure = screen.getByText("Could not load events").closest('[role="alert"]');
  if (!failure) throw Error("Missing Event error region");
  fireEvent.click(within(failure as HTMLElement).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No events found")).not.toBeNull();
  expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
});
it("filters its own source list from one character after debounce, never a discovery search", async () => {
  const fetch = vi.fn(async (_url: string) => new Response('{"items":[],"nextCursor":null}'));
  vi.stubGlobal("fetch", fetch);
  render();
  await screen.findByText("No events found");
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "a" } });
  await waitFor(() => {
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("/events?")).length).toBe(2);
    expect(fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "a")).toBe(
      true,
    );
  });
  expect(search.getAttribute("placeholder")).toBe("Filter events");
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  expect(screen.getByRole("searchbox", { name: "Filter" })).toBe(search);
  expect(screen.queryByRole("button", { name: "Filter: Filter help" })).toBeNull();
  expect(fetch.mock.calls.filter(([url]) => String(url).includes("/groups?")).length).toBe(1);
  fireEvent.change(search, { target: { value: "friday" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => String(url).includes("query=friday"))).toBe(true),
  );
  expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
});

it.each([
  ["mine", "Scheduled", "Scheduled events help", /Waiting-list places and pending invitations/],
  ["available", "Available", "Available events help", /Private events require group membership/],
  ["terminated", "Terminated events", "Terminated events help", /Finished events where you played/],
] as const)(
  "describes the %s Events list in the section popover",
  async (initialSection, title, button, description) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [], nextCursor: null })),
    );
    render({ initialSection, canCreate: false });
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.queryByText(description)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(within(await screen.findByRole("dialog")).getByText(description)).toBeVisible();
  },
);

it("describes the finished tables included in History from its section popover", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], nextCursor: null })),
  );
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TableList />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Table history help" }));
  expect(
    within(await screen.findByRole("dialog")).getByText(/Confirmed tables from finished events/),
  ).toBeVisible();
});

it.each([
  {
    resource: "events",
    inaccessible: "Could not load events",
    next: "Could not load events. Retry",
  },
  { resource: "tables", inaccessible: "Could not load tables", next: "Load more" },
])(
  "keeps the $resource page visible while scrolling, retries a failed cursor and fences denied rows",
  async ({ resource, inaccessible, next }) => {
    const current =
      resource === "events"
        ? plannedEvent
        : {
            ...plannedTable,
            eventStatus: "TERMINATED",
            canManage: true,
            confirmed: {
              gameId: 1,
              playerIds: ["owner"],
              frozenAt: plannedEvent.createdAt,
            },
          };
    const owner = { apiUrl: "https://api.test", userId: "owner" };
    const key =
      resource === "events"
        ? eventRecordKeys.list(owner, { groupId: groupRecord.id })
        : eventRecordKeys.tables(owner, null, { statuses: ["TERMINATED"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let denied = false;
    let release: (response: Response) => void = () => {
      throw new Error("Expected the next list page to be requested");
    };
    let hold = true;
    const cursorReads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (url.pathname !== `/api/${resource}`)
          return Response.json({ items: [], nextCursor: null });
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh");
        if (denied) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
        const cursor = url.searchParams.get("cursor");
        if (cursor) {
          cursorReads.push(cursor);
          if (hold)
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
        }
        return Response.json({
          items: [cursor ? { ...current, id: "99999999-9999-4999-8999-999999999999" } : current],
          nextCursor: cursor ? null : "next-page",
        });
      }),
    );
    renderWithI18n(
      <QueryClientProvider client={client}>
        {resource === "events" ? <EventList groupId={groupRecord.id} /> : <TableList />}
      </QueryClientProvider>,
    );
    const name = resource === "events" ? "Events" : "History";
    const list = await waitFor(() => {
      const current = within(screen.getByRole("list", { name }));
      expect(current.getByRole("link")).toBeVisible();
      return current;
    });
    expect(cursorReads).toEqual([]);

    fireEvent.wheel(window);
    await waitFor(() => expect(cursorReads).toEqual(["next-page"]));
    expect(list.getByRole("link")).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    fireEvent.wheel(window);
    await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
    expect(cursorReads).toEqual(["next-page"]);

    await act(() => release(Response.json({ error: "UNAVAILABLE" }, { status: 503 })));
    const retry = await screen.findByRole("button", { name: next });
    expect(list.getByRole("link")).toBeVisible();
    hold = false;
    fireEvent.wheel(window);
    await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
    expect(cursorReads).toEqual(["next-page"]);
    fireEvent.click(retry);
    await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(2));
    expect(cursorReads).toEqual(["next-page", "next-page"]);

    denied = true;
    await act(async () => {
      await client.refetchQueries({ queryKey: key, exact: true });
    });
    expect(await screen.findByText(inaccessible)).toBeVisible();
    expect(within(screen.getByRole("list", { name })).queryByRole("link")).toBeNull();
    client.clear();
  },
);
