import type {
  BggCollectionItem,
  BggCollectionResponse,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import {
  bggCollectionQuery,
  type ContactUser,
  contactSuggestionsKey,
  notificationAttentionQuery,
  type RelationshipListType,
  type RelationshipRow,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { Contacts } from "@/components/contacts/Contacts";
import { ProfileCollection } from "@/components/profile/ProfileCollection";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sdk = vi.hoisted(() => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://collection-contacts-render.test";
  return { previousApiUrl, getToken: vi.fn(async () => "cached-render-token") };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "viewer", isLoaded: true, isSignedIn: true, getToken: sdk.getToken }),
}));
// Only the Clerk/environment and browser/HTTP boundaries are controlled.
// Components, HeroUI, Query factories/hooks, feedback and journal stay real.
const API = "https://collection-contacts-render.test";
const options = { apiUrl: API, userId: "viewer", enabled: true, getToken: sdk.getToken };
const snapshotId = "published-collection";
const counts = { withoutExpansions: 3, withExpansions: 4, wishlist: 0 };
const collectionGame = (id: number): BggCollectionItem => ({
  id,
  name: `Collection game ${id}`,
  imageUrl: null,
  year: 2020,
  source: "collection",
  isExpansion: id === 2,
  wishlist: false,
  userRating: id === 1 ? 8.5 : null,
});
const collectionPage = (
  items: BggCollectionItem[],
  nextCursor: string | null = null,
): BggCollectionResponse => ({ snapshot: snapshotId, counts, items, nextCursor });
const collectionPages = {
  pages: [
    collectionPage([collectionGame(1), collectionGame(2)], "retained-next"),
    collectionPage([collectionGame(3), collectionGame(4)]),
  ],
  pageParams: ["", "retained-next"],
};
const gamesPages = {
  pages: [collectionPage([collectionGame(1), collectionGame(3), collectionGame(4)])],
  pageParams: [""],
};
const collectionKey = (types: "all" | "games" = "all", userId = "viewer") =>
  bggCollectionQuery({
    ...options,
    userId,
    snapshot: snapshotId,
    query: "",
    types,
    wishlist: false,
  }).queryKey;
const foreignCollection = {
  pages: [collectionPage([{ ...collectionGame(99), name: "Other account private game" }])],
  pageParams: [""],
};

const person = (id: string, name: string, friend = false): ContactUser => ({
  id,
  name,
  username: `handle-${id}`,
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-12T10:00:00.000Z" },
  isFriend: friend,
  isFollowing: friend,
  isFollower: friend,
  blockedByMe: false,
  blockedMe: false,
});
const friends = Array.from({ length: 6 }, (_, index) =>
  person(`friend-${index + 1}`, `Cached friend ${index + 1}`, true),
);
const incoming = person("incoming", "Incoming player");
const suggestion = person("suggested", "Suggested player");
const rows = (people: ContactUser[], received = false): RelationshipRow[] =>
  people.map((profile) => ({
    fromUserId: received ? profile.id : "viewer",
    toUserId: received ? "viewer" : profile.id,
    profile,
  }));
