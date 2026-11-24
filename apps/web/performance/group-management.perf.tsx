import type { GroupMembership, GroupRecordResponse } from "@board-game-organizer/schemas";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, expect, vi } from "vitest";
import GroupInvitePage from "@/app/(tabs)/groups/[groupId]/invite/page";
import GroupReviewPage from "@/app/(tabs)/moderation/[groupId]/page";
import GroupModerationPage from "@/app/(tabs)/moderation/page";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

const sdk = vi.hoisted(() => {
  const apiUrl = "https://group-management-render.test";
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  return { apiUrl, getToken: async () => "fixture-group-manager", push: vi.fn(), back: vi.fn() };
});

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "owner", isLoaded: true, isSignedIn: true, getToken: sdk.getToken }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: sdk.push, back: sdk.back }) }));

const pending: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  approved: undefined,
  name: "Proposed public club",
  reviewStatus: "PENDING",
  version: 4,
  role: "none",
  proposal: { name: "Proposed public club", location: plannedEvent.locations[0] },
};
const reviewingEndpoint = `/api/groups/${groupRecord.id}/review`;
const friend = {
  id: "known-friend",
  username: "ada",
  name: "Ada",
  avatarUrl: null,
  email: null,
  isFriend: true,
};

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

function mockGroupApi(respond: (url: URL, init?: RequestInit) => Response) {
  sdk.back.mockClear();
  sdk.push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(sdk.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-group-manager");
      if (url.pathname === "/api/notifications/attention") {
        const sections = { connections: 0, requests: 0, search: 0 };
        return Response.json({
          asOf: plannedEvent.createdAt,
          unreadCount: 0,
          summary: { groups: 0, events: 0, tables: 0, contacts: 0, sections },
          targets: JSON.parse(url.searchParams.get("targets") ?? "[]").map((target: object) => ({
            target,
            count: 0,
            direct: 0,
            events: 0,
            sections,
          })),
        });
      }
      return respond(url, init);
    }),
  );
}

measureWebFeature(
  "GroupModeration: open visibility help without navigating away from the review queue",
  <GroupModerationPage />,
  async () => {
    const link = await screen.findByRole("link", { name: "Open group: Proposed public club" });
    expect(link).toHaveAttribute("href", `/moderation/${pending.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(sdk.push).not.toHaveBeenCalled();
  },
  () =>
    mockGroupApi((url) => {
      expect(url.pathname).toBe("/api/groups");
      expect(url.searchParams.get("scope")).toBe("moderation");
      return Response.json({ items: [pending], nextCursor: null });
    }),
);

measureWebFeature(
  "GroupReview: validate, submit and render the reviewed revision",
  () => GroupReviewPage({ params: Promise.resolve({ groupId: pending.id }) }),
  async () => {
    await screen.findByText(pending.name);
    const reason = screen.getByRole("textbox", { name: "Rejection reason" });
    const reject = screen.getByRole("button", { name: "Reject" });
    fireEvent.click(reject);
    expect(screen.getByText("Enter a rejection reason.")).toBeVisible();
    fireEvent.change(reason, { target: { value: "  Verify the public venue  " } });
    expect(screen.queryByText("Enter a rejection reason.")).toBeNull();
    fireEvent.click(reject);
    await waitFor(() => expect(screen.getByText("Review completed")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/moderation");
  },
  () => {
    let current = pending;
    mockGroupApi((url, init) => {
      expect(url.pathname).toBe(reviewingEndpoint);
      if (init?.method !== "PATCH") return Response.json(current);
      expect(JSON.parse(String(init.body))).toEqual({
        decision: "reject",
        reason: "Verify the public venue",
        version: pending.version,
      });
      current = {
        ...pending,
        version: pending.version + 1,
        reviewStatus: "REJECTED",
        rejectionReason: "Verify the public venue",
      };
      return Response.json(current);
    });
  },
);

measureWebFeature(
  "GroupPeoplePicker: invite an authorized friend through the real list",
  () => GroupInvitePage({ params: Promise.resolve({ groupId: groupRecord.id }) }),
  async () => {
    expect(screen.queryByRole("alert")).toBeNull();
    const select = await screen.findByRole("button", { name: "Select user: Ada" });
    expect(screen.getByText("@ada")).toBeVisible();
    fireEvent.click(select);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/groups/${groupRecord.id}/members`),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(sdk.back).toHaveBeenCalledOnce();
  },
  () =>
    mockGroupApi((url, init) => {
      if (url.pathname.endsWith("/members") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ userId: friend.id });
        const receipt: GroupMembership = {
          id: "44444444-4444-4444-8444-444444444444",
          groupId: groupRecord.id,
          userId: friend.id,
          kind: "INVITATION",
          status: "PENDING",
          version: 1,
          createdAt: groupRecord.createdAt,
          updatedAt: groupRecord.updatedAt,
        };
        return Response.json(receipt);
      }
      if (url.pathname.endsWith("/invitees"))
        return Response.json({ items: [friend], nextCursor: null });
      expect(url.pathname).toBe(`/api/groups/${groupRecord.id}`);
      return Response.json(groupRecord);
    }),
);
