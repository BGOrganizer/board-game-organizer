import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupDetail } from "../GroupDetail";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "guest",
    getToken: async () => "fresh",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
function mount() {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <GroupDetail groupId={groupRecord.id} />
    </QueryClientProvider>,
  );
}
it("pending members can read permitted information and accepted members, never events/rankings/social actions", async () => {
  const invited = {
    ...groupRecord,
    role: "invited",
    canViewEvents: false,
    canViewRankings: false,
    canSocialInteract: false,
    canEdit: false,
    canInvite: false,
    eventCount: null,
    myMembership: {
      id: groupRecord.id,
      groupId: groupRecord.id,
      userId: "guest",
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/members?")
              ? {
                  items: [
                    {
                      userId: "owner",
                      name: "Owner",
                      avatarUrl: null,
                      username: null,
                      isAdmin: true,
                      membership: null,
                      ban: null,
                    },
                  ],
                  nextCursor: null,
                }
              : invited,
          ),
        ),
    ),
  );
  mount();
  expect(await screen.findByRole("button", { name: "Accept invitation" })).not.toBeNull();
  expect(screen.queryByRole("tab", { name: "Events" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Rankings" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  expect(await screen.findByText("Owner")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Exclude a user" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Contact actions/ })).toBeNull();
});
it("public outsider requests membership explicitly without fabricating acceptance permissions", async () => {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? {
                id: groupRecord.id,
                groupId: groupRecord.id,
                userId: "guest",
                kind: "REQUEST",
                status: "PENDING",
                version: 1,
                createdAt: groupRecord.createdAt,
                updatedAt: groupRecord.updatedAt,
              }
            : {
                ...groupRecord,
                type: "PUBLIC",
                role: "none",
                canViewMembers: false,
                canViewEvents: false,
                canViewRankings: false,
                canSocialInteract: false,
                canInvite: false,
                canEdit: false,
              },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Request membership" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url, init]) => url.endsWith("/membership") && init?.method === "POST",
      ),
    ).toBe(true),
  );
  expect(screen.queryByRole("tab", { name: "Members" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Events" })).toBeNull();
});
