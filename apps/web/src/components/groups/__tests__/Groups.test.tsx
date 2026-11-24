import { groupRecordMemberRoles } from "@board-game-organizer/schemas";
import { groupRecordsPageQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { Groups } from "../Groups";

vi.mock("@/components/notifications/NotificationAttentionScope", () => ({
  NotificationAttentionScope: ({ children }: { children: ReactNode }) => children,
}));
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  getToken: async () => "fresh",
};
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => options,
}));
const publicGroup = {
  ...groupRecord,
  id: "44444444-4444-4444-8444-444444444444",
  type: "PUBLIC" as const,
  name: "Public owned group",
  approved: {
    name: "Public owned group",
    logoAssetId: "55555555-5555-4555-8555-555555555555",
    location: plannedEvent.locations[0],
  },
  reservedNames: ["public owned group"],
};
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value);
  return value;
}
function renderGroups(initialSection?: "private" | "public" | "search", cache = client()) {
  return renderWithI18n(
    <QueryClientProvider client={cache}>
      <Groups initialSection={initialSection} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  for (const value of clients.splice(0)) value.clear();
  vi.unstubAllGlobals();
});
it("shows three exclusive tabs, with typed member lists distinct from four-character discovery", async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input);
    return Response.json({
      items: [url.searchParams.get("type") === "PRIVATE" ? groupRecord : publicGroup],
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  renderGroups();
  expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Private groups",
    "Public groups",
    "Search",
  ]);
  expect(screen.getByRole("tab", { name: "Private groups", selected: true })).toBeTruthy();
  await screen.findByRole("link", { name: "Open group: Friday group" });
  expect(screen.getByRole("link", { name: "Create group" })).toBeTruthy();
  expect(screen.getByText("Invited")).toBeTruthy();
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("type")).toBe("PRIVATE");
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("roles")).toBe(
    "admin,invited,accepted",
  );
  fireEvent.click(screen.getByRole("tab", { name: "Public groups" }));
  await screen.findByRole("link", { name: "Open group: Public owned group" });
  expect(screen.queryByRole("link", { name: "Open group: Friday group" })).toBeNull();
  expect(screen.getByRole("link", { name: "Create group" })).toBeTruthy();
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("scope") === "public"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Search" }));
  expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(screen.getByText("Enter at least 4 characters to search")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Search groups"), { target: { value: "Public" } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("scope") === "public"),
    ).toBe(true),
  );
  const discovery = new URL(
    fetcher.mock.calls.find(([url]) => new URL(url).searchParams.get("scope") === "public")?.[0] ??
      "",
  );
  expect(discovery.searchParams.has("type")).toBe(false);
  expect(discovery.searchParams.has("roles")).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Private groups" }));
  await screen.findByRole("link", { name: "Open group: Friday group" });
});
it.each(["private", "public"] as const)(
  "filters owned %s groups from a single character without invoking public discovery",
  async (section) => {
    const fetcher = vi.fn(async (_url: string) => Response.json({ items: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetcher);
    renderGroups(section);
    await screen.findByText("No groups found");
    const field = screen.getByRole("searchbox", { name: "Filter" });
    expect(field.getAttribute("placeholder")).toBe("Filter groups");
    fireEvent.change(field, { target: { value: "q" } });
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "q"),
      ).toBe(true),
    );
    for (const [url] of fetcher.mock.calls) {
      const p = new URL(url).searchParams;
      expect(p.get("scope")).toBe("mine");
      expect(p.get("type")).toBe(section === "private" ? "PRIVATE" : "PUBLIC");
    }
    expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect((field as HTMLInputElement).value).toBe("");
  },
);

