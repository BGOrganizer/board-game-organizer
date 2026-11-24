import { URL } from "node:url";
import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  locationFavoriteKey,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  type ContactUser,
  type CreateEventVariables,
  type CreateGroupVariables,
  eventDraftInput,
  eventRecordKeys,
  eventRecordQuery,
  favoriteLocationsQuery,
  groupPeopleQuery,
  groupRecordDetailQuery,
  groupRecordKeys,
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
import EventWizardScreen from "@/app/event/wizard";
import GroupFriendSearchScreen from "@/app/group/search-user";
import GroupWizardScreen from "@/app/group/wizard";
import { eventDraftFixture, wizardVenue } from "@/components/events/__tests__/eventWizardFixtures";
import { EventSectionHeader } from "@/components/events/EventSectionHeader";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

type FriendRoute = { slotId?: string; exclude?: string };
const routeContext = createContext<FriendRoute & { eventId?: string; draftId?: string }>({});
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
          <GroupWizardScreen />
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
        kind === "group" ? (
          <GroupJourney />
        ) : (
          <routeContext.Provider value={{ eventId: event.id }}>
            <EventWizardScreen />
          </routeContext.Provider>
        ),
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
              await press("Increase: Minimum players");
              await press("Choose demonstrator");
              expect(await screen.findByText("Demo Player")).toBeVisible();
              await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
              expect(await screen.findByLabelText("Minimum players: 3")).toBeVisible();
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
              expect(screen.getByLabelText("Minimum players: 3")).toBeVisible();
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
              expect(screen.getByLabelText("Minimum players: 3")).toBeVisible();
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

function rejectedCreation<Variables>(
  client: QueryClient,
  mutationKey: readonly unknown[],
  variables: Variables,
) {
  const error = new CommunityApiError(400, "Fixture creation rejected");
  return client.getMutationCache().build(
    client,
    { mutationKey },
    {
      context: undefined,
      data: undefined,
      error,
      failureCount: 1,
      failureReason: error,
      isPaused: false,
      status: "error",
      variables,
      submittedAt: Date.now(),
    },
  );
}

it.each(["group", "event"] as const)(
  "actual %s wizard recovery: restore the rejected local draft without resubmitting it",
  async (kind) => {
    await installNativePopoverMeasurements();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    const http = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected wizard recovery request ${String(input)}`);
    });
    vi.stubGlobal("fetch", http);
    const draft = eventDraftFixture({
      groupId: null,
      name: "Recovered event draft",
      dates: plannedEvent.dates,
    });
    const validation = eventDraftInput(draft, false);
    if (!validation.success || "version" in validation.data)
      throw new Error("Expected a valid recovery draft");
    const eventCreation: CreateEventVariables = {
      ...validation.data,
      clientRequestId: "88888888-8888-4888-8888-888888888888",
      clientDraft: draft,
    };
    const groupCreation: CreateGroupVariables = {
      type: "PRIVATE",
      name: "Rejected group request",
      invitedUserIds: [friend.id],
      location: wizardVenue,
      clientRequestId: "77777777-7777-4777-8777-777777777777",
      clientDraft: { name: "Recovered group draft", friends: [friend] },
    };
    let draftId: string;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <routeContext.Provider value={{ draftId }}>{children}</routeContext.Provider>
        </NativeTestProviders>
      </QueryClientProvider>
    );
    try {
      const result = await measureRenders(
        kind === "event" ? <EventWizardScreen /> : <GroupWizardScreen />,
        {
          wrapper,
          beforeEach: () => {
            client.clear();
            seed(client);
            client.setQueryData(
              ["favoriteLocations", API, "owner", "status", [locationFavoriteKey(wizardVenue)]],
              [],
            );
            http.mockClear();
            const rejected =
              kind === "event"
                ? rejectedCreation(
                    client,
                    eventRecordKeys.mutation(options, "", "create"),
                    eventCreation,
                  )
                : rejectedCreation(
                    client,
                    groupRecordKeys.mutation(options, "", "create"),
                    groupCreation,
                  );
            draftId = String(rejected.mutationId);
          },
          scenario: async () => {
            if (kind === "group") {
              const name = screen.getByTestId("group-name-input");
              expect(name).toHaveDisplayValue("Recovered group draft");
              expect(screen.getByText(friend.name)).toBeVisible();
              expect(screen.getByText(wizardVenue.name)).toBeVisible();
              await fireEvent.changeText(name, "Revised recovered group");
              expect(screen.getByTestId("group-name-input")).toHaveDisplayValue(
                "Revised recovered group",
              );
              expect(screen.getByRole("button", { name: "Create group" })).toBeEnabled();
            } else {
              expect(screen.getByLabelText("Event name")).toHaveDisplayValue(
                "Recovered event draft",
              );
              for (let step = 0; step < 3; step++) await press("Next");
              expect(screen.getByRole("button", { name: "4. Review" })).toBeSelected();
              expect(screen.getByText("Recovered event draft")).toBeVisible();
              expect(screen.getByText("Table list")).toBeVisible();
              await pressMeasuredPopover(
                screen.getByRole("button", { name: "Board games: Table #1" }),
              );
              expect(screen.getByRole("heading", { name: "Board games" })).toBeVisible();
              expect(screen.getByText("First strategy game")).toBeVisible();
            }
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(http).not.toHaveBeenCalled();
          },
        },
      );
      assertRenderMeasurement(result);
    } finally {
      client.clear();
    }
  },
);

it("Event planning settings: explain assisted BGG preferences in the actual section guide", async () => {
  await installNativePopoverMeasurements();
  const result = await measureRenders(
    <EventSectionHeader
      section="details"
      event={{
        ...plannedEvent,
        planningMode: "ASSISTED",
        playerPreference: "BEST",
        allowBestReduction: true,
      }}
    />,
    {
      wrapper: NativeTestProviders,
      scenario: async () => {
        expect(screen.queryByText(/Prefers the player count marked Best on BGG/)).toBeNull();
        await pressMeasuredPopover(screen.getByRole("button", { name: "Event details help" }));
        expect(
          screen.getByText(/BGG Best: Prefers the player count marked Best on BGG/),
        ).toBeVisible();
        expect(
          screen.getByText(
            "Assisted planning may seat fewer players to improve the BGG recommendation.",
          ),
        ).toBeVisible();
      },
    },
  );
  assertRenderMeasurement(result);
});
