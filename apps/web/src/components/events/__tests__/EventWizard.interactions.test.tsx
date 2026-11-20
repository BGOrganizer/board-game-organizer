import { clearSessionQueryCache } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventWizard } from "../EventWizard";

const navigation = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test.invalid",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
const group = {
  ...groupRecord,
  type: "PUBLIC" as const,
  approved: { ...groupRecord.approved, location: plannedEvent.locations[0] },
};
const event = {
  ...plannedEvent,
  groupId: group.id,
  groupType: "PUBLIC" as const,
  groupName: group.name,
  visibility: "PUBLIC" as const,
  endsAt: "2030-06-03T20:00:00.000Z",
  bookingClosesAt: "2030-06-02T18:00:00.000Z",
};
const table = {
  ...plannedTable,
  startsAt: "2030-06-03T18:00:00.000Z",
  groupId: group.id,
  groupType: "PUBLIC" as const,
};
const guide = {
  userId: "user_guide",
  name: "Guide Player",
  username: "guide-player",
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: optionId,
    groupId: group.id,
    userId: "user_guide",
    kind: "INVITATION",
    status: "ACCEPTED",
    version: 1,
    createdAt: plannedEvent.createdAt,
    updatedAt: plannedEvent.updatedAt,
  },
};
const clients: QueryClient[] = [];
function mount(
  props: { eventId?: string; draftId?: string } = { eventId },
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  clients.push(cache);
  return renderWithI18n(
    <QueryClientProvider client={cache}>
      <EventWizard {...props} />
    </QueryClientProvider>,
  );
}
function fixture(input: string) {
  const url = new URL(input);
  if (url.pathname.endsWith("/favorites"))
    return url.searchParams.has("keys") ? { keys: [] } : { items: [], nextCursor: null };
  if (url.pathname.endsWith("/members")) return { items: [guide], nextCursor: null };
  if (url.pathname.endsWith("/tables")) return { items: [table], nextCursor: null };
  if (url.pathname === `/api/groups/${group.id}`) return group;
  if (url.pathname === "/api/groups") return { items: [group], nextCursor: null };
  if (url.pathname.endsWith("/bgg/account")) return { active: null, pending: null };
  if (url.pathname.endsWith("/bgg/picker"))
    return {
      items: [
        {
          id: 2,
          name: "Cascadia",
          imageUrl: null,
          year: 2021,
          minPlayers: 2,
          maxPlayers: 4,
          maxPlayMinutes: 90,
          source: "search",
        },
      ],
      nextCursor: null,
    };
  return event;
}
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const cache of clients.splice(0)) clearSessionQueryCache(cache);
  });
  vi.unstubAllGlobals();
});
async function openTables() {
  await screen.findByRole("textbox", { name: "Event name" });
  await waitFor(() =>
    expect((screen.getByRole("button", { name: /Group$/ }) as HTMLButtonElement).disabled).toBe(
      true,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("group", { name: /^Date and time$/ });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
async function expandFirst() {
  const trigger = await screen.findByRole("button", { name: "First table" });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return trigger;
}

it("uses real demonstrator and catalog pickers, preserves expanded table state and submits choices only on final review", async () => {
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ ...event, version: 2 });
      }
      return Response.json(fixture(input));
    }),
  );
  mount();
  await openTables();
  await expandFirst();
  fireEvent.click(screen.getByRole("button", { name: "Choose demonstrator" }));
  await screen.findByRole("button", { name: "Select user: Guide Player" });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "First table" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose demonstrator" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Guide Player" }));
  expect(screen.getByText("Guide Player")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove demonstrator" }));
  expect(screen.queryByText("Guide Player")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose demonstrator" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Guide Player" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  await screen.findByRole("heading", { name: "Select a board game" });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("textbox", { name: "Table name" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "Cascadia" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Select: Cascadia" }));
  expect(screen.getByRole("button", { name: "Remove game: Cascadia" })).toBeTruthy();
  expect(screen.getByText("Guide Player")).toBeTruthy();
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const save = await screen.findByRole("button", { name: "Save event" });
  expect(writes).toHaveLength(0);
  fireEvent.click(save);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    version: 1,
    tables: [
      expect.objectContaining({
        id: table.id,
        demonstratorUserId: guide.userId,
        games: [expect.objectContaining({ gameId: 1 }), expect.objectContaining({ gameId: 2 })],
      }),
    ],
  });
  expect(navigation.replace).toHaveBeenCalledWith(`/events/${eventId}`);
  // Allow the full picker sequence to finish on the Raspberry's single test worker.
}, 15_000);