it("keeps public membership paging source-filtered by type and roles, without crossing into discovery", async () => {
  const cursor = `${publicGroup.createdAt}|${publicGroup.id}`;
  const fetcher = vi.fn(async (input: string) => {
    const next = new URL(input).searchParams.has("cursor");
    return Response.json({
      items: [
        next
          ? {
              ...publicGroup,
              id: "66666666-6666-4666-8666-666666666666",
              name: "Later public group",
            }
          : publicGroup,
      ],
      nextCursor: next ? null : cursor,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  renderGroups("public");
  await screen.findByRole("link", { name: "Open group: Public owned group" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("link", { name: "Open group: Later public group" });
  expect(fetcher.mock.calls).toHaveLength(2);
  for (const [input] of fetcher.mock.calls) {
    const params = new URL(input).searchParams;
    expect(params.get("scope")).toBe("mine");
    expect(params.get("type")).toBe("PUBLIC");
    expect(params.get("roles")).toBe("admin,invited,accepted");
  }
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("cursor")).toBe(cursor);
});
it.each(["private", "public"] as const)(
  "keeps %s failures observable and permits retry to an honest empty state",
  async (section) => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail ? new Response("{}", { status: 503 }) : Response.json({ items: [], nextCursor: null }),
      ),
    );
    renderGroups(section);
    expect(await screen.findByText("Could not load groups")).toBeTruthy();
    expect(screen.queryByText("No groups found")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No groups found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create group" })).toBeTruthy();
  },
);
it("keeps existing discovery links on Search without an eager empty search", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderGroups("search");
  const back = screen.getByRole("link", { name: "Back" });
  expect(back).toHaveAttribute("href", "/groups");
  expect(back.textContent).toBe("");
  expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("tab", { name: "Search", selected: true })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("reuses the exact private startup page and fetches the public member page only on selection", async () => {
  const cache = client();
  const fetcher = vi.fn(async (_input: string) => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  await cache.prefetchInfiniteQuery(
    groupRecordsPageQuery(options, "mine", "", groupRecordMemberRoles, "PRIVATE"),
  );
  renderGroups(undefined, cache);
  await screen.findByText("No groups found");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("tab", { name: "Public groups" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("type")).toBe("PUBLIC");
});

it.each([
  ["private", "Private groups", "Private groups help", /Private groups you manage/],
  ["public", "Public groups", "Public groups help", /may still be awaiting approval/],
  ["search", "Search", "Group search help", /Search for approved public groups by name/],
] as const)(
  "describes the %s Group list in the section popover",
  async (section, title, button, description) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [], nextCursor: null })),
    );
    renderGroups(section);
    const heading = screen.getByRole("heading", { name: title });
    expect(heading).toBeVisible();
    expect(heading.nextElementSibling).toHaveTextContent("Section guide");
    expect(screen.queryByText(description)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(within(await screen.findByRole("dialog")).getByText(description)).toBeVisible();
  },
);

it("uses centered discovery prompts without a separate search field help", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  renderGroups("search");
  const field = screen.getByRole("searchbox", { name: "Search groups" });
  const prompt = "Enter at least 4 characters to search";
  const empty = screen.getByText(prompt).closest('[role="status"]');
  expect(empty).toHaveClass("items-center", "text-center");
  expect(empty?.querySelector("svg.lucide-search")).not.toBeNull();
  expect(screen.getByText("Search groups").closest("label")).toHaveClass("sr-only");
  expect(screen.queryByRole("button", { name: "Search groups: Search help" })).toBeNull();
  fireEvent.change(field, { target: { value: "abc" } });
  expect(screen.getAllByText(prompt)).toHaveLength(1);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "missing" } });
  const noResults = (await screen.findByText("No groups found")).closest('[role="status"]');
  expect(noResults?.querySelector("svg.lucide-search-x")).not.toBeNull();
  expect(screen.queryByText(prompt)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText(prompt)).toBeVisible();
  expect(screen.queryByText("No groups found")).toBeNull();
});

it("keeps the first private Group visible while retrying a failed next authorized page", async () => {
  const browser = installBrowserIntersections();
  const cursorReads: string[] = [];
  let pending: Promise<Response> | undefined;
  let finish: (res: Response) => void = () => {
    throw new Error("Expected an authorized Group cursor read");
  };
  const other = {
    ...groupRecord,
    id: "88888888-8888-4888-8888-888888888888",
    name: "Second group",
  };
  const requests = vi.fn(async (input: string) => {
    const url = new URL(input);
    expect(url.searchParams.get("type")).toBe("PRIVATE");
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      cursorReads.push(cursor);
      return pending ?? Response.json({ items: [other], nextCursor: null });
    }
    return Response.json({ items: [groupRecord], nextCursor: "second-group" });
  });
  vi.stubGlobal("fetch", requests);
  renderGroups("private");
  await screen.findByRole("link", { name: "Open group: Friday group" });
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  act(() => browser.intersect());
  await waitFor(() => expect(cursorReads).toEqual(["second-group"]));
  expect(screen.getByRole("link", { name: "Open group: Friday group" })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  await act(() => finish(Response.json({ error: "UNAVAILABLE" }, { status: 503 })));
  const retry = await screen.findByRole("button", { name: "Could not load groups. Retry" });
  expect(screen.getByRole("link", { name: "Open group: Friday group" })).toBeVisible();
  pending = undefined;
  fireEvent.click(retry);
  expect(await screen.findByRole("link", { name: "Open group: Second group" })).toBeVisible();
  expect(cursorReads).toEqual(["second-group", "second-group"]);
});
