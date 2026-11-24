import type {
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { type ContextType, type ReactNode, useEffect, useState } from "react";
import { expect, it, vi } from "vitest";
import GroupModerationScreen from "@/app/moderation";
import GroupReviewScreen from "@/app/moderation/[groupId]";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-moderation-perf.test",
  getToken: async () => "review-fixture-token",
  push: vi.fn(),
  dismissTo: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "reviewer",
    sessionId: "review-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push, dismissTo: boundary.dismissTo }),
  useLocalSearchParams: () => ({ groupId: pending.id }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
}));
const focused = {
  isFocused: () => true,
  addListener: () => () => {},
} as unknown as NonNullable<ContextType<typeof NavigationContext>>;

const pending: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  role: "none",
  approved: undefined,
  proposal: { name: "Proposed public club" },
  name: "Proposed public club",
  reviewStatus: "PENDING",
  canInvite: false,
  canEdit: false,
  canViewMembers: false,
  canViewEvents: false,
  canViewRankings: false,
  version: 4,
};
const reviewPath = `/api/groups/${pending.id}/review`;
const navigationPath = `/moderation/${pending.id}`;

it("GroupModeration and GroupReview: open the authorized queue item and apply a valid rejection", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const writes = vi.fn();
  let current = pending;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      expect(url.origin).toBe(boundary.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer review-fixture-token");
      if (method === "GET") {
        if (url.pathname === "/api/groups") {
          expect(url.searchParams.get("scope")).toBe("moderation");
          return Response.json({
            items: current.reviewStatus === "PENDING" ? [current] : [],
            nextCursor: null,
          });
        }
        if (url.pathname === reviewPath) return Response.json(current);
        if (url.pathname === "/api/notifications/attention") {
          const targets = JSON.parse(
            url.searchParams.get("targets") ?? "[]",
          ) as NotificationAttentionTarget[];
          const sections = { connections: 0, requests: 0, search: 0 };
          return Response.json({
            asOf: "2030-06-01T10:00:00.000Z",
            unreadCount: 0,
            summary: { groups: 0, events: 0, tables: 0, contacts: 0, sections },
            targets: targets.map((target) => ({
              target,
              count: 0,
              direct: 0,
              events: 0,
              sections,
            })),
          });
        }
      }
      if (method === "PATCH" && url.pathname === reviewPath) {
        const input = JSON.parse(String(init?.body)) as { reason: string };
        writes(input);
        current = {
          ...current,
          reviewStatus: "REJECTED",
          rejectionReason: input.reason,
          version: current.version + 1,
        };
        return Response.json(current);
      }
      throw new Error(`Unexpected moderation request: ${method} ${url.pathname}`);
    }),
  );
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <NavigationContext.Provider value={focused}>{children}</NavigationContext.Provider>
        </NativeTestProviders>
      </QueryClientProvider>
    );
  }
  function ReviewJourney() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      boundary.push.mockImplementation((path: string) => {
        expect(path).toBe(navigationPath);
        setOpen(true);
      });
    }, []);
    return open ? <GroupReviewScreen /> : <GroupModerationScreen />;
  }
  try {
    const measured = await measureRenders(<ReviewJourney />, {
      wrapper: Providers,
      beforeEach: () => {
        client.clear();
        current = pending;
        writes.mockClear();
        boundary.push.mockReset();
        boundary.dismissTo.mockClear();
      },
      scenario: async () => {
        const user = userEvent.setup();
        const entry = await screen.findByRole("button", { name: `Open group: ${pending.name}` });
        expect(entry).toBeVisible();
        expect(writes).not.toHaveBeenCalled();
        await user.press(entry);
        const reason = await screen.findByLabelText("Rejection reason");
        await waitFor(() => expect(client.isFetching()).toBe(0));
        const reject = screen.getByRole("button", { name: "Reject" });
        await user.press(reject);
        expect(screen.getByText("Enter a rejection reason.")).toBeVisible();
        expect(writes).not.toHaveBeenCalled();
        await fireEvent.changeText(reason, "  Verify the public venue  ");
        await user.press(reject);
        await waitFor(() =>
          expect(writes).toHaveBeenCalledExactlyOnceWith({
            decision: "reject",
            version: pending.version,
            reason: "Verify the public venue",
          }),
        );
        expect(boundary.dismissTo).toHaveBeenCalledExactlyOnceWith("/moderation");
        expect(await screen.findByText("Review completed")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    vi.unstubAllGlobals();
  }
});
