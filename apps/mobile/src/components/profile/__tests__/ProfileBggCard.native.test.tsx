import { URL } from "node:url";
import type { BggAccountResponse } from "@board-game-organizer/schemas";
import { bggAccountQuery, useBggAccount } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { Linking } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { ProfileBggCard } from "../ProfileBggCard";

const API = "https://profile-bgg-native.test";
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: async () => "fixture-bgg-owner",
  feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn(), onSuccess: vi.fn() },
};
const syncedAt = "2030-06-01T12:00:00.000Z";
const empty = (): BggAccountResponse => ({ active: null, pending: null });
function linked(username = "braveheart85"): BggAccountResponse {
  return {
    active: {
      id: 17,
      username,
      avatarUrl: null,
      snapshot: `snapshot-${username}`,
      syncedAt,
      counts: { withoutExpansions: 10, withExpansions: 12, wishlist: 3 },
    },
    pending: null,
    lastAttempt: { status: "success", at: syncedAt },
  };
}
let client: QueryClient;
let account: BggAccountResponse;
let readStatus: number;
let linkStatus: number;
let syncStatus: number;
let failedSyncReceipt: boolean;
let unlinkStatus: number;
let pendingRead: Promise<Response> | undefined;
let pendingSync: Promise<Response> | undefined;
let selectedUsername: string;
const writes: { path: string; method: string; body: unknown; authorization: string | null }[] = [];
const json = (body: unknown, code = 200) => Response.json(body, { status: code });
beforeEach(() => {
  vi.clearAllMocks();
  account = empty();
  readStatus = linkStatus = syncStatus = unlinkStatus = 200;
  pendingRead = pendingSync = undefined;
  failedSyncReceipt = false;
  selectedUsername = "braveheart85";
  writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== API ||
        !["/api/bgg/account", "/api/bgg/account/sync"].includes(url.pathname)
      )
        throw new Error(`Unexpected BGG fixture request ${url.origin}${url.pathname}`);
      const method = init?.method ?? "GET";
      if (method === "GET")
        return (
          pendingRead ??
          json(readStatus === 200 ? account : { error: "Fixture account unavailable" }, readStatus)
        );
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({
        path: url.pathname,
        method,
        body,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (method === "POST" && url.pathname === "/api/bgg/account") {
        if (linkStatus !== 200) return json({ error: "Fixture BGG identity rejected" }, linkStatus);
        if (
          !body ||
          typeof body !== "object" ||
          !("username" in body) ||
          typeof body.username !== "string"
        )
          throw new Error("Expected explicit BGG username in link request");
        selectedUsername = body.username;
        account = {
          ...account,
          pending: {
            id: 18,
            username: selectedUsername,
            avatarUrl: null,
            status: "syncing",
            nextAttemptAt: null,
            error: null,
          },
        };
        return json(account);
      }
      if (method === "POST" && url.pathname === "/api/bgg/account/sync") {
        if (pendingSync) return pendingSync;
        if (syncStatus !== 200) return json({ error: "Fixture BGG sync failed" }, syncStatus);
        if (failedSyncReceipt) {
          account = {
            ...account,
            pending: {
              id: 18,
              username: selectedUsername,
              avatarUrl: null,
              status: "failed",
              nextAttemptAt: null,
              error: "Fixture remote failure",
            },
            lastAttempt: { status: "error", at: syncedAt },
          };
          return json(account);
        }
        account = linked(selectedUsername);
        return json(account);
      }
      if (method === "DELETE" && url.pathname === "/api/bgg/account") {
        if (unlinkStatus !== 200) return json({ error: "Fixture unlink rejected" }, unlinkStatus);
        account = empty();
        return json(account);
      }
      throw new Error(`Unexpected BGG fixture method ${method}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Content() {
  const bgg = useBggAccount(options);
  return <ProfileBggCard bgg={bgg} />;
}
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Content />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function seed(value = linked()) {
  account = value;
  selectedUsername = value.active?.username ?? "braveheart85";
  client.setQueryData(bggAccountQuery(options).queryKey, value);
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function confirm(name: string) {
  await userEvent
    .setup()
    .press(within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name }));
}
async function enter(username: string) {
  await fireEvent.changeText(screen.getByTestId("profile-bgg-username"), username);
}

it("renders the current successful username and keeps its sync metadata and provider attribution", async () => {
  seed();
  await render(<Fixture />);
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(screen.getByText("Collection up to date")).toBeVisible();
  expect(screen.getByText("Last successful sync")).toBeVisible();
  expect(screen.getByRole("button", { name: "Change BGG username" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Disconnect BoardGameGeek" })).toBeEnabled();
  expect(writes).toHaveLength(0);
});

it("opens the brand attribution through the native Linking boundary only on explicit action", async () => {
  const open = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  seed();
  await render(<Fixture />);
  expect(open).not.toHaveBeenCalled();
  await press("Powered by BGG — open BoardGameGeek");
  expect(open).toHaveBeenCalledExactlyOnceWith("https://boardgamegeek.com");
});

it("keeps synchronization disabled while the first account read has no authoritative data", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const sync = screen.getByRole("button", { name: "Sync collection" });
  expect(sync).toBeDisabled();
  await userEvent.setup().press(sync);
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(writes).toHaveLength(0);
  await act(() => finish(json(empty())));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sync collection" })).toBeEnabled(),
  );
});

it("requires an explicit nonempty BGG username and permits cancelling invalid input without a provider write", async () => {
  seed(empty());
  await render(<Fixture />);
  await press("Sync collection");
  await confirm("Sync collection");
  expect(screen.getByText("Enter a valid BGG username.")).toBeVisible();
  await enter("   ");
  await confirm("Sync collection");
  expect(screen.getByText("Enter a valid BGG username.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm("Cancel");
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("links a trimmed explicit username, then synchronizes before publishing its collection", async () => {
  seed(empty());
  await render(<Fixture />);
  await press("Sync collection");
  await enter("  braveheart85  ");
  await confirm("Sync collection");
  expect(await screen.findByText("braveheart85")).toBeVisible();
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes).toEqual([
    {
      path: "/api/bgg/account",
      method: "POST",
      body: { username: "braveheart85" },
      authorization: "Bearer fixture-bgg-owner",
    },
    {
      path: "/api/bgg/account/sync",
      method: "POST",
      body: undefined,
      authorization: "Bearer fixture-bgg-owner",
    },
  ]);
  expect(client.getQueryData(bggAccountQuery(options).queryKey)).toMatchObject(linked());
});

it("prepopulates the current username for editing and leaves the original account untouched on cancellation", async () => {
  seed();
  await render(<Fixture />);
  await press("Change BGG username");
  expect(screen.getByTestId("profile-bgg-username")).toHaveProp("value", "braveheart85");
  await enter("different-player");
  await confirm("Cancel");
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("retains an unsaved changed username when the edit dialog is reopened", async () => {
  seed();
  await render(<Fixture />);
  await press("Change BGG username");
  await enter("different-player");
  await confirm("Cancel");
  await press("Change BGG username");
  expect(screen.getByTestId("profile-bgg-username")).toHaveProp("value", "different-player");
  expect(writes).toHaveLength(0);
});

it("resynchronizes the existing identity without requiring another username confirmation", async () => {
  seed();
  await render(<Fixture />);
  await press("Sync collection");
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[0].body).toEqual({ username: "braveheart85" });
  expect(screen.queryByTestId("profile-bgg-username")).toBeNull();
  expect(await screen.findByText("Collection up to date")).toBeVisible();
});

it("keeps all provider controls disabled while a real synchronization request is pending", async () => {
  seed();
  let finish: (value: Response) => void = () => {};
  pendingSync = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await press("Sync collection");
  expect(await screen.findByText("Syncing BoardGameGeek collection")).toBeVisible();
  for (const name of ["Sync collection", "Change BGG username", "Disconnect BoardGameGeek"]) {
    const button = screen.getByRole("button", { name });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
  }
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await waitFor(() => expect(writes).toHaveLength(2));
  pendingSync = undefined;
  account = linked();
  await act(() => finish(json(account)));
  expect(await screen.findByText("Collection up to date")).toBeVisible();
});

it("represents server-side synchronization state as busy even without a local mutation", async () => {
  seed({
    ...linked(),
    pending: {
      id: 18,
      username: "staged-player",
      avatarUrl: null,
      status: "syncing",
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      error: null,
    },
  });
  await render(<Fixture />);
  expect(screen.getByText("Syncing BoardGameGeek collection")).toBeVisible();
  expect(screen.getByRole("button", { name: "Sync collection" })).toBeDisabled();
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("retains a published collection and observable feedback after an ordinary rejected username change", async () => {
  seed();
  linkStatus = 400;
  await render(<Fixture />);
  await press("Change BGG username");
  await enter("missing-player");
  await confirm("Sync collection");
  expect(
    await screen.findByText(
      "Could not synchronize BGG collection. Your previous collection is retained.",
    ),
  ).toBeVisible();
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "link_bgg");
  expect(writes).toHaveLength(1);
});

it("retains its previous successful account if synchronization fails after the username staging succeeds", async () => {
  seed();
  failedSyncReceipt = true;
  await render(<Fixture />);
  await press("Sync collection");
  expect(
    await screen.findByText(
      "Could not synchronize BGG collection. Your previous collection is retained.",
    ),
  ).toBeVisible();
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(writes).toHaveLength(2);
});

it("keeps prior successful collection metadata visible when the server reports a failed latest attempt", async () => {
  seed({ ...linked(), lastAttempt: { status: "error", at: syncedAt } });
  await render(<Fixture />);
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(
    screen.getByText("Could not synchronize BGG collection. Your previous collection is retained."),
  ).toBeVisible();
  expect(screen.queryByText("Collection up to date")).toBeNull();
});

it("requires explicit disconnect consent and keeps the collection available after cancellation", async () => {
  seed();
  await render(<Fixture />);
  await press("Disconnect BoardGameGeek");
  expect(
    screen.getByText(
      "Synced collection games will be removed from your profile. Existing matches remain unchanged.",
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm("Cancel");
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("removes only the owned provider collection after explicit disconnect and reconciles the authoritative receipt", async () => {
  seed();
  const owned = ["bgg-collection", API, "owner", "snapshot-braveheart85", "", "owner"];
  const other = ["bgg-collection", API, "owner", "snapshot-other", "", "other-player"];
  client.setQueryData(owned, { private: "owned collection" });
  client.setQueryData(other, { private: "other collection" });
  await render(<Fixture />);
  await press("Disconnect BoardGameGeek");
  await confirm("Disconnect");
  await waitFor(() => expect(writes).toHaveLength(1));
  await waitFor(() => expect(screen.queryByText("braveheart85")).toBeNull());
  expect(writes[0]).toMatchObject({ path: "/api/bgg/account", method: "DELETE" });
  await waitFor(() => expect(client.getQueryData(owned)).toBeUndefined());
  expect(client.getQueryData(other)).toEqual({ private: "other collection" });
  expect(screen.getByRole("button", { name: "Sync collection" })).toBeEnabled();
});

it("rolls back a rejected disconnect and keeps its existing collection visible with the failure state", async () => {
  seed();
  unlinkStatus = 400;
  await render(<Fixture />);
  await press("Disconnect BoardGameGeek");
  await confirm("Disconnect");
  expect(
    await screen.findByText(
      "Could not synchronize BGG collection. Your previous collection is retained.",
    ),
  ).toBeVisible();
  expect(screen.getByText("braveheart85")).toBeVisible();
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "disconnect_bgg");
});

it("does not expose a cached provider identity after an authorization denial and recovers an ordinary first-read failure", async () => {
  readStatus = 503;
  await render(<Fixture />);
  expect(
    await screen.findByText(
      "Could not synchronize BGG collection. Your previous collection is retained.",
    ),
  ).toBeVisible();
  readStatus = 200;
  account = linked();
  await press("Try again");
  expect(await screen.findByText("braveheart85")).toBeVisible();
  readStatus = 403;
  await act(() =>
    client.invalidateQueries({ queryKey: bggAccountQuery(options).queryKey, exact: true }),
  );
  await waitFor(() => expect(screen.queryByText("braveheart85")).toBeNull());
  expect(screen.queryByRole("button", { name: "Disconnect BoardGameGeek" })).toBeNull();
});
