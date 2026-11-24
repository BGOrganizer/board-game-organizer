import type { InviteClaimResponse, InviteReviewResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ComponentProps, createContext, useContext } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InviteScreen from "@/app/invite/[token]";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { InviteClaimScreen } from "../InviteClaimScreen";

const RouteParams = createContext<ComponentProps<typeof InviteClaimScreen>>({});

import { inviteToken, tableClaimReceipt, tableInviteReview } from "./inviteFixtures";

const API = "https://claim-native-fixtures.test";
const boundary = vi.hoisted(() => ({
  apiUrl: "https://claim-native-fixtures.test",
  userId: "owner",
  loaded: true,
  userLoaded: true,
  signedIn: true,
  metadata: { mobileNumber: "+441234567890" } as Record<string, unknown>,
  getToken: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: boundary.loaded, isSignedIn: boundary.signedIn }),
  useUser: () => ({
    isLoaded: boundary.userLoaded,
    user: boundary.signedIn ? { unsafeMetadata: boundary.metadata } : null,
  }),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: boundary.apiUrl,
    userId: boundary.userId,
    enabled: boundary.loaded && boundary.signedIn,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => useContext(RouteParams),
  Redirect: ({ href }: { href: unknown }) => (
    <Text testID="router-redirect">{JSON.stringify(href)}</Text>
  ),
}));
let client: QueryClient;
let review: InviteReviewResponse;
let receipt: InviteClaimResponse | object;
let readCode: number;
let claimCode: number;
let pendingRead: Promise<Response> | undefined;
let pendingClaim: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
const writes: { body: Record<string, unknown>; authorization: string | null }[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function friendReview(): InviteReviewResponse {
  return {
    kind: "FRIEND",
    expiresAt: "2030-06-08T12:00:00Z",
    inviter: { id: "inviter", name: "Inviting Player", username: "inviter", avatarUrl: null },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  boundary.loaded = boundary.userLoaded = boundary.signedIn = true;
  boundary.metadata = { mobileNumber: "+441234567890" };
  boundary.getToken.mockImplementation(async () => `fixture-${boundary.userId}`);
  review = friendReview();
  receipt = { success: true, inviter: null };
  readCode = claimCode = 200;
  pendingRead = pendingClaim = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl) throw new Error(`Unexpected invite origin ${url.origin}`);
      if (url.pathname === "/api/invites/claim" && init?.method === "POST") {
        writes.push({
          body: JSON.parse(String(init.body)),
          authorization: new Headers(init.headers).get("authorization"),
        });
        return (
          pendingClaim ??
          json(claimCode === 200 ? receipt : { error: "Fixture claim rejected" }, claimCode)
        );
      }
      if (!url.pathname.startsWith("/api/invites/") || (init?.method ?? "GET") !== "GET")
        throw new Error(`Unexpected invite path ${url.pathname}`);
      reads.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      return (
        pendingRead ??
        json(readCode === 200 ? review : { error: "Fixture invite unavailable" }, readCode)
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({ token = inviteToken }: ComponentProps<typeof InviteClaimScreen>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <RouteParams value={{ token }}>
          <InviteScreen />
        </RouteParams>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}

it.each([
  { token: undefined },
  { token: "short" },
  { token: "https://external.example.test" },
  { token: [inviteToken] },
])(
  "rejects an invalid continuation token $token before reading or claiming an invite",
  async ({ token }) => {
    // Undefined is intentional: bypass this fixture's default to exercise the public guard.
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <InviteClaimScreen token={token} />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Invitation unavailable")).toBeVisible();
    expect(reads).toHaveLength(0);
    expect(writes).toHaveLength(0);
  },
);

it.each(["session", "user"] as const)(
  "waits for the actual %s SDK state before fetching private invitation details",
  async (pending) => {
    if (pending === "session") boundary.loaded = false;
    else boundary.userLoaded = false;
    await render(<Fixture />);
    expect(screen.queryByText("Invitation unavailable")).toBeNull();
    expect(screen.queryByTestId("router-redirect")).toBeNull();
    expect(reads).toHaveLength(0);
    expect(writes).toHaveLength(0);
  },
);

it("preserves a valid invitation through the declarative sign-in redirect", async () => {
  boundary.signedIn = false;
  await render(<Fixture />);
  expect(screen.getByTestId("router-redirect")).toHaveTextContent(
    JSON.stringify({ pathname: "/sign-in", params: { inviteToken } }),
  );
  expect(reads).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

it("requires profile completion while preserving the same validated invitation", async () => {
  boundary.metadata = {};
  await render(<Fixture />);
  expect(screen.getByTestId("router-redirect")).toHaveTextContent(
    JSON.stringify({ pathname: "/mobile-number", params: { inviteToken } }),
  );
  expect(reads).toHaveLength(0);
});

it("shows friendship consent without claiming automatically and redirects only after the authenticated receipt", async () => {
  await render(<Fixture />);
  expect(
    await screen.findByText("Claiming this invite connects you with the inviter."),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  boundary.getToken.mockResolvedValue("fresh-claim-token");
  await press("Claim invite");
  await waitFor(() =>
    expect(screen.getByTestId("router-redirect")).toHaveTextContent('"/contacts"'),
  );
  expect(writes).toEqual([
    { body: { token: inviteToken }, authorization: "Bearer fresh-claim-token" },
  ]);
  expect(reads).toHaveLength(1);
});

it.each(["SEATED", "WAITING"] as const)(
  "opens a reviewed table with explicit consent and navigates to the canonical receipt even when the resulting position is %s",
  async (position) => {
    review = tableInviteReview();
    receipt = tableClaimReceipt(position);
    await render(<Fixture />);
    expect(await screen.findByText("Table #1")).toBeVisible();
    await press("Accept invitation");
    await waitFor(() =>
      expect(screen.getByTestId("router-redirect")).toHaveTextContent(
        JSON.stringify({
          pathname: "/event/table",
          params: { eventId: tableInviteReview().event.id, tableId: tableInviteReview().table.id },
        }),
      ),
    );
    expect(writes[0].body).toMatchObject({
      token: inviteToken,
      consent: true,
      participation: {
        version: 1,
        gameVotes: {},
        availability: { version: 1, dateVotes: {}, locationVotes: {} },
      },
    });
    expect(reads).toHaveLength(1);
  },
);

it.each([401, 403, 409, 410])(
  "keeps an unavailable HTTP %s invite explicit and never fabricates consent",
  async (status) => {
    readCode = status;
    await render(<Fixture />);
    expect(await screen.findByText("Invitation unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Claim invite" })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("keeps a transient review failure retryable and enables a claim only after a successful fresh review", async () => {
  readCode = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load this invitation.")).toBeVisible();
  readCode = 200;
  await press("Try again");
  expect(
    await screen.findByText("Claiming this invite connects you with the inviter."),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("keeps initial review loading distinct from unavailable and can reveal the authoritative response later", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByRole("button", { name: "Claim invite" })).toBeNull();
  expect(screen.queryByText("Invitation unavailable")).toBeNull();
  pendingRead = undefined;
  await act(() => finish(json(review)));
  expect(await screen.findByRole("button", { name: "Claim invite" })).toBeEnabled();
});

it("coalesces repeated friendship claims while the real receipt is pending", async () => {
  let finish: (value: Response) => void = () => {};
  pendingClaim = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const consent = await screen.findByRole("button", { name: "Claim invite" });
  // Both native taps can be delivered before React commits a disabled button.
  await act(async () => {
    await Promise.all([fireEvent.press(consent), fireEvent.press(consent)]);
  });
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Claim invite" })).toBeDisabled();
  await press("Claim invite");
  expect(writes).toHaveLength(1);
  await act(() => finish(json(receipt)));
  expect(await screen.findByTestId("router-redirect")).toHaveTextContent('"/contacts"');
  expect(writes).toEqual([{ body: { token: inviteToken }, authorization: "Bearer fixture-owner" }]);
});

it("retains friendship review after a rejected claim for an idempotent explicit retry without consuming-token rereads", async () => {
  claimCode = 400;
  await render(<Fixture />);
  await press("Claim invite");
  expect(await screen.findByText("Could not claim this invite. Try again.")).toBeVisible();
  expect(reads).toHaveLength(1);
  claimCode = 200;
  await press("Claim invite");
  expect(await screen.findByTestId("router-redirect")).toHaveTextContent('"/contacts"');
  expect(writes).toHaveLength(2);
  expect(reads).toHaveLength(1);
});

it("rejects a mismatched table receipt and preserves the reviewed settings for an explicit safe retry", async () => {
  review = tableInviteReview();
  const correct = tableClaimReceipt();
  receipt = {
    ...correct,
    table: { ...correct.table, tableId: "88888888-8888-4888-8888-888888888888" },
  };
  await render(<Fixture />);
  await press("Accept invitation");
  expect(
    await screen.findByText("Could not accept this invitation. Refresh the details and try again."),
  ).toBeVisible();
  expect(screen.queryByTestId("router-redirect")).toBeNull();
  expect(reads).toHaveLength(1);
});

it("keeps background friendship review failures visible and blocks consent until an explicit successful refresh", async () => {
  await render(<Fixture />);
  await screen.findByRole("button", { name: "Claim invite" });
  readCode = 503;
  await act(() =>
    client.invalidateQueries({ queryKey: ["invites", API, "owner", "review", inviteToken] }),
  );
  expect(await screen.findByText("Could not claim this invite. Try again.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Claim invite" })).toBeDisabled();
  readCode = 200;
  await press("Try again");
  await waitFor(() => expect(screen.getByRole("button", { name: "Claim invite" })).toBeEnabled());
});

it("drops another account's reviewed data and pending claim state when the owner/API/token changes", async () => {
  review = tableInviteReview();
  const view = await render(<Fixture />);
  await screen.findByText("Private games group");
  boundary.userId = "other-owner";
  boundary.apiUrl = "https://other-claim-fixtures.test";
  review = {
    ...tableInviteReview(),
    group: { ...tableInviteReview().group, name: "Other account group" },
  };
  await view.rerender(<Fixture token="zyxwvutsrqponmlkjihgfe" />);
  expect(screen.queryByText("Private games group")).toBeNull();
  expect(await screen.findByText("Other account group")).toBeVisible();
  expect(reads.at(-1)?.authorization).toBe("Bearer fixture-other-owner");
  expect(reads.at(-1)?.url.origin).toBe(boundary.apiUrl);
  expect(writes).toHaveLength(0);
});

it("hides a previously reviewed table after HTTP 404 and requires an explicit successful reread before consent", async () => {
  review = tableInviteReview();
  await render(<Fixture />);
  expect(await screen.findByText("Private games group")).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  readCode = 404;
  await act(() =>
    client.invalidateQueries({
      queryKey: ["invites", API, "owner", "review", inviteToken],
      exact: true,
    }),
  );
  expect(await screen.findByText("Invitation unavailable")).toBeVisible();
  expect(screen.queryByText("Private games group", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText("Table #1", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByTestId("router-redirect")).toBeNull();
  expect(writes).toEqual([]);
  readCode = 200;
  await press("Try again");
  expect(await screen.findByText("Private games group")).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  expect(writes).toEqual([]);
  expect(reads).toHaveLength(3);
});

it("keeps HTTP 500 review failures distinct from unavailable tokens and enables consent only after an explicit retry", async () => {
  review = tableInviteReview();
  readCode = 500;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load this invitation.")).toBeVisible();
  expect(screen.queryByText("Invitation unavailable")).toBeNull();
  expect(screen.queryByText("Private games group", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(writes).toEqual([]);
  readCode = 200;
  await press("Try again");
  expect(await screen.findByText("Table #1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  expect(screen.queryByText("Could not load this invitation.")).toBeNull();
  expect(reads).toHaveLength(2);
  expect(writes).toEqual([]);
});

it("keeps friendship consent disabled while an explicit review retry is still pending", async () => {
  await render(<Fixture />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Claim invite" })).toBeEnabled());
  readCode = 503;
  await act(() =>
    client.invalidateQueries({
      queryKey: ["invites", API, "owner", "review", inviteToken],
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not claim this invite. Try again.")).toBeVisible();

  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  boundary.getToken.mockResolvedValueOnce("renewed-review-token");
  await press("Try again");
  expect(screen.getByRole("button", { name: "Claim invite" })).toBeDisabled();
  await press("Claim invite");
  expect(writes).toEqual([]);
  await waitFor(() => expect(reads).toHaveLength(3));
  expect(reads.at(-1)).toMatchObject({ authorization: "Bearer renewed-review-token" });
  expect(reads.at(-1)?.url.pathname).toBe(`/api/invites/${inviteToken}`);
  expect(screen.queryByTestId("router-redirect")).toBeNull();

  await act(() => finish(json(review)));
  await waitFor(() => expect(screen.getByRole("button", { name: "Claim invite" })).toBeEnabled());
  expect(screen.queryByText("Could not claim this invite. Try again.")).toBeNull();
  expect(writes).toEqual([]);
});
