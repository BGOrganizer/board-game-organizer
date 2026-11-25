import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { type ReactNode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import SearchGroupsScreen from "@/app/group/search";
import { GroupSearchDistance } from "@/components/groups/GroupSearchDistance";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
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
  useFocusEffect: () => {},
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
    if (url.pathname === "/api/groups" && url.searchParams.get("scope") === "public")
      return Response.json({ items: [], nextCursor: null });
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

it("Group search route: finds groups with Friends and a single character", async () => {
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
        expect(screen.getByTestId("list-filter-friends")).toBeSelected();
        expect(await screen.findByText("No public groups with your friends")).toBeVisible();
        const input = screen.getByTestId("list-search-input");
        await fireEvent.changeText(input, "a");
        expect(screen.getByTestId("list-search-input")).toBe(input);
        await waitFor(() =>
          expect(
            fetch.mock.calls.some(([input]) => {
              const params = new URL(String(input)).searchParams;
              return params.get("friends") === "true" && params.get("query") === "a";
            }),
          ).toBe(true),
        );
        expect(await screen.findByText("No groups found")).toBeVisible();
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

function DistancePicker() {
  const [radiusKm, setRadiusKm] = useState(25);
  return <GroupSearchDistance radiusKm={radiusKm} onChange={setRadiusKm} />;
}

it("Group search distance: choose a preset from the anchored menu", async () => {
  await installNativePopoverMeasurements();
  const result = await measureRenders(<DistancePicker />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      await pressMeasuredPopover(screen.getByRole("button", { name: "Distance, 25 km" }));
      await fireEvent.press(screen.getByTestId("group-distance-50"));
      expect(await screen.findByRole("button", { name: "Distance, 50 km" })).toBeVisible();
      expect(screen.queryByTestId("group-distance-25")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});