const friendPages = { pages: [{ rows: rows(friends), nextCursor: null }], pageParams: [""] };
const pendingPages = {
  pages: [{ rows: rows([incoming], true), nextCursor: null }],
  pageParams: [""],
};
const suggestionPages = {
  pages: [{ users: [suggestion], hasContacts: true, nextCursor: null }],
  pageParams: [""],
};
const foreignFriends = {
  pages: [
    { rows: rows([person("foreign", "Other account private friend", true)]), nextCursor: null },
  ],
  pageParams: [""],
};
const attentionTargets: NotificationAttentionTarget[] = [
  ...(["connections", "requests", "search"] as const).map(
    (id): NotificationAttentionTarget => ({ kind: "contacts", id }),
  ),
  ...[...friends, incoming, suggestion].map(
    (user): NotificationAttentionTarget => ({ kind: "contact", id: user.id }),
  ),
];
// Pending friend decisions are separate from information reads. Their notices
// may already be read, so this cached render scenario has zero attention and
// preserves the actual pending request while navigating the section tabs.
const attention: NotificationAttentionSnapshot = {
  asOf: "2030-06-12T10:00:00.000Z",
  unreadCount: 0,
  summary: {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
  targets: attentionTargets.map((target) => ({
    target,
    count: 0,
    direct: 0,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  })),
};
const attentionKey = notificationAttentionQuery(options, attentionTargets).queryKey;
let activeClient: QueryClient | undefined;
let intersections: ReturnType<typeof installBrowserIntersections> | undefined;
const presenceWrites: string[] = [];
const forbiddenRequests: string[] = [];
function currentClient() {
  if (!activeClient) throw new Error("Expected the current measured Query owner");
  return activeClient;
}
function currentVisibility() {
  if (!intersections) throw new Error("Expected the browser visibility boundary");
  return intersections;
}
function renderCached(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  activeClient = client;
  presenceWrites.length = forbiddenRequests.length = 0;
  intersections = installBrowserIntersections();
  client.setQueryData(collectionKey(), collectionPages);
  client.setQueryData(collectionKey("games"), gamesPages);
  client.setQueryData(collectionKey("all", "different-owner"), foreignCollection);
  const kinds: RelationshipListType[] = [
    "friends",
    "following",
    "followers",
    "pending",
    "sent",
    "blocked",
  ];
  for (const kind of kinds)
    client.setQueryData(
      relationshipListKey(API, "viewer", kind),
      kind === "friends"
        ? friendPages
        : kind === "pending"
          ? pendingPages
          : { pages: [{ rows: [], nextCursor: null }], pageParams: [""] },
    );
  client.setQueryData(relationshipListKey(API, "different-owner", "friends"), foreignFriends);
  client.setQueryData(contactSuggestionsKey(API, "viewer"), suggestionPages);
  client.setQueryData(attentionKey, attention);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer cached-render-token");
      // Contacts deliberately sends a background heartbeat on authenticated entry.
      // Preserve that production behavior, separately from relationship/notice writes.
      if (url.pathname === "/api/users/presence" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ status: "online" });
        presenceWrites.push(url.pathname);
        return Response.json({ success: true, lastActiveAt: "2030-06-12T10:00:00.000Z" });
      }
      forbiddenRequests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      throw new Error(`Unexpected I/O during cached measurement: ${forbiddenRequests.at(-1)}`);
    }),
  );
  return renderWithI18n(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function cleanupCached() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
  intersections = undefined;
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
  if (sdk.previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.previousApiUrl;
});

const collectionScenario =
  "ProfileCollection: cached page reveal, filter reentry and authoritative row update";
