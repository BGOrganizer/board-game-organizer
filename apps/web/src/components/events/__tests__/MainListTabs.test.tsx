import { emptyAttentionSummary } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { Events } from "../Events";
import { Tables } from "../Tables";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const render = (child: ReactNode) =>
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {child}
    </QueryClientProvider>,
  );
function attention(url: URL, unread = false) {
  if (!url.pathname.endsWith("/notifications/attention")) return undefined;
  return Response.json({
    asOf: "2030-01-01T00:00:00.000Z",
    unreadCount: unread ? 2 : 0,
    summary: emptyAttentionSummary(),
    targets: JSON.parse(url.searchParams.get("targets") ?? "[]").map(
      (target: { kind: string; id: string }) => ({
        target,
        count: unread && target.kind === "event-list" && target.id === "mine" ? 1 : 0,
        direct: 0,
        events: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      }),
    ),
  });
}

it("keeps Scheduled, Available and Terminated source pages separate, with Group context unsplit", async () => {
  const mine = {
    ...plannedEvent,
    name: "My invitation",
    canManage: false,
    adminUserId: "other",
    myRegistrations: [{ ...seat("owner"), status: "PENDING" as const }],
  };
  const available = {
    ...plannedEvent,
    id: "available",
    name: "Public enrollment",
    groupId: "club",
    groupType: "PUBLIC" as const,
    visibility: "PUBLIC" as const,
    adminUserId: "other",
    role: "viewer" as const,
    readOnly: true,
    canManage: false,
    canEdit: false,
    canInvite: false,
    bookingClosesAt: "2099-01-01T00:00:00Z",
    myRegistrations: [],
  };
  const terminated = {
    ...plannedEvent,
    id: "terminated",
    name: "Past administration",
    status: "TERMINATED" as const,
    canManage: true,
  };
  const fetcher = vi.fn(async (url: string) => {
    const u = new URL(url);
    return (
      attention(u, true) ??
      Response.json({
        items: u.pathname.endsWith("/events")
          ? u.searchParams.get("section") === "available"
            ? [available]
            : u.searchParams.get("section") === "terminated"
              ? [terminated]
              : [mine]
          : [],
        nextCursor: null,
      })
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const ui = render(<Events canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: My invitation" });
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  const scheduled = screen.getByRole("tab", { name: /Scheduled/ });
  await waitFor(() =>
    expect(within(scheduled).getByRole("img", { name: "Needs attention" })).toBeTruthy(),
  );
  expect(
    within(screen.getByRole("tab", { name: "Available" })).queryByRole("img", {
      name: "Needs attention",
    }),
  ).toBeNull();
  for (const [tab, name, section, statuses] of [
    ["Available", "Public enrollment", "available", "PLANNING"],
    ["Terminated events", "Past administration", "terminated", "TERMINATED"],
    ["Scheduled", "My invitation", "mine", "CONFIRMED,PLANNING"],
  ]) {
    fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab) }));
    await screen.findByRole("link", { name: `Open event: ${name}` });
    expect(screen.queryByRole("button", { name: "Participant", pressed: true })).toBeNull();
    const order = screen.getByRole("button", { name: "Sort by Date" });
    fireEvent.focus(screen.getByRole("searchbox", { name: "Filter" }));
    expect(screen.queryByRole("tablist", { name: "Events navigation" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort by Date" })).toBe(order);
    expect(screen.queryByRole("button", { name: "Confirmed events", pressed: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Planning", pressed: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Terminated events", pressed: true })).toBeNull();
    for (const name of ["Admin", "Moderator", "Participant", "Pending"]) {
      const chip = screen.queryByRole("button", { name, pressed: true });
      if (section === "available" || (section === "terminated" && name === "Pending"))
        expect(chip).toBeNull();
      else expect(chip).toBeVisible();
    }
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Sort by Date" })).toBe(order);
    expect(screen.queryByRole("button", { name: "Participant", pressed: true })).toBeNull();
    expect(
      fetcher.mock.calls.some(([url]) => {
        const u = new URL(url);
        return (
          u.searchParams.get("section") === section &&
          u.searchParams.get("statuses") === statuses &&
          u.searchParams.get("sort") === "date" &&
          u.searchParams.get("direction") === (section === "terminated" ? "desc" : "asc") &&
          !u.searchParams.has("roles")
        );
      }),
    ).toBe(true);
  }
  expect(
    fetcher.mock.calls.some(([url]) => {
      const u = new URL(url);
      return (
        u.pathname.endsWith("/notifications/attention") &&
        JSON.parse(u.searchParams.get("targets") ?? "[]").some(
          (target: { kind: string; id: string }) =>
            target.kind === "event-list" && target.id === "terminated",
        )
      );
    }),
  ).toBe(true);
  ui.unmount();
  render(<Events groupId="club" canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: My invitation" });
  expect(screen.queryByRole("tablist", { name: "Events navigation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Planning", pressed: true })).toBeNull();
  fireEvent.focus(screen.getByRole("searchbox", { name: "Filter" }));
  for (const name of ["Confirmed events", "Planning", "Terminated events"])
    expect(screen.getByRole("button", { name, pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sort by Date" })).toBeVisible();
  expect(
    fetcher.mock.calls.some(([url]) => {
      const p = new URL(url).searchParams;
      return (
        p.get("groupId") === "club" &&
        p.get("sort") === "date" &&
        p.get("direction") === "asc" &&
        !p.has("section")
      );
    }),
  ).toBe(true);
});

it("keeps Scheduled role filters when changing the source sort and direction", async () => {
  const reads: URL[] = [];
  const invited = {
    ...plannedEvent,
    name: "Scheduled invitation",
    canManage: false,
    adminUserId: "other",
    role: "invited" as const,
    myRegistrations: [{ ...seat("owner"), status: "PENDING" as const }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname !== "/api/events")
        return attention(url) ?? Response.json({ items: [], nextCursor: null });
      reads.push(url);
      const roles = url.searchParams.get("roles")?.split(",");
      return Response.json({
        items: !roles || roles.includes("pending") ? [invited] : [],
        nextCursor: null,
      });
    }),
  );
  render(<Events canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: Scheduled invitation" });
  fireEvent.focus(screen.getByRole("searchbox", { name: "Filter" }));
  fireEvent.click(screen.getByRole("button", { name: "Pending", pressed: true }));
  await screen.findByText("No events found");
  fireEvent.click(screen.getByRole("button", { name: "Sort by Date" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
  await waitFor(() => {
    const params = reads.at(-1)?.searchParams;
    expect(params?.get("sort")).toBe("name");
    expect(params?.get("direction")).toBe("asc");
  });
  fireEvent.click(screen.getByRole("button", { name: "Sort descending" }));
  await waitFor(() => {
    const params = reads.at(-1)?.searchParams;
    expect(params?.get("section")).toBe("mine");
    expect(params?.get("roles")).toBe("admin,moderator,participant");
    expect(params?.get("sort")).toBe("name");
    expect(params?.get("direction")).toBe("desc");
    expect(params?.has("cursor")).toBe(false);
  });
  expect(screen.getByRole("button", { name: "Pending", pressed: false })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "Sort by Name" })).toBeVisible();
  expect(
    await screen.findByRole("link", { name: "Open event: Scheduled invitation" }),
  ).toBeVisible();
});

it("History shows terminated player, demonstrator and currently managed tables without chips or planning legend", async () => {
  const base = {
    ...plannedTable,
    eventStatus: "TERMINATED" as const,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    canManage: false,
  };
  const rows = [
    {
      ...base,
      id: "player",
      name: "Played table",
      confirmedGameName: "Hegemony",
      myRegistration: seat("owner"),
      myPosition: "FROZEN",
    },
    {
      ...base,
      id: "demo",
      name: "Demonstrated table",
      confirmedGameName: "Ark Nova",
      confirmed: { ...base.confirmed, playerIds: ["guest"] },
      demonstratorUserId: "owner",
    },
    {
      ...base,
      id: "admin",
      name: "Managed table",
      confirmedGameName: "Azul",
      confirmed: { ...base.confirmed, playerIds: ["guest"] },
      canManage: true,
    },
  ];
  const fetcher = vi.fn(
    async (url: string) =>
      attention(new URL(url)) ?? Response.json({ items: rows, nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Tables />);
  for (const name of ["Hegemony", "Ark Nova", "Azul"])
    await screen.findByRole("link", { name: `Open table: ${name}` });
  expect(screen.queryByText("Played table")).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "History" })).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByRole("button", { name: "Table legend" })).toBeNull();
  for (const name of ["Confirmed tables", "Terminated tables", "Planning"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => {
      const u = new URL(url);
      return (
        u.pathname.endsWith("/tables") &&
        u.searchParams.get("statuses") === "TERMINATED" &&
        !u.searchParams.has("section")
      );
    }),
  ).toBe(true);
});

it.each([false, true])(
  "does not announce an empty list before the remaining source is revealed (History=%s)",
  async (history) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        const second = u.searchParams.has("cursor");
        return (
          attention(u) ??
          Response.json({
            items: history
              ? [
                  {
                    ...plannedTable,
                    name: "Visible table",
                    eventStatus: second ? "TERMINATED" : "PLANNING",
                    confirmed: {
                      gameId: 1,
                      playerIds: ["owner"],
                      startsAt: "2030-06-03T18:00:00Z",
                    },
                  },
                ]
              : [
                  {
                    ...plannedEvent,
                    name: "Visible event",
                    status: second ? "PLANNING" : "TERMINATED",
                    canManage: true,
                  },
                ],
            nextCursor: second ? null : "second",
          })
        );
      }),
    );
    render(history ? <Tables /> : <Events canCreate={false} />);
    const more = await screen.findByRole("button", { name: "Load more" });
    expect(screen.queryByText(history ? "No tables found" : "No events found")).toBeNull();
    fireEvent.click(more);
    await screen.findByRole("link", {
      name: history ? "Open table: Chess" : "Open event: Visible event",
    });
  },
);

it.each(["mine", "available", "terminated", "history"] as const)(
  "%s keeps debounced text filtering, clearing and no minimum length",
  async (section) => {
    const fetcher = vi.fn(
      async (url: string) =>
        attention(new URL(url)) ?? Response.json({ items: [], nextCursor: null }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      section === "history" ? <Tables /> : <Events canCreate={false} initialSection={section} />,
    );
    const empty = await screen.findByText(
      section === "history" ? "No tables found" : "No events found",
    );
    const status = empty.closest('[role="status"]');
    expect(
      status?.querySelector(
        section === "history" ? "svg.lucide-dices" : "svg.lucide-calendar-days",
      ),
    ).not.toBeNull();
    expect(status?.className).toContain("items-center");
    const input = screen.getByRole("searchbox", { name: "Filter" });
    expect(input.getAttribute("placeholder")).toBe(
      section === "history" ? "Filter tables" : "Filter events",
    );
    fireEvent.change(input, { target: { value: "z" } });
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => {
          const u = new URL(url);
          return (
            u.pathname.endsWith(section === "history" ? "/tables" : "/events") &&
            u.searchParams.get("query") === "z" &&
            (section === "history"
              ? !u.searchParams.has("section")
              : u.searchParams.get("section") === section)
          );
        }),
      ).toBe(true),
    );
    expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect((input as HTMLInputElement).value).toBe("");
  },
);

