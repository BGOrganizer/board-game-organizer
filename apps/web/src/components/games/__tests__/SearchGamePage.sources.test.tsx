import type {
  BggAccountResponse,
  BggPickerItem,
  BggPickerResponse,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { SearchGamePage } from "../SearchGamePage";

const account: BggAccountResponse = {
  active: {
    id: 42,
    username: "collection-owner",
    avatarUrl: null,
    snapshot: "published-snapshot",
    syncedAt: "2026-11-14T00:00:00.000Z",
  },
  pending: null,
};
const noAccount: BggAccountResponse = { active: null, pending: null };
const tableScope = {
  eventId: "11111111-1111-4111-8111-111111111111",
  tableId: "22222222-2222-4222-8222-222222222222",
  groupId: "33333333-3333-4333-8333-333333333333",
};
const game = (
  id: number,
  name: string,
  source: BggPickerItem["source"] = "collection",
): BggPickerItem => ({
  id,
  name,
  source,
  imageUrl: null,
  year: 2021,
  minPlayMinutes: 30,
  maxPlayMinutes: 60,
});
function page(items: BggPickerItem[], nextCursor: string | null = null): BggPickerResponse {
  return { items, nextCursor, sourceEpoch: "roster-snapshot-1" };
}
function mount(props: Partial<ComponentProps<typeof SearchGamePage>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <SearchGamePage
        apiUrl="https://api.test.invalid"
        token="fallback-token"
        userId="owner"
        onSelect={onSelect}
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...view, client, onSelect, onClose };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("switches own and participant collections independently, then uses four-character catalog discovery with fresh authorization", async () => {
  const getToken = vi.fn(async () => "fresh-token");
  const pickerRequests: URL[] = [];
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fresh-token");
    const url = new URL(input);
    expect(url.searchParams.get("x-vercel-protection-bypass")).toBe("preview-bypass");
    if (url.pathname.endsWith("/account")) return Response.json(account);
    pickerRequests.push(url);
    const own = url.searchParams.get("collection") === "1";
    const participants = url.searchParams.get("participants") === "1";
    return Response.json(
      page([
        game(
          1,
          own
            ? participants
              ? "Combined sources"
              : "Own collection"
            : participants
              ? "Participant collection"
              : "Catalog result",
          own || participants ? "collection" : "search",
        ),
      ]),
    );
  });
  vi.stubGlobal("fetch", fetch);
  const { onClose } = mount({ getToken, tableScope, protectionBypass: "preview-bypass" });
  const own = await screen.findByRole("button", { name: "Collection" });
  await screen.findByRole("button", { name: "Select: Own collection" });
  const participants = screen.getByRole("button", { name: "Participants' collections" });
  expect(own.getAttribute("aria-pressed")).toBe("true");
  expect(participants.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(participants);
  await screen.findByRole("button", { name: "Select: Combined sources" });
  expect(participants.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(own);
  await screen.findByRole("button", { name: "Select: Participant collection" });
  expect(own.getAttribute("aria-pressed")).toBe("false");
  const participantRequest = pickerRequests.at(-1);
  expect(participantRequest?.searchParams.get("participantEventId")).toBe(tableScope.eventId);
  expect(participantRequest?.searchParams.get("participantTableId")).toBe(tableScope.tableId);
  expect(participantRequest?.searchParams.get("search")).toBe("0");
  fireEvent.click(participants);
  expect(screen.queryByRole("list", { name: "Board games" })).toBeNull();
  const previousRequests = pickerRequests.length;
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "abc" },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(pickerRequests).toHaveLength(previousRequests);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "  Chess  " },
  });
  await screen.findByRole("button", { name: "Select: Catalog result" });
  const catalog = pickerRequests.at(-1);
  expect(catalog?.searchParams.get("query")).toBe("Chess");
  expect(catalog?.searchParams.get("search")).toBe("1");
  expect(catalog?.searchParams.get("collection")).toBe("0");
  expect(catalog?.searchParams.get("participants")).toBe("0");
  expect(getToken).toHaveBeenCalledTimes(fetch.mock.calls.length);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("retries failed account metadata and a failed initial collection read without presenting errors as an empty collection", async () => {
  let accountCalls = 0;
  let pickerCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (new URL(input).pathname.endsWith("/account")) {
        accountCalls++;
        return accountCalls === 1
          ? Response.json({ error: "UNAVAILABLE" }, { status: 503 })
          : Response.json(account);
      }
      pickerCalls++;
      return pickerCalls === 1
        ? Response.json({ error: "UNAVAILABLE" }, { status: 503 })
        : Response.json(page([game(1, "Recovered collection")]));
    }),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Search failed. Retry" }));
  await waitFor(() => expect(pickerCalls).toBe(1));
  const retry = await screen.findByRole("button", { name: "Search failed. Retry" });
  expect(screen.queryByText("No games found")).toBeNull();
  fireEvent.click(retry);
  await screen.findByRole("button", { name: "Select: Recovered collection" });
  expect(accountCalls).toBe(2);
  expect(pickerCalls).toBe(2);
  expect(screen.queryByRole("button", { name: "Search failed. Retry" })).toBeNull();
});

it("shows a completed empty catalog result only after its pending request resolves", async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (new URL(input).pathname.endsWith("/account"))
        return Promise.resolve(Response.json(noAccount));
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }),
  );
  mount();
  expect(screen.queryByText("No games found")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "Missing game" },
  });
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.queryByText("No games found")).toBeNull();
  await act(async () => {
    finish?.(Response.json(page([])));
  });
  expect(await screen.findByText("No games found")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Search failed. Retry" })).toBeNull();
});

