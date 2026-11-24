import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import SearchGroupsScreen from "@/app/group/search";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const API = "https://group-routes-render.test";
const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "fixture-group-routes-token"),
  push: vi.fn(),
}));
const options = { apiUrl: API, userId: "reviewer", getToken: boundary.getToken, enabled: true };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "reviewer",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  Stack: { Screen: () => null },
}));

function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(url.origin).toBe(API);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer fixture-group-routes-token",
    );
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === "/api/notifications/attention") {
      const targets = JSON.parse(
        url.searchParams.get("targets") ?? "[]",
      ) as NotificationAttentionTarget[];
      const sections = { connections: 0, requests: 0, search: 0 };
      return Response.json({
        asOf: "2030-06-01T10:00:00.000Z",
        unreadCount: 0,
        summary: { groups: 0, events: 0, tables: 0, contacts: 0, sections },
        targets: targets.map((target) => ({ target, count: 0, direct: 0, events: 0, sections })),
      });
    }
    throw new Error(`Unexpected group route fixture request ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetch);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <NativeTestProviders>{children}</NativeTestProviders>
    </QueryClientProvider>
  );
  return { client, fetch, wrapper };
}
afterEach(() => vi.unstubAllGlobals());

it("Group search route: keep short input out of public discovery while the search tab stays selected", async () => {
  const { client, fetch, wrapper } = fixture();
  try {
    const result = await measureRenders(<SearchGroupsScreen />, {
      wrapper,
      beforeEach: () => {
        client.clear();
        fetch.mockClear();
      },
      scenario: async () => {
        expect(screen.getByRole("tab", { name: "Search" })).toBeSelected();
        expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
        await fireEvent.changeText(screen.getByTestId("list-search-input"), "abc");
        expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("abc");
        expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
        expect(fetch.mock.calls.some(([input]) => String(input).includes("scope=public"))).toBe(
          false,
        );
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});
