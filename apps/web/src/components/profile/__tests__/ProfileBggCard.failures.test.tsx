import type { BggAccountResponse } from "@board-game-organizer/schemas";
import { useBggAccount } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { renderWithI18n } from "@/test-utils";
import { ProfileBggCard } from "../ProfileBggCard";

const toastMocks = vi.hoisted(() => ({ show: vi.fn(), danger: vi.fn() }));
vi.mock("@heroui/react/toast", () => ({
  toast: Object.assign(toastMocks.show, { danger: toastMocks.danger }),
}));
const API = "https://profile-bgg-fixtures.test";
const account: BggAccountResponse = {
  active: {
    id: 42,
    username: "linked-player",
    avatarUrl: null,
    snapshot: "published-snapshot",
    syncedAt: "2030-06-03T12:00:00.000Z",
  },
  pending: null,
};
const options = { apiUrl: API, userId: "viewer", getToken: async () => "fresh-bgg-token" };
let status: number;
let rejectedLink: { status: number; error: string } | undefined;
let client: QueryClient;
const calls: { method: string; path: string }[] = [];
beforeEach(() => {
  status = 200;
  rejectedLink = undefined;
  calls.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-bgg-token");
      calls.push({ method: init?.method ?? "GET", path: url.pathname });
      if (url.pathname === "/api/bgg/account" && init?.method === "POST" && rejectedLink)
        return Response.json({ error: rejectedLink.error }, { status: rejectedLink.status });
      if (url.pathname !== "/api/bgg/account" || init?.method !== "GET")
        throw new Error("Unexpected BGG fixture write");
      return Response.json(
        status === 200 ? account : { error: "Fixture BGG account unavailable" },
        { status },
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
function AccountFixture() {
  const feedback = useMutationFeedback();
  const bgg = useBggAccount({ ...options, feedback });
  return <ProfileBggCard bgg={bgg} />;
}
function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <AccountFixture />
    </QueryClientProvider>,
  );
}

it("retries an unavailable linked-account read through the actual card without treating it as synchronization success", async () => {
  status = 503;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not synchronize BGG collection. Your previous collection is retained.",
  );
  expect(screen.queryByText("Collection up to date")).toBeNull();
  expect(screen.queryByText("linked-player")).toBeNull();
  status = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("linked-player")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(calls).toEqual([
    { method: "GET", path: "/api/bgg/account" },
    { method: "GET", path: "/api/bgg/account" },
  ]);
});

it("prefills the linked username, preserves an unsent edit on cancellation and never disconnects without consent", async () => {
  mount();
  await screen.findByText("linked-player");
  fireEvent.click(screen.getByRole("button", { name: "Change BGG username" }));
  let dialog = await screen.findByRole("dialog", { name: "BGG username" });
  const input = within(dialog).getByRole("textbox", { name: "BGG username" });
  expect(input).toHaveValue("linked-player");
  fireEvent.change(input, { target: { value: "unsent-player" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("linked-player")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Change BGG username" }));
  dialog = await screen.findByRole("dialog", { name: "BGG username" });
  expect(within(dialog).getByRole("textbox", { name: "BGG username" })).toHaveValue(
    "unsent-player",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Disconnect BoardGameGeek" }));
  dialog = await screen.findByRole("dialog", { name: "Disconnect BoardGameGeek?" });
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("linked-player")).toBeVisible();
  expect(calls).toHaveLength(1);
});

it.each([
  [404, "BGG user not found", "BGG user not found"],
  [422, "Fixture link invalid", "Could not link BoardGameGeek account"],
] as const)(
  "distinguishes an unknown BGG username from other definitive link errors [%s]",
  async (status, error, message) => {
    rejectedLink = { status, error };
    mount();
    await screen.findByText("linked-player");
    fireEvent.click(screen.getByRole("button", { name: "Change BGG username" }));
    const dialog = within(await screen.findByRole("dialog", { name: "BGG username" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "BGG username" }), {
      target: { value: "missing-player" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Sync collection" }));
    await waitFor(() =>
      expect(toastMocks.danger).toHaveBeenCalledWith(message, expect.any(Object)),
    );
    expect(screen.getByText("linked-player")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toEqual([
      { method: "POST", path: "/api/bgg/account" },
    ]);
  },
);
