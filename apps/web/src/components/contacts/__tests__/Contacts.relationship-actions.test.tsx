import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import type { ContactUser, RelationshipListType } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { Contacts } from "../Contacts";

const auth = vi.hoisted(() => ({ getToken: vi.fn(async () => "fresh-contact-token") }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_owner",
    getToken: auth.getToken,
  }),
}));
const at = "2026-11-14T00:00:00.000Z";
const summary = {
  tables: 0,
  events: 0,
  groups: 0,
  contacts: 0,
  sections: { connections: 0, requests: 0, search: 0 },
};
const cases = [
  { label: "Follow", source: "device", method: "POST", type: "follow" },
  { label: "Unfollow", source: "following", method: "DELETE", type: "follow" },
  {
    label: "Remove friend",
    source: "friends",
    method: "DELETE",
    type: "friend",
    confirmation: "Remove friend?",
    confirmAction: "Remove friend",
  },
  {
    label: "Send friend request",
    source: "device",
    method: "POST",
    type: "friend_request",
    confirmation: "Send friend request?",
    confirmAction: "Send request",
  },
  {
    label: "Cancel friend request",
    source: "sent",
    method: "DELETE",
    type: "friend_request",
    confirmation: "Cancel friend request?",
    confirmAction: "Cancel request",
  },
  {
    label: "Accept friend request",
    source: "pending",
    method: "PATCH",
    decision: "accept",
    confirmation: "Accept friend request?",
    confirmAction: "Accept",
  },
  {
    label: "Decline friend request",
    source: "pending",
    method: "PATCH",
    decision: "reject",
    confirmation: "Decline friend request?",
    confirmAction: "Decline",
  },
  {
    label: "Block",
    source: "device",
    method: "POST",
    type: "block",
    confirmation: "Block contact",
    confirmAction: "Block",
  },
  {
    label: "Unblock",
    source: "blocked",
    method: "DELETE",
    type: "block",
    confirmation: "Unblock contact?",
    confirmAction: "Unblock",
  },
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test.invalid");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS", "contact-preview-bypass");
});

it.each(cases)(
  "$label uses its actual menu, explicit consent and authorized relationship request",
  async (scenario) => {
    let following = scenario.source === "following" || scenario.source === "friends";
    let friend = scenario.source === "friends";
    let follower = scenario.source === "friends";
    let blocked = scenario.source === "blocked";
    let request: "incoming" | "outgoing" | null =
      scenario.source === "pending" ? "incoming" : scenario.source === "sent" ? "outgoing" : null;
    const writes: { url: URL; init: RequestInit }[] = [];
    const user = (): ContactUser => ({
      id: "user_target",
      name: "Target Player",
      username: "target-player",
      email: null,
      avatarUrl: null,
      presence: { online: true, lastActiveAt: at },
      isFollowing: following,
      isFollower: follower,
      isFriend: friend,
      blockedByMe: blocked,
      blockedMe: false,
    });
    const rows = (type: RelationshipListType) => {
      const present =
        type === "friends"
          ? friend
          : type === "following"
            ? following
            : type === "followers"
              ? follower
              : type === "blocked"
                ? blocked
                : type === "pending"
                  ? request === "incoming"
                  : request === "outgoing";
      if (!present) return [];
      const incoming = type === "pending" || type === "followers";
      return [
        {
          fromUserId: incoming ? "user_target" : "user_owner",
          toUserId: incoming ? "user_owner" : "user_target",
          profile: user(),
        },
      ];
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => {
        const url = new URL(input);
        if (url.pathname === "/api/notifications/attention") {
          const targets = JSON.parse(
            url.searchParams.get("targets") ?? "[]",
          ) as NotificationAttentionTarget[];
          return Response.json({
            asOf: at,
            unreadCount: 0,
            summary,
            targets: targets.map((target) => ({
              target,
              count: 0,
              direct: 0,
              events: 0,
              sections: summary.sections,
            })),
          });
        }
        if (url.pathname === "/api/users/presence")
          return Response.json({ success: true, lastActiveAt: at });
        if (url.pathname === "/api/users/suggestions")
          return Response.json({
            users: scenario.source === "device" ? [user()] : [],
            hasContacts: scenario.source === "device",
            nextCursor: null,
          });
        if ((!init.method || init.method === "GET") && url.pathname === "/api/relationships")
          return Response.json({
            rows: rows(url.searchParams.get("type") as RelationshipListType),
            nextCursor: null,
          });
        if (
          url.pathname === "/api/relationships" ||
          url.pathname === "/api/friend-requests/user_target"
        ) {
          writes.push({ url, init });
          const kind = url.searchParams.get("type");
          if (kind === "follow") following = init.method === "POST";
          else if (kind === "friend") {
            friend = false;
            following = false;
          } else if (kind === "friend_request")
            request = init.method === "POST" ? "outgoing" : null;
          else if (kind === "block") {
            blocked = init.method === "POST";
            friend = following = follower = false;
            request = null;
          } else {
            const decision = JSON.parse(String(init.body)).decision;
            if (decision === "accept") friend = following = follower = true;
            request = null;
          }
          return Response.json({ success: true });
        }
        throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url.pathname}`);
      }),
    );
    renderWithI18n(<Contacts />);
    const tab =
      scenario.source === "device"
        ? "Contacts"
        : scenario.source === "pending" || scenario.source === "sent"
          ? "Requests"
          : "Connections";
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    const action = await screen.findByRole("button", { name: "Actions" });
    expect(screen.getByText("@target-player")).toBeTruthy();
    fireEvent.click(action);
    const item = await screen.findByRole("menuitem", { name: scenario.label });
    expect(writes).toHaveLength(0);
    fireEvent.click(item);
    if ("confirmation" in scenario) {
      const dialog = await screen.findByRole("dialog", { name: scenario.confirmation });
      expect(writes).toHaveLength(0);
      fireEvent.click(within(dialog).getByRole("button", { name: scenario.confirmAction }));
    }
    await waitFor(() => expect(writes).toHaveLength(1));
    const write = writes[0];
    expect(write.init.method).toBe(scenario.method);
    expect(write.url.searchParams.get("x-vercel-protection-bypass")).toBe("contact-preview-bypass");
    expect(new Headers(write.init.headers).get("Authorization")).toBe("Bearer fresh-contact-token");
    if ("decision" in scenario) {
      expect(write.url.pathname).toBe("/api/friend-requests/user_target");
      expect(JSON.parse(String(write.init.body))).toEqual({ decision: scenario.decision });
    } else {
      expect(write.url.pathname).toBe("/api/relationships");
      expect(write.url.searchParams.get("type")).toBe(scenario.type);
      expect(JSON.parse(String(write.init.body))).toEqual({ targetUserId: "user_target" });
    }
    expect(screen.queryByText("Could not complete the action. Try again.")).toBeNull();
  },
);
