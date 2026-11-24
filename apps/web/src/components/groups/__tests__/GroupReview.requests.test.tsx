import type {
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { clearSessionQueryCache, groupRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupReviewPage from "@/app/(tabs)/moderation/[groupId]/page";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

const sdk = vi.hoisted(() => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://group-review-fixtures.test";
  return { previousApiUrl, getToken: vi.fn<() => Promise<string | null>>(), push: vi.fn() };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "reviewer", isLoaded: true, isSignedIn: true, getToken: sdk.getToken }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: sdk.push }) }));

const API = "https://group-review-fixtures.test";
const owner = { apiUrl: API, userId: "reviewer" };
const pendingGroup: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  role: "none",
  approved: undefined,
  proposal: { name: "Proposed public club" },
  name: "Proposed public club",
  reviewStatus: "PENDING",
  version: 4,
};
let client: QueryClient;
let group: GroupRecordResponse;
let readStatus: number;
let writeStatus: number;
let blockedWrite: Promise<Response> | undefined;
const requests: { url: URL; method: string; body: unknown; authorization: string | null }[] = [];
const readPaths: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  sdk.getToken.mockResolvedValue("initial-review-token");
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  group = { ...pendingGroup };
  readStatus = writeStatus = 200;
  blockedWrite = undefined;
  requests.length = readPaths.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toMatch(/^Bearer (initial|fresh)-review-token$/);
      if (method !== "GET") {
        expect(url.pathname).toBe(`/api/groups/${group.id}/review`);
        expect(method).toBe("PATCH");
        requests.push({ url, method, body: JSON.parse(String(init?.body)), authorization });
        if (blockedWrite) return blockedWrite;
        return Response.json(writeStatus === 200 ? group : { error: "Review refused" }, {
          status: writeStatus,
        });
      }
      readPaths.push(url.pathname);
      if (url.pathname === `/api/groups/${group.id}/review`) {
        return Response.json(readStatus === 200 ? group : { error: "Review unavailable" }, {
          status: readStatus,
        });
      }
      if (url.pathname === "/api/notifications/attention") {
        const targets = JSON.parse(
          url.searchParams.get("targets") ?? "[]",
        ) as NotificationAttentionTarget[];
        const sections = { connections: 0, requests: 0, search: 0 };
        return Response.json({
          asOf: "2030-06-12T10:00:00.000Z",
          unreadCount: 0,
          summary: { groups: 0, events: 0, tables: 0, contacts: 0, sections },
          targets: targets.map((target) => ({ target, count: 0, direct: 0, events: 0, sections })),
        });
      }
      throw new Error(`Unexpected group-review request: ${method} ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (sdk.previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.previousApiUrl;
});
async function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      {await GroupReviewPage({ params: Promise.resolve({ groupId: group.id }) })}
    </QueryClientProvider>,
  );
}

it("retries an unavailable review from its real error action without changing the group or acknowledging notices", async () => {
  readStatus = 503;
  await mount();
  expect(await screen.findByText("Could not load group review")).toBeVisible();
  expect(screen.queryByText(pendingGroup.name)).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(requests).toEqual([]);
  readStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(pendingGroup.name)).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  expect(readPaths.filter((path) => path.endsWith("/review"))).toHaveLength(2);
  expect(requests).toEqual([]);
  expect(sdk.push).not.toHaveBeenCalled();
});

it("approves the exact displayed revision with a fresh token and blocks another decision until the receipt arrives", async () => {
  let release: ((response: Response) => void) | undefined;
  blockedWrite = new Promise<Response>((resolve) => {
    release = resolve;
  });
  await mount();
  await screen.findByText(pendingGroup.name);
  sdk.getToken.mockResolvedValue("fresh-review-token");
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].body).toEqual({ decision: "approve", version: 4 });
  expect(requests[0].authorization).toBe("Bearer fresh-review-token");
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/moderation");
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Rejection reason" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(requests).toHaveLength(1);
  group = {
    ...group,
    version: 5,
    reviewStatus: undefined,
    proposal: undefined,
    approved: { name: group.name },
  };
  const finish = release;
  if (!finish) throw new Error("Expected a pending moderation receipt");
  await act(async () => finish(Response.json(group)));
  expect(await screen.findByText("Review completed")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(client.getQueryData(groupRecordKeys.detail(owner, group.id, true))).toMatchObject({
    version: 5,
  });
});

it("validates whitespace, trims the accepted rejection reason, and permits a deliberate retry after an authoritative refusal", async () => {
  writeStatus = 400;
  await mount();
  await screen.findByText(pendingGroup.name);
  fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(screen.getByText("Enter a rejection reason.")).toBeVisible();
  expect(requests).toEqual([]);
  fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "  Please verify the public venue  " },
  });
  expect(screen.queryByText("Enter a rejection reason.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled());
  expect(requests[0].body).toEqual({
    decision: "reject",
    reason: "Please verify the public venue",
    version: 4,
  });
  expect(screen.queryByText("Review completed")).toBeNull();
  writeStatus = 200;
  group = {
    ...group,
    version: 5,
    reviewStatus: "REJECTED",
    rejectionReason: "Please verify the public venue",
  };
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(await screen.findByText("Review completed")).toBeVisible();
  expect(requests[1].body).toEqual(requests[0].body);
});

it("removes review actions after a newer authoritative revision completes moderation elsewhere", async () => {
  await mount();
  await screen.findByText(pendingGroup.name);
  fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "Unsaved explanation" },
  });
  group = {
    ...group,
    reviewStatus: "REJECTED",
    rejectionReason: "Reviewed by another moderator",
    version: 5,
  };
  await act(async () =>
    client.invalidateQueries({ queryKey: groupRecordKeys.detail(owner, group.id, true) }),
  );
  expect(await screen.findByText("Review completed")).toBeVisible();
  expect(screen.getByText("Reviewed by another moderator")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(requests).toEqual([]);
  expect(sdk.push).not.toHaveBeenCalled();
});

it("hides cached proposal fields immediately after review authorization is revoked", async () => {
  await mount();
  await screen.findByText(pendingGroup.name);
  readStatus = 403;
  await act(async () =>
    client.invalidateQueries({ queryKey: groupRecordKeys.detail(owner, group.id, true) }),
  );
  expect(await screen.findByText("Could not load group review")).toBeVisible();
  expect(screen.queryByText(pendingGroup.name)).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Rejection reason" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(requests).toEqual([]);
});
