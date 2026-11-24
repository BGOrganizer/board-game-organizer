import { URL } from "node:url";
import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import {
  type Dispatch,
  type EffectCallback,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { afterEach, expect, it, vi } from "vitest";
import CommunityScreen from "@/app/(tabs)/community";
import EventsScreen from "@/app/(tabs)/events";
import GroupsScreen from "@/app/(tabs)/groups";
import TablesScreen from "@/app/(tabs)/tables";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  type MainListOwner,
  seedMainListOwners,
} from "../../web/performance/mainListOwnerFixtures";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "main-owner-token"),
  push: vi.fn(),
}));
const options = {
  apiUrl: "https://main-owner-performance.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "main-owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://main-owner-performance.test" } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useNavigation: () => ({ getState: () => ({ type: "tab" }) }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: EffectCallback) => useEffect(effect, [effect]),
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));
const initialStore = useAppStore.getState();
let selectOwner: Dispatch<SetStateAction<MainListOwner>> | undefined;
// Only fixture selection is controlled: real roots, hooks, Query and native UI run.
// This does not measure Expo's bottom navigation or retained route implementation.
function MainOwnerJourney() {
  const [owner, setOwner] = useState<MainListOwner>("groups");
  useLayoutEffect(() => {
    selectOwner = setOwner;
    return () => {
      selectOwner = undefined;
    };
  }, []);
  return owner === "groups" ? (
    <GroupsScreen />
  ) : owner === "events" ? (
    <EventsScreen />
  ) : (
    <TablesScreen />
  );
}
async function visit(owner: MainListOwner, name: string) {
  const select = selectOwner;
  if (!select) throw new Error("Expected the actual-owner fixture controller");
  await act(() => select(owner));
  expect(await screen.findByText(name)).toBeVisible();
}
async function tab(value: string) {
  await userEvent.setup().press(screen.getByTestId(`top-tab-${value}`));
}
async function more() {
  await userEvent.setup().press(screen.getByRole("button", { name: "Load more" }));
}
function activityList() {
  let host: ReturnType<typeof screen.getByText> | null = screen.getByText(
    "Your network's activities",
  );
  while (host && typeof host.props.onScroll !== "function") host = host.parent;
  if (!host) throw new Error("Expected the real Community SectionList scroll host");
  return host;
}
afterEach(() => {
  useAppStore.setState(initialStore, true);
  vi.unstubAllGlobals();
});

