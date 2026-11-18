import { URL } from "node:url";
import type {
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { CommunityApiError, groupRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { GroupReview } from "../GroupReview";

const sdk = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  token: "initial-review-token",
  getToken: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const API = "https://native-group-review.test";
const options = {
  apiUrl: API,
  userId: "reviewer",
  enabled: true,
  getToken: sdk.getToken,
  feedback: sdk.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "reviewer",
    sessionId: "review-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: sdk.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: sdk.dismissTo }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
}));

const pendingGroup: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  role: "none",
  approved: undefined,
  proposal: { name: "Proposed public club" },
  name: "Proposed public club",
  reviewStatus: "PENDING",
  canInvite: false,
  canEdit: false,
  version: 4,
};
let client: QueryClient;
let group: GroupRecordResponse;
let readStatus: number;
let writeStatus: number;
let pendingRead: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
const reads: string[] = [];
const writes: { path: string; method: string; body: unknown; authorization: string | null }[] = [];
const reviewKey = () => groupRecordKeys.detail(options, pendingGroup.id, true);

beforeEach(() => {
  vi.clearAllMocks();
  sdk.token = "initial-review-token";
  sdk.getToken.mockImplementation(async () => sdk.token);
  group = { ...pendingGroup };
  readStatus = writeStatus = 200;
  pendingRead = pendingWrite = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toBe(`Bearer ${sdk.token}`);
      if (method !== "GET") {
        writes.push({
          path: url.pathname,
          method,
          body: JSON.parse(String(init?.body ?? "{}")),
          authorization,
        });
        if (method !== "PATCH" || url.pathname !== `/api/groups/${group.id}/review`)
          throw new Error(`Unexpected unconsented native review write ${method} ${url.pathname}`);
        return (
          pendingWrite ??
          Response.json(writeStatus === 200 ? group : { error: "Review refused" }, {
            status: writeStatus,
          })
        );
      }
      reads.push(url.pathname);
      if (url.pathname === `/api/groups/${group.id}/review`)
        return (
          pendingRead ??
          Response.json(readStatus === 200 ? group : { error: "Review unavailable" }, {
            status: readStatus,
          })
        );
      if (url.pathname === "/api/notifications/attention") {
        const targets = JSON.parse(
          url.searchParams.get("targets") ?? "[]",
        ) as NotificationAttentionTarget[];
        const sections = { connections: 0, requests: 0, search: 0 };
        return Response.json({
          asOf: "2030-06-01T10:00:00.000Z",
          unreadCount: 1,
          summary: { groups: 1, events: 0, tables: 0, contacts: 0, sections },
          targets: targets.map((target) => ({ target, count: 1, direct: 1, events: 0, sections })),
        });
      }
      throw new Error(`Unexpected native review GET ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <GroupReview groupId={group.id} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const mount = () => render(<Fixture />);
const press = (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));
const ready = async () => {
  const button = await screen.findByRole("button", { name: "Approve" });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  return button;
};
function failedApproval(error = new CommunityApiError(400, "Rejected approval draft")) {
  client.getMutationCache().build(
    client,
    { mutationKey: groupRecordKeys.mutation(options, group.id, "review") },
    {
      context: undefined,
      data: undefined,
      error,
      failureCount: 1,
      failureReason: error,
      isPaused: false,
      status: "error",
      submittedAt: Date.now(),
      variables: { id: group.id, input: { decision: "approve", version: group.version } },
    },
  );
}

it("keeps an uncached pending review distinct from a failure and loads only the authorized review endpoint", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise((resolve) => {
    finish = resolve;
  });
  await mount();
  expect(screen.queryByText("Could not load group review")).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  await act(() => finish(Response.json(group)));
  expect(await ready()).toBeEnabled();
  expect(reads.filter((path) => path.startsWith("/api/groups/"))).toEqual([
    `/api/groups/${group.id}/review`,
  ]);
  expect(writes).toEqual([]);
});

it("retries an unavailable review without interpreting failure as a completed decision or reading notifications", async () => {
  readStatus = 503;
  await mount();
  expect(await screen.findByText("Could not load group review")).toBeVisible();
  expect(screen.queryByText(group.name)).toBeNull();
  readStatus = 200;
  await press("Try again");
  expect(await ready()).toBeEnabled();
  expect(reads.filter((path) => path.endsWith("/review"))).toHaveLength(2);
  expect(writes).toEqual([]);
  expect(sdk.dismissTo).not.toHaveBeenCalled();
});

it("approves the displayed revision with a fresh token, blocks duplicate decisions and reconciles the actual receipt", async () => {
  let finish: (value: Response) => void = () => {};
  pendingWrite = new Promise((resolve) => {
    finish = resolve;
  });
  await mount();
  await ready();
  sdk.token = "fresh-review-token";
  await press("Approve");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    path: `/api/groups/${group.id}/review`,
    method: "PATCH",
    body: { decision: "approve", version: 4 },
    authorization: "Bearer fresh-review-token",
  });
  expect(sdk.dismissTo).toHaveBeenCalledExactlyOnceWith("/moderation");
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  expect(screen.getByLabelText("Rejection reason")).toBeDisabled();
  await press("Approve");
  await press("Reject");
  expect(writes).toHaveLength(1);
  group = {
    ...group,
    approved: { name: group.name },
    proposal: undefined,
    reviewStatus: undefined,
    version: 5,
  };
  pendingWrite = undefined;
  await act(() => finish(Response.json(group)));
  expect(await screen.findByText("Review completed")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(client.getQueryData(reviewKey())).toMatchObject({ version: 5 });
  expect(writes.every((write) => write.path.endsWith("/review"))).toBe(true);
});

it("validates rejection whitespace, restores a refused request draft on reentry and trims a deliberate retry", async () => {
  writeStatus = 400;
  const view = await mount();
  await ready();
  await fireEvent.changeText(screen.getByLabelText("Rejection reason"), "   ");
  await press("Reject");
  expect(screen.getByText("Enter a rejection reason.")).toBeVisible();
  expect(writes).toEqual([]);
  await fireEvent.changeText(
    screen.getByLabelText("Rejection reason"),
    "  Verify the public venue  ",
  );
  expect(screen.queryByText("Enter a rejection reason.")).toBeNull();
  await press("Reject");
  await waitFor(() => expect(sdk.feedback.onError).toHaveBeenCalled());
  expect(writes[0].body).toEqual({
    decision: "reject",
    version: 4,
    reason: "Verify the public venue",
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled());
  await view.unmount();
  await mount();
  await ready();
  expect(screen.getByLabelText("Rejection reason")).toHaveDisplayValue("Verify the public venue");
  writeStatus = 200;
  group = {
    ...group,
    reviewStatus: "REJECTED",
    rejectionReason: "Verify the public venue",
    version: 5,
  };
  await press("Reject");
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].body).toEqual(writes[0].body);
  expect(await screen.findByText("Review completed")).toBeVisible();
});

it("removes all decision controls when another authorized reviewer completes the review", async () => {
  await mount();
  await ready();
  await fireEvent.changeText(screen.getByLabelText("Rejection reason"), "Unsaved explanation");
  group = { ...group, reviewStatus: "REJECTED", rejectionReason: "Reviewed elsewhere", version: 5 };
  await act(() => client.invalidateQueries({ queryKey: reviewKey(), exact: true }));
  expect(await screen.findByText("Review completed")).toBeVisible();
  expect(screen.queryByLabelText("Rejection reason")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(writes).toEqual([]);
});

it("revokes cached proposal visibility immediately after the real review endpoint denies access", async () => {
  await mount();
  await ready();
  readStatus = 403;
  await act(() => client.invalidateQueries({ queryKey: reviewKey(), exact: true }));
  expect(await screen.findByText("Could not load group review")).toBeVisible();
  expect(screen.queryByText(group.name)).toBeNull();
  expect(screen.queryByLabelText("Rejection reason")).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(writes).toEqual([]);
});

it.each(["REJECTED", undefined] as const)(
  "renders an already completed %s review without permitting another decision",
  async (status) => {
    group = { ...group, reviewStatus: status };
    await mount();
    expect(await screen.findByText("Review completed")).toBeVisible();
    expect(screen.queryByLabelText("Rejection reason")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(writes).toEqual([]);
  },
);

it("does not invent a rejection reason when the latest failed request was an approval", async () => {
  failedApproval();
  await mount();
  await ready();
  expect(screen.getByLabelText("Rejection reason")).toHaveDisplayValue("");
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  expect(screen.queryByText("Checking saved changes")).toBeNull();
  expect(writes).toEqual([]);
});

it("keeps an uncertain real mutation-cache draft locked for verification rather than retrying its decision", async () => {
  failedApproval(new CommunityApiError(503, "Unknown approval outcome"));
  await mount();
  await ready();
  expect(screen.getByText("Checking saved changes")).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  await press("Approve");
  expect(writes).toEqual([]);
  expect(sdk.dismissTo).not.toHaveBeenCalled();
});