test(collectionScenario, async () => {
  const result = await measureRenders(<ProfileCollection snapshot={snapshotId} />, {
    scenario: async () => {
      const client = currentClient();
      expect(
        await screen.findByRole("option", { name: /^Collection game 1(?:\s|$)/ }),
      ).toBeVisible();
      expect(screen.queryByRole("option", { name: /^Collection game 3(?:\s|$)/ })).toBeNull();
      await waitFor(() => expect(currentVisibility().observedTargetCount).toBeGreaterThan(0));
      act(() => {
        currentVisibility().intersect();
        currentVisibility().intersect();
      });
      expect(
        await screen.findByRole("option", { name: /^Collection game 3(?:\s|$)/ }),
      ).toBeVisible();
      expect(client.getQueryData(collectionKey())).toBe(collectionPages);
      fireEvent.click(screen.getByRole("button", { name: "Expansions" }));
      expect(screen.getByRole("button", { name: "Expansions" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(
        await screen.findByRole("option", { name: /^Collection game 3(?:\s|$)/ }),
      ).toBeVisible();
      expect(screen.queryByRole("option", { name: /^Collection game 2(?:\s|$)/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Expansions" }));
      expect(
        await screen.findByRole("option", { name: /^Collection game 2(?:\s|$)/ }),
      ).toBeVisible();
      expect(screen.queryByRole("option", { name: /^Collection game 3(?:\s|$)/ })).toBeNull();
      const fresh = {
        ...collectionPages,
        pages: [
          {
            ...collectionPages.pages[0],
            items: [{ ...collectionGame(1), name: "Fresh collection title" }, collectionGame(2)],
          },
          collectionPages.pages[1],
        ],
      };
      act(() => client.setQueryData(collectionKey(), fresh));
      expect(
        await screen.findByRole("option", { name: /^Fresh collection title(?:\s|$)/ }),
      ).toBeVisible();
      expect(screen.queryByRole("option", { name: /^Collection game 1(?:\s|$)/ })).toBeNull();
      expect(client.getQueryData(collectionKey("games"))).toBe(gamesPages);
      expect(client.getQueryData(collectionKey("all", "different-owner"))).toBe(foreignCollection);
      expect(screen.queryByText("Other account private game")).toBeNull();
      expect(forbiddenRequests).toEqual([]);
      expect(presenceWrites).toEqual([]);
    },
  });
  // Names stay unregistered until two actual runs establish observed commit caps.
  // Reassure writes all samples before this strict missing-budget gate executes.
  assertRenderMeasurement(result, collectionScenario);
});

const contactsScenario =
  "Contacts: cached top-tab reentry and authoritative friend update preserve pending decisions";
test(contactsScenario, async () => {
  const result = await measureRenders(<Contacts />, {
    scenario: async () => {
      const client = currentClient();
      expect(await screen.findByText("Cached friend 1")).toBeVisible();
      const friend = screen.getByText("Cached friend 1").closest("li");
      if (!friend) throw new Error("Expected the actual grouped friend row");
      expect(within(friend).queryByRole("img", { name: "Unread updates" })).toBeNull();
      for (let visit = 0; visit < 2; visit++) {
        fireEvent.click(screen.getByRole("tab", { name: /^Requests(?:\s|$)/ }));
        expect(await screen.findByText("Incoming player")).toBeVisible();
        fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));
        expect(await screen.findByText("Suggested player")).toBeVisible();
        fireEvent.click(screen.getByRole("tab", { name: /^Connections(?:\s|$)/ }));
        expect(await screen.findByText("Cached friend 1")).toBeVisible();
      }
      expect(client.getQueryData(relationshipListKey(API, "viewer", "friends"))).toBe(friendPages);
      const updated = {
        ...friendPages,
        pages: [
          {
            ...friendPages.pages[0],
            rows: rows([{ ...friends[0], name: "Fresh friend name" }, ...friends.slice(1)]),
          },
        ],
      };
      act(() => client.setQueryData(relationshipListKey(API, "viewer", "friends"), updated));
      const name = await screen.findByText("Fresh friend name");
      expect(name).toBeVisible();
      expect(screen.queryByText("Cached friend 1")).toBeNull();
      const freshRow = name.closest("li");
      if (!freshRow) throw new Error("Expected the updated grouped friend row");
      expect(within(freshRow).queryByRole("img", { name: "Unread updates" })).toBeNull();
      expect(client.getQueryData(attentionKey)).toBe(attention);
      expect(client.getQueryData(relationshipListKey(API, "viewer", "pending"))).toBe(pendingPages);
      fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
      expect(await screen.findByText("Incoming player")).toBeVisible();
      expect(client.getQueryData(relationshipListKey(API, "viewer", "pending"))).toBe(pendingPages);
      expect(client.getQueryData(relationshipListKey(API, "different-owner", "friends"))).toBe(
        foreignFriends,
      );
      expect(screen.queryByText("Other account private friend")).toBeNull();
      await waitFor(() => expect(presenceWrites).toHaveLength(1));
      expect(forbiddenRequests).toEqual([]);
    },
  });
  assertRenderMeasurement(result, contactsScenario);
});
