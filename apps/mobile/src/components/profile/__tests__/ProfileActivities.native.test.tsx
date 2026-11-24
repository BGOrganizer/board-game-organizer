import { URL } from "node:url";
import type {
  ProfileActivity,
  ProfileActivityPage,
  ProfileView,
} from "@board-game-organizer/schemas";
import { profileActivitiesQuery, profileViewQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UserActivitiesScreen from "@/app/user/[userId]/activities";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";

const Subject = createContext("subject");

const boundary = vi.hoisted(() => ({
  apiUrl: "https://profile-activities-native.test",
  userId: "viewer",
  push: vi.fn(),
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  getToken: async () => `fixture-${boundary.userId}`,
  enabled: true,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ isLoaded: true, user: { unsafeMetadata: { mobileNumber: "+441234567890" } } }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useLocalSearchParams: () => ({ userId: useContext(Subject) }),
}));
// Activity rows use the actual pure notification destination helper, not OS push delivery.
vi.mock("expo-notifications", () => ({}));
let client: QueryClient;
let items: ProfileActivity[];
let nextItems: ProfileActivity[];
let cursor: string | null;
let status: number;
let nextStatus: number;
let pending: Promise<Response> | undefined;
let pendingNext: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
const json = (body: unknown, code = 200) => Response.json(body, { status: code });
const profile = (id = "subject"): ProfileView => ({
  id,
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
  social: { friends: 1, followers: 2, following: 3 },
  player: { gamesPlayed: 3, gamesWon: 1, winRate: 33.3 },
});
function activity(id = "first", patch: Partial<ProfileActivity> = {}): ProfileActivity {
  return {
    id,
    kind: "event_join",
    occurredAt: "2030-06-01T12:00:00.000Z",
    context: "Spring games",
    eventContext: `Activity ${id}`,
    href: "/events/11111111-1111-4111-8111-111111111111",
    visibility: "authorized",
    ...patch,
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.apiUrl = "https://profile-activities-native.test";
  boundary.userId = "viewer";
  items = [activity()];
  nextItems = [activity("second")];
  cursor = null;
  status = nextStatus = 200;
  pending = pendingNext = undefined;
  reads.length = 0;
  useAppStore.getState().clearProfileViews();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(profileViewQuery(options(), "subject").queryKey, profile());
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl || (init?.method ?? "GET") !== "GET")
        throw new Error(`Unexpected profile-activity request ${url.origin}${url.pathname}`);
      reads.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      const match = /^\/api\/profiles\/([^/]+)(\/activities)?$/.exec(url.pathname);
      if (!match) throw new Error(`Unexpected profile-activity path ${url.pathname}`);
      if (!match[2]) return json(profile(match[1]));
      const more = url.searchParams.has("cursor"),
        code = more ? nextStatus : status;
      return (
        (more ? pendingNext : pending) ??
        json(
          code === 200
            ? ({
                items: more ? nextItems : items,
                nextCursor: more ? null : cursor,
              } satisfies ProfileActivityPage)
            : { error: "Fixture activities unavailable" },
          code,
        )
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAppStore.getState().clearProfileViews();
});
function Fixture({ subject = "subject" }: { subject?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Subject value={subject}>
          <UserActivitiesScreen />
        </Subject>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function list() {
  let host = screen.getByRole("combobox", { name: "Activity type" });
  while (host.parent && typeof host.props.onScroll !== "function") host = host.parent;
  if (typeof host.props.onScroll !== "function")
    throw new Error("Expected profile activities native list");
  return host;
}
async function filter(label: string) {
  await positionMeasuredSelect(screen.getByRole("combobox", { name: "Activity type" }));
  // Select callback/state proof: its worklet opacity is not native tappability evidence.
  await fireEvent.press(screen.getByRole("option", { name: label, includeHiddenElements: true }));
}

it("renders authorized activity narratives and routes a selected source without writing or reading notifications", async () => {
  await render(<Fixture />);
  expect(await screen.findByText("Activity first")).toBeVisible();
  expect(screen.getByText("Spring games")).toBeVisible();
  await fireEvent.press(screen.getByText("Spring games"));
  expect(boundary.push).toHaveBeenCalledWith("/event/11111111-1111-4111-8111-111111111111");
  expect(reads[0].authorization).toBe("Bearer fixture-viewer");
  expect(reads.every(({ url }) => !url.pathname.includes("notifications"))).toBe(true);
});

it.each([
  "played",
  "friendship",
  "event_join",
  "table_join",
  "group_join",
  "follower",
  "milestone",
] as const)(
  "renders the real %s activity row without requiring a current source link",
  async (kind) => {
    items = [
      activity(kind, {
        kind,
        context: null,
        href: null,
        milestone: kind === "milestone" ? 10 : undefined,
      }),
    ];
    await render(<Fixture />);
    expect(await screen.findByText(`Activity ${kind}`)).toBeVisible();
    expect(boundary.push).not.toHaveBeenCalled();
    if (kind !== "friendship" && kind !== "follower")
      expect(screen.getByText("Unavailable source")).toBeVisible();
  },
);

it("keeps an initial in-flight activity read distinct from a genuinely empty feed", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No activities yet")).toBeNull();
  await act(() => finish(json({ items: [], nextCursor: null })));
  expect(await screen.findByText("No activities yet")).toBeVisible();
});

it("preserves the observable first-read failure and retries only on the explicit recovery action", async () => {
  status = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  status = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Activity first")).toBeVisible();
});

it("rejects unverified legacy visibility rather than displaying formerly private activity sources", async () => {
  items = [activity("legacy", { visibility: undefined })];
  await render(<Fixture />);
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("Activity legacy")).toBeNull();
});

