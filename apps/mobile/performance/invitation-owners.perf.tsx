import { URL } from "node:url";
import type { InviteClaimResponse, InviteReviewResponse } from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { type ReactNode, useEffect } from "react";
import { Share } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import InviteScreen from "@/app/invite/[token]";
import {
  inviteToken,
  tableClaimReceipt,
  tableInviteReview,
} from "@/components/invites/__tests__/inviteFixtures";
import { TableInviteLinkRow } from "@/components/invites/TableInviteLinkRow";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { measureNativeListCells, scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const API = "https://invitation-owner-performance.test";
const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "fixture-auth-owner"),
  replace: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "invite-owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
  useUser: () => ({ isLoaded: true, user: { unsafeMetadata: { mobileNumber: "+441234567890" } } }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://invitation-owner-performance.test" } } },
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({ token: inviteToken }),
  Redirect: ({ href }: { href: unknown }) => {
    // Navigation is an SDK boundary, not an imitation of the destination screen.
    useEffect(() => {
      boundary.replace(href);
    }, [href]);
    return null;
  },
}));
const friendReview: InviteReviewResponse = {
  kind: "FRIEND",
  expiresAt: "2030-06-08T12:00:00Z",
  inviter: { id: "inviter", name: "Inviting Player", username: "inviter", avatarUrl: null },
};
function clientForScenario() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}
const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <NativeTestProviders>{children}</NativeTestProviders>
    </QueryClientProvider>
  );
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function vote(label: string, choice: "Yes" | "No") {
  await press(`${label}: Choose your vote`);
  await userEvent
    .setup()
    .press(within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: choice }));
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("InviteClaimScreen: explicit table ballots and pending single consent reach the authoritative waiting receipt", async () => {
  const client = clientForScenario();
  const base = tableInviteReview();
  const review: InviteReviewResponse = {
    ...base,
    table: {
      ...base.table,
      games: [...base.table.games, { gameId: 2, durationMinutes: 30 }],
      gamesDetail: [
        ...base.table.gamesDetail,
        { id: 2, name: "Second game", imageUrl: null, year: null },
      ],
    },
  };
  const writes: { body: unknown; authorization: string | null }[] = [];
  const reads: string[] = [],
    unexpected: string[] = [];
  let release: (response: Response) => void = () => {};
  let pending: Promise<Response>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin === API &&
        url.pathname === `/api/invites/${inviteToken}` &&
        (init?.method ?? "GET") === "GET"
      ) {
        reads.push(url.pathname);
        return Response.json(review);
      }
      if (url.origin === API && url.pathname === "/api/invites/claim" && init?.method === "POST") {
        writes.push({
          body: JSON.parse(String(init.body)),
          authorization: new Headers(init.headers).get("authorization"),
        });
        return pending;
      }
      unexpected.push(url.href);
      throw new Error(`Unexpected invitation request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(<InviteScreen />, {
      wrapper: wrapperFor(client),
      beforeEach: () => {
        client.clear();
        vi.clearAllMocks();
        boundary.getToken.mockResolvedValue("fixture-auth-owner");
        writes.length = reads.length = unexpected.length = 0;
        pending = new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
      scenario: async () => {
        const title = await screen.findByText("Table #1");
        expect(title).toBeVisible();
        expect(screen.getByText(base.group.name)).toBeVisible();
        expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
        await userEvent.setup().press(screen.getByTestId("table-link-consent-submit"));
        expect(writes).toEqual([]);
        let list = title;
        while (list.parent && typeof list.props.onScroll !== "function") list = list.parent;
        await measureNativeListCells(list, { headerHeight: 300, cellHeight: 100 });
        await scrollNativeListToEnd(list, 2000);
        await screen.findByText("Second game");
        await vote("Chess", "Yes");
        expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
        await vote("Second game", "No");
        expect(screen.getByTestId("table-link-consent-submit")).toBeEnabled();
        boundary.getToken.mockResolvedValue("fixture-auth-claim");
        await press("Accept invitation");
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
        await userEvent.setup().press(screen.getByTestId("table-link-consent-submit"));
        expect(writes).toEqual([
          {
            authorization: "Bearer fixture-auth-claim",
            body: {
              token: inviteToken,
              consent: true,
              participation: {
                version: 1,
                gameVotes: { "1": "YES", "2": "NO" },
                availability: { version: 1, dateVotes: {}, locationVotes: {} },
              },
            },
          },
        ]);
        expect(boundary.replace).not.toHaveBeenCalled();
        await act(() => release(Response.json(tableClaimReceipt("WAITING"))));
        await waitFor(() =>
          expect(boundary.replace).toHaveBeenCalledExactlyOnceWith({
            pathname: "/event/table",
            params: { eventId: base.event.id, tableId: base.table.id },
          }),
        );
        expect(screen.queryByTestId("table-link-consent-submit")).toBeNull();
        expect(reads).toHaveLength(1);
        expect(unexpected).toEqual([]);
        await waitFor(() => expect(client.isMutating()).toBe(0));
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

it("InviteClaimScreen: expired review retries explicitly and friendship waits for one authenticated receipt", async () => {
  const client = clientForScenario();
  const reads: string[] = [],
    writes: unknown[] = [],
    unexpected: string[] = [];
  let expired = true;
  let release: (response: Response) => void = () => {};
  let pending: Promise<Response>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin === API &&
        url.pathname === `/api/invites/${inviteToken}` &&
        (init?.method ?? "GET") === "GET"
      ) {
        reads.push(url.pathname);
        return Response.json(expired ? { error: "INVITE_EXPIRED" } : friendReview, {
          status: expired ? 410 : 200,
        });
      }
      if (url.origin === API && url.pathname === "/api/invites/claim" && init?.method === "POST") {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture-auth-owner");
        writes.push(JSON.parse(String(init.body)));
        return pending;
      }
      unexpected.push(url.href);
      throw new Error(`Unexpected friendship request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(<InviteScreen />, {
      wrapper: wrapperFor(client),
      beforeEach: () => {
        client.clear();
        vi.clearAllMocks();
        boundary.getToken.mockResolvedValue("fixture-auth-owner");
        expired = true;
        reads.length = writes.length = unexpected.length = 0;
        pending = new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
      scenario: async () => {
        expect(await screen.findByText("Invitation unavailable")).toBeVisible();
        expect(writes).toEqual([]);
        expired = false;
        await press("Try again");
        expect(
          await screen.findByText("Claiming this invite connects you with the inviter."),
        ).toBeVisible();
        expect(writes).toEqual([]);
        await press("Claim invite");
        await waitFor(() => expect(writes).toEqual([{ token: inviteToken }]));
        expect(screen.getByRole("button", { name: "Claim invite" })).toBeDisabled();
        await press("Claim invite");
        expect(writes).toHaveLength(1);
        expect(boundary.replace).not.toHaveBeenCalled();
        const receipt: InviteClaimResponse = { success: true, inviter: null };
        await act(() => release(Response.json(receipt)));
        await waitFor(() => expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/contacts"));
        expect(reads).toHaveLength(2);
        expect(unexpected).toEqual([]);
        await waitFor(() => expect(client.isMutating()).toBe(0));
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

it("TableInviteLinkRow: pending generation coalesces and the canonical receipt is shared again without a second write", async () => {
  const client = clientForScenario();
  const review = tableInviteReview();
  const link = `${API}/invite/${inviteToken}`;
  const writes: unknown[] = [],
    unexpected: string[] = [];
  let release: (response: Response) => void = () => {};
  let pending: Promise<Response>;
  const sharing = vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin === API && url.pathname === "/api/invites" && init?.method === "POST") {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture-auth-owner");
        writes.push(JSON.parse(String(init.body)));
        return pending;
      }
      unexpected.push(url.href);
      throw new Error(`Unexpected generator request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(<TableInviteLinkRow tableId={review.table.id} />, {
      wrapper: wrapperFor(client),
      beforeEach: () => {
        client.clear();
        vi.clearAllMocks();
        boundary.getToken.mockResolvedValue("fixture-auth-owner");
        writes.length = unexpected.length = 0;
        pending = new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
      scenario: async () => {
        expect(screen.getByText("Generate invite")).toBeVisible();
        expect(writes).toEqual([]);
        await press("Generate invite");
        await waitFor(() => expect(writes).toEqual([{ tableId: review.table.id }]));
        expect(screen.getByRole("button", { name: "Generate invite" })).toBeDisabled();
        await press("Generate invite");
        expect(writes).toHaveLength(1);
        expect(sharing).not.toHaveBeenCalled();
        await act(() =>
          release(
            Response.json({ token: inviteToken, link, email: null, expiresAt: review.expiresAt }),
          ),
        );
        await waitFor(() => expect(sharing).toHaveBeenCalledExactlyOnceWith({ message: link }));
        expect(await screen.findByTestId("table-invite-link-value")).toHaveTextContent(link);
        expect(screen.getByTestId("table-invite-link-value")).toHaveProp("selectable", true);
        await press("Share invite link");
        expect(sharing).toHaveBeenCalledTimes(2);
        expect(writes).toHaveLength(1);
        expect(boundary.replace).not.toHaveBeenCalled();
        expect(unexpected).toEqual([]);
        await waitFor(() => expect(client.isMutating()).toBe(0));
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});
