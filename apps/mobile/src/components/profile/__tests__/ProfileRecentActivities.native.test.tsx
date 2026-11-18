import { URL } from "node:url";
import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
import { profileActivitiesQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { ProfileRecentActivities } from "../ProfileRecentActivities";

const sdk = vi.hoisted(() => ({ push: vi.fn() }));
const API = "https://recent-profile-activities-native.test";
const options = {
  apiUrl: API,
  userId: "viewer",
  enabled: true,
  getToken: async () => "fixture-viewer",
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("expo-router", () => ({ useRouter: () => sdk }));
vi.mock("expo-notifications", () => ({}));
const author: ActivityAuthor = {
  id: "subject",
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
};
const activity = (id = "first"): ProfileActivity => ({
  id,
  kind: "event_join",
  occurredAt: "2030-06-01T10:00:00.000Z",
  context: "Spring games",
  eventContext: `Activity ${id}`,
  href: "/events/11111111-1111-4111-8111-111111111111",
  visibility: "authorized",
});
let client: QueryClient;
let items: ProfileActivity[];
let status: number;
let pending: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: string[] = [];
const key = (subject = "subject") =>
  profileActivitiesQuery(options, subject, undefined, 5).queryKey;
beforeEach(() => {
  vi.clearAllMocks();
  items = [activity()];
  status = 200;
  pending = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-viewer");
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes.push(`${method} ${url.pathname}`);
        throw new Error("Activity preview cannot consent to writes");
      }
      expect(url.pathname).toMatch(/^\/api\/profiles\/[^/]+\/activities$/);
      expect(url.searchParams.get("limit")).toBe("5");
      reads.push(url);
      return (
        pending ??
        Response.json(
          status === 200 ? { items, nextCursor: null } : { error: "Activities unavailable" },
          { status },
        )
      );
    }),
  );
});
afterEach(() => {
  expect(writes).toEqual([]);
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  subject = "subject",
  withAuthor = false,
}: {
  subject?: string;
  withAuthor?: boolean;
} = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ProfileRecentActivities userId={subject} author={withAuthor ? author : undefined} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const all = () =>
  userEvent.setup().press(screen.getByRole("button", { name: "View all activities" }));

it("keeps unresolved activity data distinct from a genuine empty preview", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const heading = screen.getByText("Recent activities", { exact: true });
  expect(heading).toBeVisible();
  expect(heading).toHaveProp("accessibilityRole", "header");
  expect(screen.queryByText("No activities yet")).toBeNull();
  expect(screen.queryByText("Could not load activities")).toBeNull();
  await act(() => finish(Response.json({ items: [], nextCursor: null })));
  expect(await screen.findByText("No activities yet")).toBeVisible();
});

it("routes the explicit full-history action using the requested subject even when its preview is empty", async () => {
  items = [];
  await render(<Fixture subject="other-subject" />);
  expect(await screen.findByText("No activities yet")).toBeVisible();
  await all();
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/user/[userId]/activities",
    params: { userId: "other-subject" },
  });
});

it("renders actual activity rows with the supplied author and navigates their authorized source without notification reads", async () => {
  items = [activity(), activity("second")];
  await render(<Fixture withAuthor />);
  expect(await screen.findByText("Activity first")).toBeVisible();
  expect(screen.getByText("Activity second")).toBeVisible();
  expect(screen.getAllByText("subject-player")).toHaveLength(2);
  await fireEvent.press(screen.getAllByText("Spring games")[0]);
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/event/11111111-1111-4111-8111-111111111111");
  expect(reads.every((url) => url.pathname.endsWith("/activities"))).toBe(true);
});

it("preserves an observable read error and retries through the real hook instead of showing a successful empty state", async () => {
  status = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  status = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Activity first")).toBeVisible();
  expect(screen.queryByText("Could not load activities")).toBeNull();
  expect(reads).toHaveLength(2);
});

it("reconciles a fresh cached activity, retains usable data on ordinary failure and hides it after denial", async () => {
  client.setQueryData(key(), { pages: [{ items, nextCursor: null }], pageParams: [""] });
  await render(<Fixture />);
  const first = screen.getByText("Activity first");
  items = [{ ...activity(), eventContext: "Fresh activity" }];
  await act(() =>
    client.setQueryData(key(), { pages: [{ items, nextCursor: null }], pageParams: [""] }),
  );
  expect(await screen.findByText("Fresh activity")).toBe(first);
  status = 503;
  await act(() => client.invalidateQueries({ queryKey: key(), exact: true }));
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.getByText("Fresh activity")).toBeVisible();
  status = 403;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Fresh activity")).toBeNull());
  expect(screen.getByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
});

it("starts a changed subject's preview without displaying the previous subject's cached activity", async () => {
  client.setQueryData(key(), { pages: [{ items, nextCursor: null }], pageParams: [""] });
  const view = await render(<Fixture />);
  expect(screen.getByText("Activity first")).toBeVisible();
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await view.rerender(<Fixture subject="next-subject" />);
  expect(screen.queryByText("Activity first")).toBeNull();
  expect(screen.queryByText("No activities yet")).toBeNull();
  await act(() => finish(Response.json({ items: [activity("next-subject")], nextCursor: null })));
  expect(await screen.findByText("Activity next-subject")).toBeVisible();
  await all();
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/user/[userId]/activities",
    params: { userId: "next-subject" },
  });
});