it("cancels a table removal before applying it and keeps unsaved removals local until review", async () => {
  const fetch = vi.fn(async (input: string) => Response.json(fixture(input)));
  vi.stubGlobal("fetch", fetch);
  mount();
  await openTables();
  await expandFirst();
  fireEvent.click(screen.getByRole("button", { name: "Remove table" }));
  let confirmation = await screen.findByRole("dialog", { name: "Remove table" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "First table" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove table" }));
  confirmation = await screen.findByRole("dialog", { name: "Remove table" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Remove table" }));
  expect(screen.queryByRole("button", { name: "First table" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Add at least one table.")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("retries unavailable table pages and explicitly loads the remaining authorized table page", async () => {
  let failed = true;
  const cursors: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/tables")) {
        if (failed) return Response.json({ error: "UNAVAILABLE" }, { status: 503 });
        const cursor = url.searchParams.get("cursor");
        cursors.push(cursor);
        return Response.json({
          items: [
            cursor
              ? {
                  ...table,
                  id: "44444444-4444-4444-8444-444444444444",
                  name: "Second table",
                  order: 1,
                }
              : table,
          ],
          nextCursor: cursor ? null : "next-table",
        });
      }
      return Response.json(
        new URL(input).pathname === `/api/events/${eventId}`
          ? { ...event, tableCount: 2 }
          : fixture(input),
      );
    }),
  );
  mount();
  await openTables();
  expect(await screen.findByText("Could not load tables")).toBeTruthy();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "First table" });
  fireEvent.click(screen.getByRole("button", { name: "Load more tables" }));
  expect(await screen.findByRole("button", { name: "Second table" })).toBeTruthy();
  expect(cursors).toEqual([null, "next-table"]);
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("retries an event-detail denial without exposing a writable substitute draft", async () => {
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      new URL(input).pathname === `/api/events/${eventId}` && failed
        ? Response.json({ error: "FORBIDDEN" }, { status: 403 })
        : Response.json(fixture(input)),
    ),
  );
  mount();
  expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
  expect(await screen.findByText("Could not edit event")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back" }).textContent).toBe("");
  expect(screen.queryByRole("textbox", { name: "Event name" })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("textbox", { name: "Event name" })).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("refuses a missing creation recovery instead of creating a new event implicitly", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => Response.json(fixture(input))),
  );
  mount({ draftId: "missing-draft" });
  const back = screen.getByRole("button", { name: "Back" });
  expect(back.textContent).toBe("");
  const previous = navigation.back.mock.calls.length;
  fireEvent.click(back);
  expect(navigation.back).toHaveBeenCalledTimes(previous + 1);
  expect(screen.getByRole("alert").textContent).toBe("Could not recover draft");
  expect(screen.queryByRole("textbox", { name: "Event name" })).toBeNull();
});

it.each([false, true])(
  "exits the first event step without saving or clearing its fields (edit=%s)",
  async (edit) => {
    const writes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (init?.method && init.method !== "GET") writes.push(init.method);
        return Response.json(fixture(input));
      }),
    );
    mount(edit ? { eventId } : {});
    const name = await screen.findByRole("textbox", { name: "Event name" });
    fireEvent.change(name, { target: { value: "Unsaved event name" } });
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.textContent).toBe("");
    expect(back.closest("[data-page-toolbar]")?.firstElementChild?.contains(back)).toBe(true);
    const previous = navigation.back.mock.calls.length;
    fireEvent.click(back);
    expect(navigation.back).toHaveBeenCalledTimes(previous + 1);
    expect(name).toHaveValue("Unsaved event name");
    expect(writes).toEqual([]);
  },
);

it("blocks first-step exit while an Event edit is still saving after reentry", async () => {
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return Response.json(fixture(input));
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = mount({ eventId }, cache);
  await openTables();
  await screen.findByRole("button", { name: "First table" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save event" }));
  await waitFor(() => expect(finish).toBeDefined());
  view.unmount();
  mount({ eventId }, cache);
  await screen.findByRole("textbox", { name: "Event name" });
  const back = screen.getByRole("button", { name: "Back" });
  expect(back).toBeDisabled();
  const previous = navigation.back.mock.calls.length;
  fireEvent.click(back);
  expect(navigation.back).toHaveBeenCalledTimes(previous);
  if (!finish) throw new Error("Expected pending Event update");
  const respond = finish;
  await act(async () => respond(Response.json({ ...event, version: event.version + 1 })));
  await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeEnabled());
});