it.each([
  { status: 403, error: "FORBIDDEN" },
  { status: 409, error: "BGG_PICKER_CHANGED" },
])(
  "hides a formerly cached source after an authoritative denial $status, then recovers on explicit retry",
  async ({ status, error }) => {
    let rejected = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (new URL(input).pathname.endsWith("/account")) return Response.json(account);
        return rejected
          ? Response.json({ error }, { status })
          : Response.json(page([game(1, "Authorized game")]));
      }),
    );
    const { client, onSelect } = mount();
    await screen.findByRole("button", { name: "Select: Authorized game" });
    rejected = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["bgg-picker"] });
    });
    const retry = await screen.findByRole("button", { name: "Search failed. Retry" });
    expect(screen.queryByRole("button", { name: "Select: Authorized game" })).toBeNull();
    expect(screen.queryByText("No games found")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    rejected = false;
    fireEvent.click(retry);
    const item = await screen.findByRole("button", { name: "Select: Authorized game" });
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(game(1, "Authorized game"));
  },
);

it("requires document interaction before paging, coalesces overlapping end events and retries the failed cursor", async () => {
  let completePage: ((value: Response) => void) | undefined;
  const cursorRequests: URL[] = [];
  let nextAttempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/account")) return Promise.resolve(Response.json(account));
      if (!url.searchParams.get("cursor"))
        return Promise.resolve(
          Response.json(
            page(
              Array.from({ length: 8 }, (_, index) => game(index + 1, `Game ${index + 1}`)),
              "next-cursor",
            ),
          ),
        );
      cursorRequests.push(url);
      nextAttempts++;
      return nextAttempts === 1
        ? new Promise<Response>((resolve) => {
            completePage = resolve;
          })
        : Promise.resolve(Response.json(page([game(9, "Game 9")])));
    }),
  );
  const { client } = mount();
  await screen.findByRole("button", { name: "Select: Game 1" });
  const list = screen.getByRole("list", { name: "Board games" });
  fireEvent.scroll(window);
  expect(cursorRequests).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search board games" }), { key: "End" });
  fireEvent.keyDown(list, { key: "a" });
  expect(cursorRequests).toHaveLength(0);
  fireEvent.keyDown(list, { key: "End" });
  await waitFor(() => expect(completePage).toBeDefined());
  fireEvent.wheel(window);
  fireEvent.touchStart(window);
  fireEvent.scroll(window);
  expect(cursorRequests).toHaveLength(1);
  await act(async () => {
    completePage?.(Response.json({ error: "UNAVAILABLE" }, { status: 503 }));
  });
  const retry = await screen.findByRole("button", { name: "Search failed. Retry" });
  expect(screen.getByRole("list", { name: "Board games" })).toBeTruthy();
  fireEvent.click(retry);
  await waitFor(() => expect(cursorRequests).toHaveLength(2));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Search failed. Retry" })).toBeNull(),
  );
  expect(cursorRequests.map((url) => url.searchParams.get("cursor"))).toEqual([
    "next-cursor",
    "next-cursor",
  ]);
  await waitFor(() => {
    const cached = client.getQueriesData<{ pages: BggPickerResponse[] }>({
      queryKey: ["bgg-picker"],
    });
    expect(
      cached.some(([, value]) =>
        value?.pages.some((entry) => entry.items.some((item) => item.id === 9)),
      ),
    ).toBe(true);
    expect(cached.some(([, value]) => value?.pages[0]?.items[0]?.id === 1)).toBe(true);
  });
  expect(screen.getByRole("list", { name: "Board games" })).toBeTruthy();
});

it("windows retained game pages on entry and reentry without fetching or flattening the whole cache", async () => {
  const fetch = vi.fn(async (input: string) =>
    Response.json(
      new URL(input).pathname.endsWith("/account")
        ? account
        : page(
            Array.from({ length: 8 }, (_, index) => game(index + 1, `Game ${index + 1}`)),
            "next",
          ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const view = mount();
  await screen.findByRole("button", { name: "Select: Game 1" });
  const retained = Array.from({ length: 100 }, (_, index) =>
    page(
      Array.from({ length: 8 }, (_, offset) =>
        game(index * 8 + offset + 1, `Game ${index * 8 + offset + 1}`),
      ),
      index === 99 ? null : String(index + 1),
    ),
  );
  act(() =>
    view.client.setQueriesData(
      { queryKey: ["bgg-picker"] },
      {
        pages: retained,
        pageParams: retained.map((_, index) => (index === 0 ? "" : String(index))),
      },
    ),
  );
  const list = screen.getByRole("list", { name: "Board games" });
  expect(list.querySelectorAll(":scope > li")).toHaveLength(8);
  expect(screen.queryByRole("button", { name: "Select: Game 9" })).toBeNull();
  const initialRequests = fetch.mock.calls.length;
  fireEvent.wheel(window);
  await screen.findByRole("button", { name: "Select: Game 9" });
  expect(list.querySelectorAll(":scope > li").length).toBeLessThan(30);
  expect(fetch).toHaveBeenCalledTimes(initialRequests);
  view.rerender(<p>Closed</p>);
  view.rerender(
    <QueryClientProvider client={view.client}>
      <SearchGamePage
        apiUrl="https://api.test.invalid"
        token="fallback-token"
        userId="owner"
        onSelect={view.onSelect}
        onClose={view.onClose}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Select: Game 1" });
  expect(screen.queryByRole("button", { name: "Select: Game 9" })).toBeNull();
  expect(
    screen.getByRole("list", { name: "Board games" }).querySelectorAll(":scope > li"),
  ).toHaveLength(8);
  expect(
    view.client.getQueriesData<{ pages: BggPickerResponse[] }>({ queryKey: ["bgg-picker"] })[0]?.[1]
      ?.pages,
  ).toHaveLength(100);
  expect(fetch).toHaveBeenCalledTimes(initialRequests);
});
