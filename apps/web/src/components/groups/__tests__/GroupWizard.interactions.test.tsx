import { locationFavoriteKey, type MatchLocation } from "@board-game-organizer/schemas";
import { clearSessionQueryCache } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupWizard } from "../GroupWizard";

const navigation = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test.invalid",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    setStyle() {}
    remove() {}
    flyTo() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
const clients: QueryClient[] = [];
const venue: MatchLocation = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Game cafe",
  address: "Verified road 1",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
const friend = {
  id: "user_friend",
  name: "Known Friend",
  username: "friend-player",
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-11-14T00:00:00.000Z" },
  isFriend: true,
};
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(value);
  return value;
}
function mount(cache: QueryClient, props: { groupId?: string; draftId?: string } = {}) {
  return renderWithI18n(
    <QueryClientProvider client={cache}>
      <GroupWizard {...props} />
    </QueryClientProvider>,
  );
}
function readFixture(input: string) {
  const url = new URL(input);
  if (url.pathname.endsWith("/favorites"))
    return url.searchParams.has("keys")
      ? { keys: [locationFavoriteKey(venue)] }
      : { items: [{ key: locationFavoriteKey(venue), location: venue }], nextCursor: null };
  if (url.pathname.endsWith("/relationships"))
    return {
      rows: [{ fromUserId: "owner", toUserId: friend.id, profile: friend }],
      nextCursor: null,
    };
  return groupRecord;
}
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_MAPTILER_API_KEY", "public-test-key"));
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const cache of clients.splice(0)) clearSessionQueryCache(cache);
  });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps a private draft through real friend-picker cancellation, selection, exclusion and invitation removal", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => Response.json(readFixture(input))),
  );
  mount(client());
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Unsubmitted club" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  await screen.findByRole("button", { name: "Select user: Known Friend" });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect((screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement).value).toBe(
    "Unsubmitted club",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Known Friend" }));
  expect(screen.getByText("@friend-player")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  expect(screen.queryByRole("button", { name: "Select user: Known Friend" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove invite: Known Friend" }));
  expect(screen.queryByText("@friend-player")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Known Friend" }));
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  expect(screen.queryByText("@friend-player")).toBeNull();
  expect((screen.getByRole("button", { name: "Add friend" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(screen.queryByRole("button", { name: "Remove invite: Known Friend" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(navigation.back).toHaveBeenCalledOnce();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("returns from the real venue picker without losing the name and permits removing an optional private venue", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => Response.json(readFixture(input))),
  );
  mount(client());
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Local game club" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  await screen.findByRole("heading", { name: "Select location" });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect((screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement).value).toBe(
    "Local game club",
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(await screen.findByRole("button", { name: /Favorite locations/ }));
  fireEvent.click(await screen.findByRole("option", { name: /Game cafe/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm Location" }));
  expect(screen.getByText("Game cafe")).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement).value).toBe(
    "Local game club",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove location" }));
  expect(screen.queryByText("Game cafe")).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeTruthy();
});

it("recovers a genuinely rejected creation and retries only after explicit review with its original correlation ID", async () => {
  const cache = client();
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST" && new URL(input).pathname === "/api/groups") {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ error: "GROUP_NAME_CONFLICT" }, { status: 409 });
      }
      return Response.json(readFixture(input));
    }),
  );
  const original = mount(cache);
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Recoverable club" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Known Friend" }));
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  await waitFor(() =>
    expect(
      cache
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  const failed = cache
    .getMutationCache()
    .getAll()
    .find((mutation) => mutation.state.status === "error");
  if (!failed) throw new Error("Expected the actual rejected Group creation");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    name: "Recoverable club",
    type: "PRIVATE",
    invitedUserIds: [friend.id],
  });
  original.unmount();
  mount(cache, { draftId: String(failed.mutationId) });
  expect((screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement).value).toBe(
    "Recoverable club",
  );
  expect(screen.getByText("@friend-player")).toBeTruthy();
  expect(writes).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toMatchObject({
    name: "Recoverable club",
    invitedUserIds: [friend.id],
    clientRequestId: writes[0].clientRequestId,
  });
});

it("refuses an absent recovered draft instead of silently opening a new editor", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => Response.json(readFixture(input))),
  );
  mount(client(), { draftId: "missing-draft" });
  const back = screen.getByRole("button", { name: "Back" });
  expect(back.textContent).toBe("");
  fireEvent.click(back);
  expect(navigation.back).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert").textContent).toBe("Could not recover draft");
  expect(screen.queryByRole("textbox", { name: "Group name" })).toBeNull();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("keeps detail failures observable and retries authorized Group editing without inventing a creation form", async () => {
  let failed = true;
  const fetch = vi.fn(async (input: string) => {
    if (new URL(input).pathname === `/api/groups/${groupRecord.id}` && failed)
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    return Response.json(readFixture(input));
  });
  vi.stubGlobal("fetch", fetch);
  mount(client(), { groupId: groupRecord.id });
  expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
  expect(await screen.findByText("Could not load group details")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back" }).textContent).toBe("");
  expect(screen.queryByRole("textbox", { name: "Group name" })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("textbox", { name: "Group name" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Edit group" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
});