it.each(["mine", "available", "terminated", "history"] as const)(
  "%s keeps failures observable and retries/paginates the same source",
  async (section) => {
    let fail = true;
    const history = section === "history";
    const fetcher = vi.fn(async (url: string) => {
      const u = new URL(url),
        scope = attention(u);
      if (scope) return scope;
      if (fail) return Response.json({}, { status: 503 });
      const second = u.searchParams.has("cursor");
      const item = history
        ? {
            ...plannedTable,
            id: second ? "second" : "first",
            name: second ? "Second table" : "First table",
            confirmedGameName: second ? "Cascadia" : "Chess",
            eventStatus: "TERMINATED",
            confirmed: {
              gameId: 1,
              playerIds: ["owner", "guest"],
              startsAt: "2030-06-03T18:00:00Z",
            },
            myRegistration: seat("owner"),
            myPosition: "FROZEN",
          }
        : {
            ...plannedEvent,
            id: second ? "second" : "first",
            name: second ? "Second event" : "First event",
            status: section === "terminated" ? "TERMINATED" : "PLANNING",
            ...(section === "available"
              ? {
                  groupId: "club",
                  groupType: "PRIVATE",
                  adminUserId: "other",
                  role: "member",
                  canManage: false,
                  canEdit: false,
                  canInvite: false,
                }
              : { canManage: true }),
          };
      return Response.json({ items: [item], nextCursor: second ? null : "next" });
    });
    vi.stubGlobal("fetch", fetcher);
    render(history ? <Tables /> : <Events initialSection={section} canCreate={false} />);
    await screen.findByText(history ? "Could not load tables" : "Could not load events");
    expect(screen.queryByText(history ? "No tables found" : "No events found")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("link", {
      name: history ? "Open table: Chess" : "Open event: First event",
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("link", {
      name: history ? "Open table: Cascadia" : "Open event: Second event",
    });
    expect(
      fetcher.mock.calls.some(([url]) => {
        const u = new URL(url);
        return (
          u.pathname.endsWith(history ? "/tables" : "/events") &&
          u.searchParams.get("cursor") === "next" &&
          (history ? !u.searchParams.has("section") : u.searchParams.get("section") === section)
        );
      }),
    ).toBe(true);
  },
);
