import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Contacts } from "@/components/Contacts";
import { renderWithI18n } from "@/test-utils";

const mocks = vi.hoisted(() => ({
  friendRequest: vi.fn(),
  unfriend: vi.fn(),
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  friends: false,
  following: true,
  pending: false,
  sent: false,
  friendsError: false,
  requestsError: false,
  loading: false,
  blockedByMe: false,
  blockedMe: false,
  actionError: false,
  searchError: false,
  searchResult: false,
}));

const target = {
  id: "user_2",
  name: "Target User",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2026-01-01T00:00:00.000Z" },
  isFollowing: true,
  isFriend: false,
  blockedByMe: false,
  blockedMe: false,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    getToken: vi.fn().mockResolvedValue("token"),
  }),
}));

vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  reportPresence: vi.fn().mockResolvedValue({ success: true }),
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useContacts: () => ({
    following: {
      data: mocks.following
        ? [
            {
              fromUserId: "user_1",
              toUserId: "user_2",
              profile: {
                ...target,
                isFriend: mocks.friends,
                blockedByMe: mocks.blockedByMe,
                blockedMe: mocks.blockedMe,
              },
            },
          ]
        : [],
      isLoading: false,
      isError: false,
    },
    followers: { data: [], isLoading: false, isError: false },
    friends: {
      data: mocks.friends
        ? [{ fromUserId: "user_1", toUserId: "user_2", profile: { ...target, isFriend: true } }]
        : [],
      isLoading: false,
      isError: mocks.friendsError,
    },
    pending: {
      data: mocks.pending ? [{ fromUserId: "user_2", toUserId: "user_1", profile: target }] : [],
      isLoading: mocks.loading,
      isSuccess: !mocks.loading,
      isError: mocks.requestsError,
    },
    sent: {
      data: mocks.sent ? [{ fromUserId: "user_1", toUserId: "user_2", profile: target }] : [],
      isLoading: mocks.loading,
      isSuccess: !mocks.loading,
      isError: mocks.requestsError,
    },
    blocked: { data: [], isLoading: false, isError: false },
    suggestions: {
      data: { users: [], nextCursor: null, hasContacts: false },
      isLoading: false,
      isError: false,
    },
    search: {
      data: mocks.searchResult ? { users: [target], nextCursor: null } : null,
      isLoading: false,
      isError: mocks.searchError,
    },
    follow: { mutate: vi.fn(), isPending: false, isError: false },
    unfollow: { mutate: vi.fn(), isPending: false, isError: false },
    unfriend: { mutate: mocks.unfriend, isPending: false, isError: mocks.actionError },
    friendRequest: { mutate: mocks.friendRequest, isPending: false, isError: mocks.actionError },
    cancelFriendRequest: { mutate: mocks.cancelFriendRequest, isPending: false, isError: false },
    acceptFriendRequest: { mutate: mocks.acceptFriendRequest, isPending: false, isError: false },
    rejectFriendRequest: { mutate: mocks.rejectFriendRequest, isPending: false, isError: false },
    block: { mutate: vi.fn(), isPending: false, isError: false },
    unblock: { mutate: vi.fn(), isPending: false, isError: false },
    syncContacts: { mutate: vi.fn(), isPending: false, isError: false },
    runSearch: vi.fn(),
    refreshContacts: vi.fn(),
  }),
}));

vi.mock("@/components/UserMenu", () => ({
  UserMenu: ({
    user,
    canSendFriendRequest,
    friendRequest,
    onAction,
  }: {
    user: typeof target;
    canSendFriendRequest?: boolean;
    friendRequest?: "incoming" | "outgoing";
    onAction: (key: string) => void;
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" aria-label={`Actions: ${user.name}`} onClick={() => setOpen(!open)}>
          Actions
        </button>
        {open &&
          (friendRequest === "incoming" ? (
            <>
              <button type="button" onClick={() => onAction("accept_friend_request")}>
                Accept friend request
              </button>
              <button type="button" onClick={() => onAction("reject_friend_request")}>
                Decline friend request
              </button>
            </>
          ) : friendRequest === "outgoing" ? (
            <button type="button" onClick={() => onAction("cancel_friend_request")}>
              Cancel friend request
            </button>
          ) : user.isFriend ? (
            <button type="button" onClick={() => onAction("unfriend")}>
              Remove friend
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSendFriendRequest}
              onClick={() => onAction("friend_request")}
            >
              Request friendship
            </button>
          ))}
      </div>
    );
  },
}));

