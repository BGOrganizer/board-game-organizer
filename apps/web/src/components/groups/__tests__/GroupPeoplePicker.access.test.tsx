import type { GroupMembership, GroupRecordResponse } from "@board-game-organizer/schemas";
import type { ContactUser } from "@board-game-organizer/shared";
import { clearSessionQueryCache, groupRecordDetailQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupInvitePage from "@/app/(tabs)/groups/[groupId]/invite/page";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

const boundary = vi.hoisted(() => ({ back: vi.fn(), getToken: vi.fn() }));
const options = {
  apiUrl: "https://group-invite-picker-fixtures.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: boundary.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
const friend: ContactUser = {
  id: "friend",
  name: "Known Friend",
  username: "known-friend",
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
};
let group: GroupRecordResponse;
let status: number;
let candidateStatus: number;
let nextCandidate: Promise<Response> | undefined;
let hasMore: boolean;
const candidateCursors: (string | null)[] = [];
let pending: Promise<Response> | undefined;
let client: QueryClient;
const writes: unknown[] = [];
const reads: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-invite-picker-token");
  group = { ...groupRecord };
  status = candidateStatus = 200;
  hasMore = false;
  nextCandidate = undefined;
  candidateCursors.length = 0;
  pending = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fresh-invite-picker-token",
      );
      if (init?.method === "POST" && url.pathname === `/api/groups/${group.id}/members`) {
        writes.push(JSON.parse(String(init.body)));
        const membership: GroupMembership = {
          id: "44444444-4444-4444-8444-444444444444",
          groupId: group.id,
          userId: friend.id,
          kind: "INVITATION",
          status: "PENDING",
          version: 1,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        };
        return Response.json(membership);
      }
      reads.push(url.pathname);
      if (url.pathname === `/api/groups/${group.id}`)
        return (
          pending ??
          Response.json(status === 200 ? group : { error: "Fixture group unavailable" }, { status })
        );
      if (url.pathname === `/api/groups/${group.id}/invitees`) {
        const cursor = url.searchParams.get("cursor");
        candidateCursors.push(cursor);
        if (cursor) {
          return (
            nextCandidate ??
            Response.json({
              items: [{ ...friend, id: "new-friend", name: "Another friend" }],
              nextCursor: null,
            })
          );
        }
        return Response.json(
          candidateStatus === 200
            ? { items: [friend], nextCursor: hasMore ? "next-friend" : null }
            : { error: "Candidates unavailable" },
          { status: candidateStatus },
        );
      }
      throw new Error(`Unexpected group picker request: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});
async function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      {await GroupInvitePage({ params: Promise.resolve({ groupId: group.id }) })}
    </QueryClientProvider>,
  );
}

it("keeps the initial authorization read pending and cancels the real friend chooser through Back without an invitation", async () => {
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending group read");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await mount();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Back" }).textContent).toBe("");
  await act(() => finish(Response.json(group)));
  expect(await screen.findByText("Known Friend")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(writes).toEqual([]);
});

it("recovers a failed authorization read only after explicit retry, then invites the selected actual friend", async () => {
  status = 503;
  await mount();
  expect(await screen.findByText("Could not load group")).toBeVisible();
  expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
  expect(screen.queryByText("No friends found")).toBeNull();
  expect(reads.filter((path) => path.endsWith("/invitees"))).toHaveLength(0);
  status = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  const select = await screen.findByRole("button", { name: "Select user: Known Friend" });
  expect(screen.getByText("@known-friend")).toBeVisible();
  expect(writes).toEqual([]);
  fireEvent.click(select);
  expect(boundary.back).toHaveBeenCalledOnce();
  await waitFor(() => expect(writes).toEqual([{ userId: friend.id }]));
});

it.each([
  ["accepted", "Group admin required"],
  ["admin", "Invitations require an approved group."],
] as const)(
  "keeps the %s authorization/capability gate ahead of the friend source",
  async (role, message) => {
    group = { ...group, role, canInvite: false };
    await mount();
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Select user: Known Friend" })).toBeNull();
    expect(reads.filter((path) => path.endsWith("/invitees"))).toHaveLength(0);
    expect(writes).toEqual([]);
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.textContent).toBe("");
    fireEvent.click(back);
    expect(boundary.back).toHaveBeenCalledOnce();
  },
);

it("revokes a cached authorized chooser after a background permission denial", async () => {
  await mount();
  await screen.findByText("Known Friend");
  status = 403;
  await act(() =>
    client.invalidateQueries({ queryKey: groupRecordDetailQuery(options, group.id).queryKey }),
  );
  expect(await screen.findByText("Group admin required")).toBeVisible();
  expect(screen.queryByText("Known Friend")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(writes).toEqual([]);
});

it("retains the friend choice during pagination, then retries a failed authorized cursor", async () => {
  hasMore = true;
  await mount();
  await screen.findByRole("button", { name: "Select user: Known Friend" });
  expect(screen.getByRole("searchbox", { name: "Search friends" })).toBeVisible();
  let release: (result: Response) => void = () => {
    throw new Error("Expected a pending invitee read");
  };
  nextCandidate = new Promise((resolve) => {
    release = resolve;
  });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(candidateCursors).toEqual([null, "next-friend"]));
  expect(screen.getByRole("button", { name: "Select user: Known Friend" })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  await act(() => release(Response.json({ error: "UNAVAILABLE" }, { status: 503 })));
  const retry = await screen.findByRole("button", { name: "Could not load users. Retry" });
  expect(screen.getByRole("button", { name: "Select user: Known Friend" })).toBeVisible();
  nextCandidate = undefined;
  fireEvent.click(retry);
  expect(await screen.findByRole("button", { name: "Select user: Another friend" })).toBeVisible();
  expect(candidateCursors).toEqual([null, "next-friend", "next-friend"]);
  expect(writes).toEqual([]);
});

it("keeps an authorized group separate from a denied friend inventory and retries only the inventory", async () => {
  candidateStatus = 403;
  await mount();
  await screen.findByText("Could not load users");
  expect(screen.queryByRole("button", { name: "Select user: Known Friend" })).toBeNull();
  expect(screen.queryByText("No friends found")).toBeNull();
  candidateStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Select user: Known Friend" })).toBeVisible();
  expect(reads.filter((path) => path === `/api/groups/${group.id}`)).toHaveLength(1);
  expect(candidateCursors).toEqual([null, null]);
  expect(writes).toEqual([]);
});
