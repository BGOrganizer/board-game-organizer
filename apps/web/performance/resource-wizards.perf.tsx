import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  locationFavoriteKey,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  type ContactUser,
  eventRecordKeys,
  favoriteLocationsQuery,
  groupPeopleQuery,
  groupRecordKeys,
  groupRecordsPageQuery,
  recordTablesQuery,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import EditEventPage from "@/app/(tabs)/events/[eventId]/edit/page";
import NewEventPage from "@/app/(tabs)/events/new/page";
import EditGroupPage from "@/app/(tabs)/groups/[groupId]/edit/page";
import NewGroupPage from "@/app/(tabs)/groups/new/page";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sdk = vi.hoisted(() => {
  const original = {
    api: process.env.NEXT_PUBLIC_API_URL,
    map: process.env.NEXT_PUBLIC_MAPTILER_API_KEY,
  };
  process.env.NEXT_PUBLIC_API_URL = "https://resource-wizard-render.test";
  process.env.NEXT_PUBLIC_MAPTILER_API_KEY = "public-fixture-map-key";
  return {
    original,
    getToken: vi.fn(async () => "cached-wizard-token"),
    back: vi.fn(),
    replace: vi.fn(),
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "owner", isLoaded: true, isSignedIn: true, getToken: sdk.getToken }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: sdk.back, replace: sdk.replace }) }));
// WebGL is an external renderer. The map picker is not opened by these scenarios;
// its app code remains real, with no fake wizard, draft, query or controls.
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    remove() {}
    setStyle() {}
    flyTo() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
