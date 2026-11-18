import { URL } from "node:url";
import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  locationFavoriteKey,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  type ContactUser,
  eventRecordQuery,
  favoriteLocationsQuery,
  groupPeopleQuery,
  groupRecordDetailQuery,
  groupRecordsPageQuery,
  recordTablesQuery,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { DeviceEventEmitter, View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import GroupFriendSearchScreen from "@/app/group/search-user";
import { EventWizard } from "@/components/events/EventWizard";
import { GroupWizard } from "@/components/groups/GroupWizard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

type FriendRoute = { slotId?: string; exclude?: string };
const routeContext = createContext<FriendRoute>({});
const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  getToken: vi.fn(async () => "fixture-owner"),
  picker: { open: vi.fn(), dismiss: vi.fn() },
}));
const API = "https://wizard-performance-fixtures.test";
const options = { apiUrl: API, userId: "owner", enabled: true, getToken: boundary.getToken };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "wizard-performance-owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => useContext(routeContext),
  Stack: {
    Screen: ({
      options: config,
    }: {
      options: {
        headerLeft?: (props: { canGoBack: boolean }) => ReactNode;
        headerRight?: () => ReactNode;
      };
    }) => (
      <View>
        {config.headerLeft?.({ canGoBack: true })}
        {config.headerRight?.()}
      </View>
    ),
  },
}));
vi.mock("expo-router/react-navigation", async (original) => ({
  ...(await original<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: () => {},
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://wizard-performance-fixtures.test" } } },
}));
vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
vi.mock("@maplibre/maplibre-react-native", () => {
  const unavailable = () => {
    throw new Error("These wizard scenarios do not mount a native GPU map");
  };
  return { Map: unavailable, Camera: unavailable, GeoJSONSource: unavailable, Layer: unavailable };
});
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));

const friend: ContactUser = {
  id: "friend-one",
  name: "Friend One",
  username: "friend-one",
  email: null,
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
};
const publicGroup: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  logo: "https://fixture.invalid/owned-public-logo.png",
  logoAssetId: "99999999-9999-4999-8999-999999999999",
  location: plannedEvent.locations[0],
  approved: {
    ...groupRecord.approved,
    name: groupRecord.approved?.name ?? groupRecord.name,
    location: plannedEvent.locations[0],
  },
};
const event: PlannedEventResponse = {
  ...plannedEvent,
  groupId: publicGroup.id,
  groupName: publicGroup.name,
  groupType: "PUBLIC",
  endsAt: "2030-06-03T21:00:00.000Z",
  bookingClosesAt: "2030-06-02T18:00:00.000Z",
};
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: publicGroup.id,
  groupName: publicGroup.name,
  groupType: "PUBLIC",
  startsAt: "2030-06-03T18:00:00.000Z",
};
const demonstrator: GroupPersonResponse = {
  userId: "demo-one",
  name: "Demo Player",
  username: "demo-one",
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: "66666666-6666-4666-8666-666666666666",
    groupId: publicGroup.id,
    userId: "demo-one",
    kind: "REQUEST",
    status: "ACCEPTED",
    version: 1,
    createdAt: publicGroup.createdAt,
    updatedAt: publicGroup.updatedAt,
  },
};
const page = <T,>(items: T[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });

/** SDK stack fixture retains the real form and presents the real friend route. */
function GroupJourney() {
  const [route, setRoute] = useState<FriendRoute | null>(null);
  useEffect(() => {
    boundary.push.mockImplementation((next: { pathname: string; params: FriendRoute }) => {
      expect(next.pathname).toBe("/group/search-user");
      setRoute(next.params);
    });
    boundary.back.mockImplementation(() => setRoute(null));
    return () => {
      boundary.push.mockReset();
      boundary.back.mockReset();
    };
  }, []);
  return (
    <routeContext.Provider value={route ?? {}}>
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1, display: route ? "none" : "flex" }}
          accessibilityElementsHidden={Boolean(route)}
          importantForAccessibility={route ? "no-hide-descendants" : "auto"}
        >
          <GroupWizard />
        </View>
        {route ? <GroupFriendSearchScreen /> : null}
      </View>
    </routeContext.Provider>
  );
}
const press = async (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));
function seed(client: QueryClient) {
  client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
  client.setQueryData(recordTablesQuery(options, event.id).queryKey, page([table]));
  client.setQueryData(groupRecordDetailQuery(options, publicGroup.id).queryKey, publicGroup);
  client.setQueryData(
    groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey,
    page([publicGroup]),
  );
  client.setQueryData(
    groupPeopleQuery(options, publicGroup.id, "accepted").queryKey,
    page([demonstrator]),
  );
  client.setQueryData(favoriteLocationsQuery(options).queryKey, page([]));
  for (const keys of [[], [locationFavoriteKey(plannedEvent.locations[0])]])
    client.setQueryData(["favoriteLocations", API, "owner", "status", keys], []);
  client.setQueryData(relationshipListKey(API, "owner", "friends"), {
    pages: [
      { rows: [{ fromUserId: "owner", toUserId: friend.id, profile: friend }], nextCursor: null },
    ],
    pageParams: [""],
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["group", "event"] as const)(
  "actual %s wizard: real picker round trips preserve unsaved drafts without writes",
  async (kind) => {
    const originalStore = useAppStore.getState();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    const reads: string[] = [];
    const writes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.origin !== API) throw new Error(`Unexpected wizard fixture origin ${url.origin}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
        const method = init?.method ?? "GET";
        if (method !== "GET") writes.push(`${method} ${url.pathname}`);
        else reads.push(url.pathname);
        throw new Error(
          `Wizard data must come from the seeded canonical cache: ${method} ${url.pathname}`,
        );
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
    try {
      const result = await measureRenders(
        kind === "group" ? <GroupJourney /> : <EventWizard eventId={event.id} />,
        {
          wrapper,
          beforeEach: () => {
            client.clear();
            vi.clearAllMocks();
            reads.length = writes.length = 0;
            useAppStore.getState().clearPending();
            seed(client);
          },
          afterEach: () => {
            useAppStore.setState(originalStore, true);
          },
          scenario: async () => {
            if (kind === "group") {
              expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
              await press("Create group");
              expect(screen.getByText("Choose a name, from 5 to 30 characters.")).toBeVisible();
              expect(writes).toEqual([]);
              const input = screen.getByTestId("group-name-input");
              await fireEvent.changeText(input, "Unsaved private group");
              await press("Add friend");
              expect(await screen.findByText("Friend One")).toBeVisible();
              expect(screen.getByPlaceholderText("Search friends")).toBeVisible();
              // Native Back is the external navigator's cancellation boundary.
              await act(() => boundary.back());
              expect(screen.getByTestId("group-name-input")).toBe(input);
              expect(input).toHaveDisplayValue("Unsaved private group");
              expect(screen.queryByText("Friend One")).toBeNull();
              expect(useAppStore.getState().pendingUser).toBeNull();
              await press("Add friend");
              await screen.findByText("Friend One");
              await userEvent
                .setup()
                .press(screen.getAllByRole("button", { name: "Select user: Friend One" })[0]);
              expect(await screen.findByText("Friend One")).toBeVisible();
              expect(screen.getByText("@friend-one")).toBeVisible();
              expect(screen.getByTestId("group-name-input")).toBe(input);
              expect(input).toHaveDisplayValue("Unsaved private group");
              expect(
                screen.getByRole("button", { name: "Remove invite: Friend One" }),
              ).toBeEnabled();
              expect(useAppStore.getState().pendingUser).toBeNull();
              expect(boundary.back).toHaveBeenCalledTimes(2);
            } else {
              expect(await screen.findByLabelText("Event name")).toHaveDisplayValue(event.name);
              await fireEvent.changeText(screen.getByLabelText("Event name"), "Unsaved event name");
              await press("Next");
              await press("Next");
              await userEvent
                .setup()
                .press(await screen.findByTestId(`event-draft-table-${table.id}`));
              await fireEvent.changeText(screen.getByLabelText("Table name"), "Unsaved table name");
              await press("Choose demonstrator");
              expect(await screen.findByText("Demo Player")).toBeVisible();
              await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
              expect(await screen.findByLabelText("Table name")).toHaveDisplayValue(
                "Unsaved table name",
              );
              await press("Choose demonstrator");
              await userEvent
                .setup()
                .press(await screen.findByRole("button", { name: "Select user: Demo Player" }));
              expect(await screen.findByText("Demo Player")).toBeVisible();
              expect(screen.getByRole("button", { name: "Remove demonstrator" })).toBeEnabled();
              await press("1. Event");
              expect(screen.getByLabelText("Event name")).toHaveDisplayValue("Unsaved event name");
              await press("Next");
              await press("Next");
              expect(screen.getByLabelText("Table name")).toHaveDisplayValue("Unsaved table name");
              expect(screen.getByText("Demo Player")).toBeVisible();
              await act(() =>
                client.setQueryData(eventRecordQuery(options, event.id).queryKey, {
                  ...event,
                  version: 2,
                  name: "Authoritative event name",
                }),
              );
              expect(
                await screen.findByText(
                  "This event changed. Go back and reopen the editor before saving.",
                ),
              ).toBeVisible();
              expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
              await press("Next");
              expect(screen.getByLabelText("Table name")).toHaveDisplayValue("Unsaved table name");
              expect(screen.getByText("Demo Player")).toBeVisible();
              expect(boundary.back).not.toHaveBeenCalled();
            }
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(reads).toEqual([]);
            expect(writes).toEqual([]);
            expect(boundary.dismissTo).not.toHaveBeenCalled();
            expect(boundary.picker.open).not.toHaveBeenCalled();
          },
        },
      );
      assertRenderMeasurement(result);
    } finally {
      client.clear();
      useAppStore.setState(originalStore, true);
    }
  },
);