it("keeps cached activity usable on an ordinary background failure and hides it immediately on denial", async () => {
  await render(<Fixture />);
  await screen.findByText("Activity first");
  const key = profileActivitiesQuery(options(), "subject", undefined, 10).queryKey;
  status = 503;
  await act(() => client.invalidateQueries({ queryKey: key, exact: true }));
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.getByText("Activity first")).toBeVisible();
  status = 404;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Profile unavailable")).toBeVisible();
  expect(screen.queryByText("Activity first")).toBeNull();
});

it("stores scoped activity filters and restores all kinds through the actual Select callback", async () => {
  await render(<Fixture />);
  await screen.findByText("Activity first");
  await filter("New friendship");
  await waitFor(() => expect(reads.at(-1)?.url.searchParams.get("kind")).toBe("friendship"));
  expect(
    useAppStore.getState().profileViews[JSON.stringify([boundary.apiUrl, "viewer", "subject"])]
      ?.activityKind,
  ).toBe("friendship");
  await filter("All activity types");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Activity type" })).toHaveTextContent(
      "All activity types",
    ),
  );
  expect(
    useAppStore.getState().profileViews[JSON.stringify([boundary.apiUrl, "viewer", "subject"])]
      ?.activityKind,
  ).toBe("");
});

it("loads a subsequent page through real native geometry and recovers a failed cursor without losing first-page activity", async () => {
  cursor = "next-activity";
  await render(<Fixture />);
  await screen.findByText("Activity first");
  nextStatus = 503;
  await scrollNativeListToEnd(list());
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.getByText("Activity first")).toBeVisible();
  nextStatus = 200;
  const retries = screen.getAllByRole("button", { name: "Try again" });
  // The footer retries the failed cursor; the separate header retries the feed.
  await userEvent.setup().press(retries[retries.length - 1]);
  expect(await screen.findByText("Activity second")).toBeVisible();
  expect(reads.at(-1)?.url.searchParams.get("cursor")).toBe("next-activity");
});

it("does not reuse the previous subject's cached activities or filter after an API/account change", async () => {
  const view = await render(<Fixture />);
  await screen.findByText("Activity first");
  boundary.userId = "second-viewer";
  boundary.apiUrl = "https://second-profile-activities.test";
  items = [activity("second-owner")];
  await view.rerender(<Fixture subject="another-subject" />);
  expect(screen.queryByText("Activity first")).toBeNull();
  expect(await screen.findByText("Activity second-owner")).toBeVisible();
  expect(reads.at(-1)?.authorization).toBe("Bearer fixture-second-viewer");
});