const API = "https://resource-wizard-render.test";
const options = { apiUrl: API, userId: "owner", enabled: true, getToken: sdk.getToken };
const publicGroup: GroupRecordResponse = {
  ...groupRecord,
  id: "44444444-4444-4444-8444-444444444444",
  name: "Approved public group",
  type: "PUBLIC",
  approved: { name: "Approved public group", location: plannedEvent.locations[0] },
};
const event: PlannedEventResponse = {
  ...plannedEvent,
  groupId: publicGroup.id,
  groupType: "PUBLIC",
  groupName: publicGroup.name,
  visibility: "PUBLIC",
  endsAt: "2030-06-03T20:00:00.000Z",
  bookingClosesAt: "2030-06-02T18:00:00.000Z",
};
const table: PlannedTableResponse = {
  ...plannedTable,
  startsAt: "2030-06-03T18:00:00.000Z",
  groupId: publicGroup.id,
  groupType: "PUBLIC",
};
const friend: ContactUser = {
  id: "user_friend",
  name: "Known Friend",
  username: "friend-player",
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
};
const guide: GroupPersonResponse = {
  userId: "user_guide",
  name: "Guide Player",
  username: "guide-player",
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: "55555555-5555-4555-8555-555555555555",
    groupId: publicGroup.id,
    userId: "user_guide",
    kind: "INVITATION",
    status: "ACCEPTED",
    role: "MEMBER",
    version: 1,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  },
};
const friendPages = {
  pages: [
    { rows: [{ fromUserId: "owner", toUserId: friend.id, profile: friend }], nextCursor: null },
  ],
  pageParams: [""],
};
const tables = { pages: [{ items: [table], nextCursor: null }], pageParams: [""] };
const guidePages = { pages: [{ items: [guide], nextCursor: null }], pageParams: [""] };
const foreignGroup = { ...groupRecord, name: "Other account private group" };
const foreignOptions = { ...options, userId: "different-owner" };
let activeClient: QueryClient | undefined;
const requests: string[] = [];
function currentClient() {
  if (!activeClient) throw new Error("Expected current wizard Query owner");
  return activeClient;
}
function renderCached(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  activeClient = client;
  requests.length = 0;
  sdk.back.mockClear();
  sdk.replace.mockClear();
  sdk.getToken.mockClear();
  installBrowserIntersections();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  client.setQueryData(groupRecordKeys.detail(options, publicGroup.id), publicGroup);
  client.setQueryData(groupRecordKeys.detail(foreignOptions, groupRecord.id), foreignGroup);
  client.setQueryData(groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey, {
    pages: [{ items: [groupRecord, publicGroup], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(recordTablesQuery(options, event.id).queryKey, tables);
  client.setQueryData(groupPeopleQuery(options, publicGroup.id, "accepted").queryKey, guidePages);
  client.setQueryData(relationshipListKey(API, "owner", "friends"), friendPages);
  client.setQueryData(favoriteLocationsQuery(options).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(["favoriteLocations", API, "owner", "status", []], []);
  client.setQueryData(
    ["favoriteLocations", API, "owner", "status", [locationFavoriteKey(event.locations[0])]],
    [],
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      throw new Error(`Unexpected I/O during cached wizard measurement: ${requests.at(-1)}`);
    }),
  );
  return renderWithI18n(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function cleanupCached() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
}
configure({
  testingLibrary: { render: renderCached, cleanup: cleanupCached },
  runs: 10,
  warmupRuns: 1,
});
afterEach(() => {
  cleanupCached();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (sdk.original.api === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.original.api;
  if (sdk.original.map === undefined) delete process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  else process.env.NEXT_PUBLIC_MAPTILER_API_KEY = sdk.original.map;
});
function assertNoSideEffects() {
  expect(requests).toEqual([]);
  expect(sdk.getToken).not.toHaveBeenCalled();
  expect(sdk.back).not.toHaveBeenCalled();
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(currentClient().getQueryData(groupRecordKeys.detail(foreignOptions, groupRecord.id))).toBe(
    foreignGroup,
  );
  expect(screen.queryByText(foreignGroup.name)).toBeNull();
}

const createGroupScenario =
  "GroupWizard: invalid draft recovery and cached friend picker round trip";
test(createGroupScenario, async () => {
  const result = await measureRenders(await NewGroupPage({ searchParams: Promise.resolve({}) }), {
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create group" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Choose a name, from 5 to 30 characters.",
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
        target: { value: "Unsubmitted club" },
      });
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
      expect(
        await screen.findByRole("button", { name: "Select user: Known Friend" }),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Unsubmitted club");
      fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
      fireEvent.click(await screen.findByRole("button", { name: "Select user: Known Friend" }));
      expect(screen.getByText("@friend-player")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
      expect(screen.queryByRole("button", { name: "Select user: Known Friend" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove invite: Known Friend" }));
      expect(screen.queryByText("@friend-player")).toBeNull();
      expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Unsubmitted club");
      expect(currentClient().getQueryData(relationshipListKey(API, "owner", "friends"))).toBe(
        friendPages,
      );
      assertNoSideEffects();
    },
  });
  assertRenderMeasurement(result, createGroupScenario);
});

const editGroupScenario = "GroupWizard: cached authoritative version conflict retains unsaved name";
test(editGroupScenario, async () => {
  const result = await measureRenders(
    await EditGroupPage({ params: Promise.resolve({ groupId: groupRecord.id }) }),
    {
      scenario: async () => {
        const input = screen.getByRole("textbox", { name: "Group name" });
        expect(input).toHaveValue(groupRecord.name);
        fireEvent.change(input, { target: { value: "Unsubmitted edited club" } });
        const fresh: GroupRecordResponse = {
          ...groupRecord,
          name: "Server renamed group",
          version: 2,
        };
        act(() =>
          currentClient().setQueryData(groupRecordKeys.detail(options, groupRecord.id), fresh),
        );
        expect(
          await screen.findByText(
            "This group changed. Go back and reopen the editor before saving.",
          ),
        ).toBeVisible();
        expect(screen.getByRole("textbox", { name: "Group name" })).toBe(input);
        expect(input).toHaveValue("Unsubmitted edited club");
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        expect(
          currentClient().getQueryData(groupRecordKeys.detail(options, groupRecord.id)),
        ).toEqual(fresh);
        assertNoSideEffects();
      },
    },
  );
  assertRenderMeasurement(result, editGroupScenario);
});

const editEventScenario =
  "EventWizard: cached step and demonstrator picker reentry retain unsaved table draft";
test(editEventScenario, async () => {
  const result = await measureRenders(
    await EditEventPage({ params: Promise.resolve({ eventId: event.id }) }),
    {
      scenario: async () => {
        await screen.findByRole("textbox", { name: "Event name" });
        fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
          target: { value: "Unsubmitted event name" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        await screen.findByRole("group", { name: /^Date and time/ });
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        const trigger = await screen.findByRole("button", { name: "Table #1" });
        if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
        fireEvent.click(screen.getByRole("button", { name: "Increase Maximum players" }));
        fireEvent.click(screen.getByRole("button", { name: "Choose demonstrator" }));
        expect(
          await screen.findByRole("button", { name: "Select user: Guide Player" }),
        ).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByRole("button", { name: "Table #1" })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        fireEvent.click(screen.getByRole("button", { name: "Choose demonstrator" }));
        fireEvent.click(await screen.findByRole("button", { name: "Select user: Guide Player" }));
        expect(screen.getByText("Guide Player")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "1. Event" }));
        expect(screen.getByRole("textbox", { name: "Event name" })).toHaveValue(
          "Unsubmitted event name",
        );
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        const retained = await screen.findByRole("button", { name: "Table #1" });
        if (retained.getAttribute("aria-expanded") !== "true") fireEvent.click(retained);
        expect(screen.getByRole("button", { name: "Table #1" })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        expect(screen.getByText("Guide Player")).toBeVisible();
        expect(currentClient().getQueryData(recordTablesQuery(options, event.id).queryKey)).toBe(
          tables,
        );
        expect(
          currentClient().getQueryData(
            groupPeopleQuery(options, publicGroup.id, "accepted").queryKey,
          ),
        ).toBe(guidePages);
        assertNoSideEffects();
      },
    },
  );
  // Unknown scenario budgets deliberately remain unregistered until two observed runs.
  assertRenderMeasurement(result, editEventScenario);
});

const newEventScenario = "New event route: switch the draft group without losing the event name";
test(newEventScenario, async () => {
  const result = await measureRenders(await NewEventPage({ searchParams: Promise.resolve({}) }), {
    scenario: async () => {
      const name = screen.getByRole("textbox", { name: "Event name" });
      fireEvent.change(name, { target: { value: "Unsaved event draft" } });
      fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
      fireEvent.click(await screen.findByRole("option", { name: /Friday group/ }));
      expect(name).toHaveValue("Unsaved event draft");
      fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
      fireEvent.click(await screen.findByRole("option", { name: "No group" }));
      expect(name).toHaveValue("Unsaved event draft");
      assertNoSideEffects();
    },
  });
  assertRenderMeasurement(result, newEventScenario);
});

const missingDraftCases = [
  {
    name: "EventWizard: reject an unknown draft and preserve the Back action",
    page: NewEventPage,
  },
  {
    name: "GroupWizard: reject an unknown draft and preserve the Back action",
    page: NewGroupPage,
  },
];
for (const { name, page } of missingDraftCases) {
  test(name, async () => {
    const result = await measureRenders(
      await page({ searchParams: Promise.resolve({ draftId: "absent-private-draft" }) }),
      {
        scenario: async () => {
          expect(screen.getByRole("alert")).toHaveTextContent("Could not recover draft");
          expect(screen.queryByRole("textbox")).toBeNull();
          fireEvent.click(screen.getByRole("button", { name: "Back" }));
          expect(sdk.back).toHaveBeenCalledOnce();
          expect(sdk.replace).not.toHaveBeenCalled();
          expect(requests).toEqual([]);
        },
      },
    );
    assertRenderMeasurement(result, name);
  });
}