describe("Contacts tabs", () => {
  beforeAll(() => {
    Element.prototype.getAnimations = () => [];
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks, {
      friends: false,
      following: true,
      pending: false,
      sent: false,
      friendsError: false,
      requestsError: false,
      loading: false,
      blockedByMe: false,
      blockedMe: false,
      actionError: false,
      searchError: false,
      searchResult: false,
    });
  });

  it("groups each connection once and keeps social actions inside menu", () => {
    mocks.friends = true;
    renderWithI18n(<Contacts />);
    expect(screen.getAllByText("Target User")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Friends" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove friend" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions: Target User" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(mocks.unfriend).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
  });

  it("sends request from connection menu when eligible", () => {
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("button", { name: "Actions: Target User" }));
    fireEvent.click(screen.getByRole("button", { name: "Request friendship" }));
    expect(mocks.friendRequest).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
  });

  it("handles received and sent requests from their menus", () => {
    mocks.following = false;
    mocks.pending = true;
    mocks.sent = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
    const received = screen.getByRole("heading", { name: "Received" }).closest("section");
    const sent = screen.getByRole("heading", { name: "Sent" }).closest("section");
    if (!received || !sent) throw new Error("Request sections missing");
    fireEvent.click(within(received).getByRole("button", { name: "Actions: Target User" }));
    fireEvent.click(within(received).getByRole("button", { name: "Accept friend request" }));
    fireEvent.click(within(received).getByRole("button", { name: "Decline friend request" }));
    fireEvent.click(within(sent).getByRole("button", { name: "Actions: Target User" }));
    fireEvent.click(within(sent).getByRole("button", { name: "Cancel friend request" }));
    for (const fn of [
      mocks.acceptFriendRequest,
      mocks.rejectFriendRequest,
      mocks.cancelFriendRequest,
    ]) {
      expect(fn).toHaveBeenCalledWith({
        targetUserId: "user_2",
        targetUser: expect.objectContaining({ id: "user_2" }),
      });
    }
  });

  it("shows request loading, empty, and failure states", () => {
    mocks.following = false;
    mocks.loading = true;
    const view = renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
    expect(screen.getAllByTestId("contact-skeleton-row")).toHaveLength(4);
    view.unmount();
    mocks.loading = false;
    mocks.requestsError = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
    expect(screen.getAllByText("Could not load friend requests")).toHaveLength(2);
  });

  it("shows connection and action errors without empty-list success", () => {
    mocks.friendsError = true;
    mocks.actionError = true;
    renderWithI18n(<Contacts />);
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Could not complete the action. Try again.")).toBeTruthy();
  });

  it("keeps search failures distinct from empty results", () => {
    mocks.searchError = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search users by name or email" }), {
      target: { value: "missing" },
    });
    expect(screen.getByRole("alert").textContent).toBe("Could not load contacts");
    expect(screen.queryByText("No users found")).toBeNull();
  });

  it("web search shows BGO users without global invite or device-contact controls", () => {
    mocks.searchResult = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(screen.getByRole("textbox", { name: "Search users by name or email" })).toBeTruthy();
    expect(screen.getByText("Target User")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create invite|Add contacts/i })).toBeNull();
  });

  it.each(["pending", "sent", "loading", "friends", "blockedByMe", "blockedMe"] as const)(
    "does not offer new request when %s",
    (state) => {
      mocks[state] = true;
      renderWithI18n(<Contacts />);
      fireEvent.click(screen.getByRole("button", { name: "Actions: Target User" }));
      const newRequest = screen.queryByRole("button", { name: "Request friendship" });
      if (state === "pending" || state === "sent" || state === "friends")
        expect(newRequest).toBeNull();
      else expect((newRequest as HTMLButtonElement).disabled).toBe(true);
    },
  );
});
