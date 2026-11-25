import { groupRecordMemberRoles } from "@board-game-organizer/schemas";
import { groupRecordsPageQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupDiscoverySession } from "../GroupDiscoverySession";
import { Groups } from "../Groups";

const location = vi.hoisted(() => ({ pathname: "/groups" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
}));

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
function stubGeolocation(getCurrentPosition: Geolocation["getCurrentPosition"]) {
  vi.stubGlobal(
    "navigator",
    new Proxy(navigator, {
      get(target, name) {
        return name === "geolocation" ? { getCurrentPosition } : Reflect.get(target, name, target);
      },
    }),
  );
}
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value);
  return value;
}
function renderGroups(initialSection?: "private" | "public" | "search", cache = client()) {
  location.pathname = initialSection === "search" ? "/groups/search" : "/groups";
  const view = renderWithI18n(
    <QueryClientProvider client={cache}>
      <GroupDiscoverySession>
        <Groups initialSection={initialSection} />
      </GroupDiscoverySession>
    </QueryClientProvider>,
  );
  if (initialSection === "public")
    fireEvent.click(screen.getByRole("tab", { name: "Public groups" }));
  return view;
}
afterEach(() => {
  cleanup();
  for (const value of clients.splice(0)) value.clear();
  vi.unstubAllGlobals();
});
it("shows three exclusive tabs, with owned lists distinct from friend discovery", async () => {
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
  for (const name of ["Admin", "Moderator", "Member", "Pending"])
    expect(screen.getByRole("button", { name, pressed: true })).toBeVisible();
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("type")).toBe("PRIVATE");
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("roles")).toBe(
    groupRecordMemberRoles.join(","),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Public groups" }));
  await screen.findByRole("link", { name: "Open group: Public owned group" });
  for (const name of ["Admin", "Moderator", "Member", "Pending"])
    expect(screen.getByRole("button", { name, pressed: true })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Open group: Friday group" })).toBeNull();
  expect(screen.getByRole("link", { name: "Create group" })).toBeTruthy();
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("scope") === "public"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Search" }));
  expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  await screen.findByRole("link", { name: "Open group: Public owned group" });
  expect(screen.getByRole("button", { name: "Friends", pressed: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Near me", pressed: false })).toBeVisible();
  const discovery = fetcher.mock.calls
    .map(([input]) => new URL(input))
    .find((url) => url.searchParams.get("scope") === "public")?.searchParams;
  expect(discovery?.get("friends")).toBe("true");
  expect(discovery?.has("type")).toBe(false);
  expect(discovery?.has("roles")).toBe(false);
  expect(discovery?.has("query")).toBe(false);
  expect(screen.queryByRole("button", { name: "Sort by Date" })).toBeNull();
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
    expect(params.get("roles")).toBe(groupRecordMemberRoles.join(","));
    expect(params.has("sort")).toBe(false);
    expect(params.has("direction")).toBe(false);
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
it("opens a direct search link with the default Friends results", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  renderGroups("search");
  const back = screen.getByRole("link", { name: "Back" });
  expect(back).toHaveAttribute("href", "/groups");
  expect(back.textContent).toBe("");
  expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("tab", { name: "Search", selected: true })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(await screen.findByText("No public groups with your friends")).toBeVisible();
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
  ["search", "Group search", "Group search help", /Search approved public groups by name/],
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

it("keeps the input mounted when focused, searches from one character, and resets on Back", async () => {
  const fetcher = vi.fn(async (_input: string) => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  renderGroups("search");
  const field = screen.getByRole("searchbox", { name: "Search groups" });
  const initial = await screen.findByText("No public groups with your friends");
  expect(initial.closest('[role="status"]')).toHaveClass("items-center", "text-center");
  fireEvent.focus(field);
  expect(screen.getByRole("searchbox", { name: "Search groups" })).toBe(field);
  expect(screen.queryByRole("tab", { name: "Search" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Group search" })).toBeNull();
  fireEvent.change(field, { target: { value: " R " } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) => new URL(input).searchParams.get("query") === "R"),
    ).toBe(true),
  );
  expect(await screen.findByText("No groups found")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(field).toHaveValue("");
  expect(screen.getByRole("tab", { name: "Search", selected: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Friends", pressed: true })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Group search" })).toBeVisible();
  expect(screen.getByText("No public groups with your friends")).toBeVisible();
});

it("combines empty and one-character searches with the two independently selectable filters", async () => {
  const fetcher = vi.fn(async (_input: string) => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  const getCurrentPosition = vi.fn((onSuccess: PositionCallback) =>
    onSuccess({ coords: { latitude: 45.12345, longitude: 7.92345 } } as GeolocationPosition),
  );
  stubGeolocation(getCurrentPosition);
  renderGroups("search");
  await screen.findByText("No public groups with your friends");
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  expect(await screen.findByRole("button", { name: "Near me", pressed: true })).toBeVisible();
  const field = screen.getByRole("searchbox", { name: "Search groups" });
  expect(field).not.toHaveFocus();
  fireEvent.change(field, { target: { value: "z" } });
  await waitFor(() => {
    const params = new URL(fetcher.mock.calls.at(-1)![0]).searchParams;
    expect(params.get("query")).toBe("z");
    expect(params.get("friends")).toBe("true");
    expect(params.get("nearLat")).toBe("45.123");
    expect(params.get("nearLng")).toBe("7.923");
    expect(params.get("radiusKm")).toBe("25");
  });
  fireEvent.click(screen.getByRole("button", { name: "Friends" }));
  await waitFor(() =>
    expect(new URL(fetcher.mock.calls.at(-1)![0]).searchParams.has("friends")).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() => {
    const params = new URL(fetcher.mock.calls.at(-1)![0]).searchParams;
    for (const key of ["friends", "nearLat", "nearLng", "radiusKm", "query"])
      expect(params.has(key)).toBe(false);
  });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

it("requests and caches each distance independently through the anchored distance picker", async () => {
  const rows = new Map([
    ["25", "Default radius club"],
    ["50", "Wider radius club"],
    ["12", "Custom radius club"],
  ]);
  const fetcher = vi.fn(async (url: string) => {
    const name = rows.get(new URL(url).searchParams.get("radiusKm") ?? "");
    return Response.json({
      items: name ? [{ ...publicGroup, name, approved: { ...publicGroup.approved, name } }] : [],
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const getCurrentPosition = vi.fn((onSuccess: PositionCallback) =>
    onSuccess({ coords: { latitude: 45, longitude: 7 } } as GeolocationPosition),
  );
  stubGeolocation(getCurrentPosition);
  renderGroups("search");
  const friends = screen.getByRole("button", { name: "Friends" });
  const nearby = screen.getByRole("button", { name: "Near me" });
  expect(screen.queryByRole("button", { name: /^Distance,/ })).toBeNull();
  fireEvent.click(nearby);
  const trigger = await screen.findByRole("button", { name: "Distance, 25 km" });
  expect(Array.from(trigger.parentElement?.children ?? [])).toEqual([friends, nearby, trigger]);
  expect(trigger.querySelector("svg.lucide-ruler")).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "Open group: Default radius club" }),
  ).toBeVisible();

  fireEvent.click(trigger);
  const menu = await screen.findByRole("dialog", { name: "Distance" });
  expect(within(menu).getByRole("button", { name: "25 km", pressed: true })).toBeVisible();
  fireEvent.click(within(menu).getByRole("button", { name: "50 km" }));
  expect(await screen.findByRole("link", { name: "Open group: Wider radius club" })).toBeVisible();
  expect(getCurrentPosition).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Distance, 50 km" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Custom distance" }),
  );
  let form = within(screen.getByRole("dialog"));
  fireEvent.change(form.getByLabelText("Custom distance"), { target: { value: "101" } });
  expect(form.getByRole("button", { name: "Apply" })).toBeDisabled();
  fireEvent.click(form.getByRole("button", { name: "Back" }));
  expect(form.getByRole("button", { name: "50 km", pressed: true })).toBeVisible();
  fireEvent.click(form.getByRole("button", { name: "Custom distance" }));
  form = within(screen.getByRole("dialog"));
  expect(form.getByLabelText("Custom distance")).toHaveValue("50");
  fireEvent.change(form.getByLabelText("Custom distance"), { target: { value: "12" } });
  fireEvent.click(form.getByRole("button", { name: "Apply" }));
  expect(await screen.findByRole("link", { name: "Open group: Custom radius club" })).toBeVisible();
  fireEvent.click(nearby);
  expect(screen.queryByRole("button", { name: /^Distance,/ })).toBeNull();
  expect(await screen.findByText("No public groups with your friends")).toBeVisible();
  fireEvent.click(nearby);
  expect(await screen.findByRole("button", { name: "Distance, 12 km" })).toBeVisible();
  expect(await screen.findByRole("link", { name: "Open group: Custom radius club" })).toBeVisible();
});

it("reports location denial and ignores a position delivered after closing", async () => {
  const fetcher = vi.fn(async (_input: string) => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  let deliver: PositionCallback | undefined;
  const getCurrentPosition = vi
    .fn()
    .mockImplementationOnce((_onSuccess: PositionCallback, onError: PositionErrorCallback) =>
      onError({ code: 1 } as GeolocationPositionError),
    )
    .mockImplementationOnce((onSuccess: PositionCallback) => {
      deliver = onSuccess;
    });
  stubGeolocation(getCurrentPosition);
  renderGroups("search");
  await screen.findByText("No public groups with your friends");
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Location unavailable");
  expect(screen.getByRole("button", { name: "Friends", pressed: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  await waitFor(() => expect(deliver).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await act(async () =>
    deliver?.({ coords: { latitude: 45, longitude: 7 } } as GeolocationPosition),
  );
  expect(screen.getByRole("button", { name: "Near me", pressed: false })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetcher.mock.calls.every(([input]) => !new URL(input).searchParams.has("nearLat"))).toBe(
    true,
  );
});

it("preserves query and filters when the Groups layout remains mounted around detail navigation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], nextCursor: null })),
  );
  const cache = client();
  location.pathname = "/groups";
  const body = (child: ReactNode) => (
    <QueryClientProvider client={cache}>
      <GroupDiscoverySession>{child}</GroupDiscoverySession>
    </QueryClientProvider>
  );
  const view = renderWithI18n(body(<Groups />));
  fireEvent.click(screen.getByRole("tab", { name: "Search" }));
  const field = screen.getByRole("searchbox", { name: "Search groups" });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: "Roma" } });
  fireEvent.click(screen.getByRole("button", { name: "Friends" }));
  location.pathname = "/groups/owned";
  view.rerender(body(<p>Group detail</p>));
  location.pathname = "/groups";
  view.rerender(body(<Groups />));
  expect(screen.getByRole("searchbox", { name: "Search groups" })).toHaveValue("Roma");
  expect(screen.getByRole("button", { name: "Friends", pressed: false })).toBeVisible();
  expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
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

it("applies and restores a role chip within the current authorized group source", async () => {
  const reads: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      reads.push(url);
      const roles = url.searchParams.get("roles")?.split(",") ?? [];
      return Response.json({
        items: roles.includes("administrator") ? [groupRecord] : [],
        nextCursor: null,
      });
    }),
  );
  renderGroups("private");
  await screen.findByRole("link", { name: `Open group: ${groupRecord.name}` });
  const admin = screen.getByRole("button", { name: "Admin", pressed: true });
  fireEvent.click(admin);
  expect(await screen.findByText("No groups found")).toBeVisible();
  expect(screen.queryByRole("link", { name: `Open group: ${groupRecord.name}` })).toBeNull();
  for (const name of ["Moderator", "Member", "Pending"])
    expect(screen.getByRole("button", { name, pressed: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Admin", pressed: false }));
  expect(
    await screen.findByRole("link", { name: `Open group: ${groupRecord.name}` }),
  ).toBeVisible();
  expect(reads.map((url) => url.searchParams.get("roles"))).toContain("moderator,member,pending");
  expect(
    reads.every(
      (url) =>
        url.pathname === "/api/groups" &&
        url.searchParams.get("type") === "PRIVATE" &&
        url.searchParams.get("scope") === "mine",
    ),
  ).toBe(true);
});

it.each(["private", "public"] as const)(
  "changes the sort field and direction in %s Groups",
  async (section) => {
    const reads: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        reads.push(new URL(input));
        return Response.json({ items: [], nextCursor: null });
      }),
    );
    renderGroups(section);
    await screen.findByText("No groups found");
    expect(reads[0].searchParams.has("sort")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Date" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
    await waitFor(() => {
      const params = reads.at(-1)?.searchParams;
      expect(params?.get("sort")).toBe("name");
      expect(params?.get("direction")).toBe("desc");
    });
    expect(screen.getByRole("button", { name: "Sort by Name" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
    await waitFor(() => {
      const params = reads.at(-1)?.searchParams;
      expect(params?.get("type")).toBe(section === "private" ? "PRIVATE" : "PUBLIC");
      expect(params?.get("roles")).toBe(groupRecordMemberRoles.join(","));
      expect(params?.get("sort")).toBe("name");
      expect(params?.get("direction")).toBe("asc");
      expect(params?.has("cursor")).toBe(false);
    });
    expect(screen.getByRole("button", { name: "Sort descending" })).toBeVisible();
  },
);
