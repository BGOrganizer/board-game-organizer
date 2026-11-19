import type {
  CommunityActivity,
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import type { CommunityApiOptions } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import { createContext, type EffectCallback, type ReactNode, useContext, useEffect } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../../web/src/test-fixtures/eventRecords";

const listBoundary = vi.hoisted(() => ({
  push: vi.fn(),
  apiUrl: "https://main-list-fixtures.test",
  userId: "owner",
}));

export { listBoundary };
export const listApi = "https://main-list-fixtures.test";
const getToken = async () => "fixture-list-token";
const Api = createContext<CommunityApiOptions>({
  apiUrl: listApi,
  userId: "owner",
  getToken,
  enabled: true,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => useContext(Api) }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const api = useContext(Api);
    return {
      isLoaded: true,
      isSignedIn: Boolean(api.userId),
      userId: api.userId ?? null,
      sessionId: api.userId ? `fixture-session:${api.userId}` : null,
      getToken: api.getToken,
    };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: listBoundary.push }),
  useNavigation: () => ({ getState: () => ({ type: "tab" }) }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: EffectCallback) => useEffect(effect, [effect]),
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));

export const listFixture = {
  client: undefined as QueryClient | undefined,
  groups: [] as GroupRecordResponse[],
  events: [] as PlannedEventResponse[],
  tables: [] as PlannedTableResponse[],
  statuses: new Map<string, number>(),
  cursors: new Map<string, string>(),
  nextGroups: [] as GroupRecordResponse[],
  nextEvents: [] as PlannedEventResponse[],
  nextTables: [] as PlannedTableResponse[],
  activities: [] as CommunityActivity[],
  nextActivities: [] as CommunityActivity[],
  pending: new Map<string, Promise<Response>>(),
  reads: [] as URL[],
};
export const listOptions = () => ({ apiUrl: listBoundary.apiUrl, userId: listBoundary.userId });
export const listId = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export function listGroup(
  name = "Private list group",
  change: Partial<GroupRecordResponse> = {},
): GroupRecordResponse {
  return { ...groupRecord, id: listId(1), name, ...change };
}
export function listEvent(
  name = "Scheduled list event",
  change: Partial<PlannedEventResponse> = {},
): PlannedEventResponse {
  return { ...plannedEvent, id: listId(100), name, canManage: true, ...change };
}
export function listTable(
  name = "History list table",
  change: Partial<PlannedTableResponse> = {},
): PlannedTableResponse {
  return {
    ...plannedTable,
    id: listId(200),
    name,
    eventStatus: "TERMINATED",
    canManage: true,
    confirmed: {
      gameId: 1,
      playerIds: ["owner", "other-player"],
      startsAt: "2030-06-03T18:00:00.000Z",
    },
    ...change,
  };
}
export function listActivity(
  context = "First activity table",
  id = listId(300),
): CommunityActivity {
  return {
    id,
    kind: "played",
    outcome: "played",
    occurredAt: new Date().toISOString(),
    context,
    href: `/events/${listId(100)}/tables/${listId(200)}`,
    visibility: "authorized",
    author: {
      id: "network-author",
      name: "Network Player",
      username: "network-player",
      avatarUrl: null,
    },
  };
}
export function listJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const attention = (targets: unknown[]) => ({
  asOf: "2030-01-01T00:00:00.000Z",
  unreadCount: 0,
  summary: {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
  targets: targets.map((target) => ({
    target,
    count: 0,
    direct: 0,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ communityViews: {} });
  listBoundary.apiUrl = listApi;
  listBoundary.userId = "owner";
  listFixture.client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  listFixture.groups = [
    listGroup(),
    listGroup("Public list group", { id: listId(2), type: "PUBLIC" }),
  ];
  listFixture.events = [
    listEvent(),
    listEvent("Available list event", {
      id: listId(101),
      groupId: listId(3),
      groupName: "Available public group",
      groupType: "PUBLIC",
      bookingClosesAt: "2030-06-02T18:00:00.000Z",
      endsAt: "2030-06-03T22:00:00.000Z",
      canManage: false,
      canEdit: false,
      canInvite: false,
      adminUserId: "other",
      role: "viewer",
      myRegistrations: [],
      myDemonstrator: false,
    }),
    listEvent("Terminated list event", { id: listId(102), status: "TERMINATED" }),
  ];
  listFixture.tables = [listTable()];
  listFixture.nextGroups = [];
  listFixture.nextEvents = [];
  listFixture.nextTables = [];
  listFixture.activities = [listActivity()];
  listFixture.nextActivities = [];
  listFixture.statuses.clear();
  listFixture.cursors.clear();
  listFixture.pending.clear();
  listFixture.reads.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (![listApi, "https://other-main-list-fixtures.test"].includes(url.origin))
        throw new Error(`Unexpected fixture origin: ${url.origin}`);
      listFixture.reads.push(url);
      if (url.pathname === "/api/notifications/attention")
        return listJson(attention(JSON.parse(url.searchParams.get("targets") ?? "[]")));
      const status = listFixture.statuses.get(url.pathname) ?? 200;
      if (status !== 200) return listJson({ error: "Fixture list unavailable" }, status);
      const suspended = listFixture.pending.get(url.pathname);
      if (suspended) return suspended;
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const next = url.searchParams.has("cursor");
      if (url.pathname === "/api/community/activities") {
        const activities = next ? listFixture.nextActivities : listFixture.activities;
        return listJson({
          items: activities.filter(
            (row) => !url.searchParams.has("kind") || row.kind === url.searchParams.get("kind"),
          ),
          nextCursor: next ? null : (listFixture.cursors.get(url.pathname) ?? null),
        });
      }
      let rows: (GroupRecordResponse | PlannedEventResponse | PlannedTableResponse)[];
      if (url.pathname === "/api/groups")
        rows = (next ? listFixture.nextGroups : listFixture.groups).filter(
          (row) =>
            (!url.searchParams.has("type") || row.type === url.searchParams.get("type")) &&
            (url.searchParams.get("scope") !== "public" || row.type === "PUBLIC") &&
            (!url.searchParams.has("roles") ||
              url.searchParams.get("roles")?.split(",").includes(row.role)),
        );
      else if (url.pathname === "/api/events") {
        const section = url.searchParams.get("section");
        const statuses = url.searchParams.get("statuses")?.split(",");
        rows = (next ? listFixture.nextEvents : listFixture.events).filter(
          (row) =>
            (!statuses || statuses.includes(row.status)) &&
            (!url.searchParams.has("groupId") || row.groupId === url.searchParams.get("groupId")) &&
            (!section || section === "terminated"
              ? !section || row.status === "TERMINATED"
              : section === "available"
                ? row.canManage === false
                : row.canManage !== false),
        );
      } else if (url.pathname === "/api/tables")
        rows = next ? listFixture.nextTables : listFixture.tables;
      else throw new Error(`Unexpected fixture path: ${url.pathname}`);
      return listJson({
        items: rows.filter((row) => row.name.toLowerCase().includes(query)),
        nextCursor: next ? null : (listFixture.cursors.get(url.pathname) ?? null),
      });
    }),
  );
});
afterEach(() => {
  listFixture.client?.clear();
  useAppStore.setState({ communityViews: {} });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export function MainListFixture({
  children,
  apiUrl = listBoundary.apiUrl,
  userId = listBoundary.userId,
}: {
  children: ReactNode;
  apiUrl?: string;
  userId?: string;
}) {
  if (!listFixture.client) throw new Error("Expected the fixture Query client");
  return (
    <QueryClientProvider client={listFixture.client}>
      <NativeTestProviders>
        <Api value={{ apiUrl, userId, getToken, enabled: true }}>{children}</Api>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
export async function listTab(tab: string) {
  await userEvent.setup().press(screen.getByTestId(`top-tab-${tab}`));
}
export async function listPress(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
/** Public native layout/scroll events; no private VirtualizedList callbacks. */
export async function scrollListEnd(list: ReturnType<typeof screen.getByTestId>, height = 1200) {
  await scrollNativeListToEnd(list, height);
}
