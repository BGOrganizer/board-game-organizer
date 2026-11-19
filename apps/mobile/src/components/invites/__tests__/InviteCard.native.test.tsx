import { URL } from "node:url";
import type { InviteRow } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { InviteCard } from "../InviteCard";

const auth = vi.hoisted(() => ({ userId: "owner" as string | null, getToken: vi.fn() }));
vi.mock("@clerk/expo", () => ({ useAuth: () => auth }));
const API = "https://native-invite-card.test";
const created: InviteRow = {
  token: "fixture_invite_token_01",
  link: `${API}/invite/fixture_invite_token_01`,
  email: null,
  expiresAt: "2030-06-08T10:00:00.000Z",
};
let client: QueryClient;
let status: number;
let pending: Promise<Response> | undefined;
const writes: { method: string; path: string; authorization: string | null; body: unknown }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  auth.userId = "owner";
  auth.getToken.mockResolvedValue("fresh-fixture-token");
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  status = 200;
  pending = undefined;
  writes.length = 0;
  vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      expect(url.pathname).toBe("/api/invites");
      expect(init?.method).toBe("POST");
      writes.push({
        method: String(init?.method),
        path: url.pathname,
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      });
      return (
        pending ??
        Response.json(status === 200 ? created : { error: "Invite rejected" }, { status })
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({ token = "stale-prop-token" }: { token?: string | null }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <InviteCard apiUrl={API} token={token} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const create = () => userEvent.setup().press(screen.getByRole("button", { name: "Create invite" }));

it("renders an invitation action without creating, sharing or claiming any link before consent", async () => {
  await render(<Fixture />);
  expect(screen.getByText("Invite a friend")).toBeVisible();
  expect(screen.getByText("Generate a link to connect with someone.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Create invite" })).toBeEnabled();
  expect(writes).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
});

it("uses the current session token, displays the authoritative generated link and opens only the native share port", async () => {
  await render(<Fixture token={null} />);
  await create();
  expect(await screen.findByText(created.link)).toBeVisible();
  expect(writes).toEqual([
    { method: "POST", path: "/api/invites", authorization: "Bearer fresh-fixture-token", body: {} },
  ]);
  expect(Share.share).toHaveBeenCalledExactlyOnceWith({ message: created.link });
  expect(screen.queryByText("Generate a link to connect with someone.")).toBeNull();
});

it("shows pending placeholders instead of another creation action until the real mutation receipt arrives", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await create();
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.queryByRole("button", { name: "Create invite" })).toBeNull();
  expect(screen.queryByText("Invite a friend")).toBeNull();
  expect(Share.share).not.toHaveBeenCalled();
  await act(() => finish(Response.json(created)));
  expect(await screen.findByText(created.link)).toBeVisible();
  expect(screen.getByRole("button", { name: "Create invite" })).toBeEnabled();
  expect(Share.share).toHaveBeenCalledOnce();
  expect(writes).toHaveLength(1);
});

it("preserves the generated link when the OS share sheet rejects or is dismissed", async () => {
  vi.mocked(Share.share).mockRejectedValue(new Error("Share dismissed"));
  await render(<Fixture />);
  await create();
  expect(await screen.findByText(created.link)).toBeVisible();
  await waitFor(() => expect(Share.share).toHaveBeenCalledOnce());
  expect(screen.queryByText("Could not create the invite. Try again.")).toBeNull();
  expect(writes).toHaveLength(1);
});

it("exposes an authoritative create failure and makes an explicit retry generate and share the link", async () => {
  status = 400;
  await render(<Fixture />);
  await create();
  expect(
    (await screen.findAllByText("Could not create the invite. Try again.")).length,
  ).toBeGreaterThan(0);
  expect(Share.share).not.toHaveBeenCalled();
  status = 200;
  auth.getToken.mockResolvedValue("retry-fixture-token");
  await create();
  expect(await screen.findByText(created.link)).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1].authorization).toBe("Bearer retry-fixture-token");
  expect(Share.share).toHaveBeenCalledExactlyOnceWith({ message: created.link });
});

it("never falls back to a stale prop token after the current Clerk session stops supplying credentials", async () => {
  auth.getToken.mockResolvedValue(null);
  await render(<Fixture />);
  await create();
  await screen.findAllByText("Could not create the invite. Try again.");
  expect(writes).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
});

it("does not mint an invitation without a stable signed-in owner even if a stale token prop remains", async () => {
  auth.userId = null;
  await render(<Fixture />);
  await create();
  await screen.findAllByText("Could not create the invite. Try again.");
  expect(writes).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
});