it.each(["main", "community"] as const)(
  "actual %s list owners: cached reentry and authoritative HTTP refresh stay reactive",
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    let fixture: ReturnType<typeof seedMainListOwners>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        expect(url.origin).toBe(options.apiUrl);
        expect(init?.method ?? "GET").toBe("GET");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer main-owner-token");
        return Response.json(fixture.read(url));
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
    try {
      const result = await measureRenders(
        kind === "main" ? <MainOwnerJourney /> : <CommunityScreen />,
        {
          wrapper,
          beforeEach: () => {
            client.clear();
            fixture = seedMainListOwners(client, options);
            useAppStore.setState({ communityViews: {} });
            boundary.push.mockClear();
          },
          scenario: async () => {
            if (kind === "main") {
              expect(await screen.findByText("Cached private group")).toBeVisible();
              expect(screen.queryByText("Retained private group")).toBeNull();
              await more();
              expect(await screen.findByText("Retained private group")).toBeVisible();
              expect(client.getQueryData(fixture.keys.groups)).toBe(fixture.snapshots.groups);
              const privateInput = screen.getByTestId("list-search-input");
              for (let repeat = 0; repeat < 2; repeat++) {
                await tab("public");
                expect(await screen.findByText("Cached public group")).toBeVisible();
                await tab("private");
                expect(await screen.findByText("Cached private group")).toBeVisible();
                expect(screen.getByTestId("list-search-input")).toBe(privateInput);
              }
              await visit("events", "Cached scheduled event");
              const scheduledInput = screen.getByTestId("list-search-input");
              for (const [section, name] of [
                ["available", "Cached available event"],
                ["terminated", "Cached terminated event"],
                ["mine", "Cached scheduled event"],
              ]) {
                await tab(section);
                expect(await screen.findByText(name)).toBeVisible();
              }
              expect(screen.getByTestId("list-search-input")).toBe(scheduledInput);
              expect(client.getQueryData(fixture.keys.events)).toBe(fixture.snapshots.events);
              await visit("history", "Cached history table");
              expect(screen.queryByText("Retained history table")).toBeNull();
              await more();
              expect(await screen.findByText("Retained history table")).toBeVisible();
              expect(client.getQueryData(fixture.keys.history)).toBe(fixture.snapshots.history);
              expect(fixture.reads).toEqual([]);
              const firstTable = screen.getByRole("button", {
                name: "Open table: Cached history table",
              });
              await act(() => fixture.refresh("history"));
              expect(
                await screen.findByRole("button", { name: "Open table: Updated history table" }),
              ).toBe(firstTable);
              await visit("events", "Cached scheduled event");
              await act(() => fixture.refresh("events"));
              expect(await screen.findByText("Updated scheduled event")).toBeVisible();
              await visit("groups", "Cached private group");
              await act(() => fixture.refresh("groups"));
              expect(await screen.findByText("Updated private group")).toBeVisible();
              for (let reentry = 0; reentry < 2; reentry++) {
                await visit("events", "Updated scheduled event");
                await visit("history", "Updated history table");
                await visit("groups", "Updated private group");
                expect(screen.queryByText("Retained private group")).toBeNull();
              }
              expect(fixture.reads).toEqual([
                "history:first",
                "history:retained",
                "events:first",
                "events:retained",
                "groups:first",
                "groups:retained",
              ]);
            } else {
              expect(await screen.findByText("Cached activity table")).toBeVisible();
              expect(screen.queryByText("Retained activity table")).toBeNull();
              const list = activityList();
              await scrollNativeListToEnd(list);
              expect(await screen.findByText("Retained activity table")).toBeVisible();
              expect(client.getQueryData(fixture.keys.community)).toBe(fixture.snapshots.community);
              for (let repeat = 0; repeat < 2; repeat++) {
                await tab("market");
                expect(await screen.findByText("Coming soon")).toBeVisible();
                expect(screen.queryByText("Cached activity table")).toBeNull();
                await tab("activity");
                expect(await screen.findByText("Cached activity table")).toBeVisible();
                expect(activityList()).toBe(list);
              }
              expect(fixture.reads).toEqual([]);
              const author = screen.getAllByRole("link", { name: "network-player" })[0];
              await act(() => fixture.refresh("community"));
              expect(await screen.findByText("Updated activity table")).toBeVisible();
              expect(screen.queryByText("Cached activity table")).toBeNull();
              expect(screen.getAllByRole("link", { name: "network-player" })[0]).toBe(author);
              await tab("market");
              await tab("activity");
              expect(await screen.findByText("Updated activity table")).toBeVisible();
              expect(activityList()).toBe(list);
              expect(fixture.reads).toEqual(["community:first", "community:retained"]);
              expect(
                useAppStore.getState().communityViews[JSON.stringify([options.apiUrl, "owner"])]
                  ?.tab,
              ).toBe("activity");
            }
            expect(client.getQueryData(fixture.foreignKey)).toBe(fixture.foreignSnapshot);
            expect(screen.queryByText("Foreign private group")).toBeNull();
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(fixture.unexpected).toEqual([]);
            expect(fetch).toHaveBeenCalledTimes(fixture.reads.length);
            expect(boundary.push).not.toHaveBeenCalled();
          },
        },
      );
      assertRenderMeasurement(result);
    } finally {
      client.clear();
    }
  },
);
