import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Contacts } from "@/components/Contacts";
import { renderWithI18n } from "@/test-utils";

const mocks = vi.hoisted(() => ({
  friendRequest: vi.fn(),
  unfriend: vi.fn(),
  cancelFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  friends: false,
  friendsError: false,
  pending: false,
  sent: false,
  requestsError: false,
  loading: false,
  isFriend: false,
  blockedByMe: false,
  blockedMe: false,
  actionError: false,
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

vi.mock("@board-game-organizer/shared", () => ({
  reportPresence: vi.fn().mockResolvedValue({ success: true }),
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useInvites: () => ({
    mutate: vi.fn(),
    isPending: false,
    data: null,
    isError: false,
    error: null,
  }),
  useContacts: () => ({
    following: {
      data: [
        {
          fromUserId: "user_1",
          toUserId: "user_2",
          profile: {
            ...target,
            isFriend: mocks.isFriend,
            blockedByMe: mocks.blockedByMe,
            blockedMe: mocks.blockedMe,
          },
        },
      ],
    },
    followers: { data: [] },
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
    suggestions: { data: { users: [], nextCursor: null, hasContacts: false } },
    search: { data: null, isLoading: false, isError: false },
    follow: { mutate: vi.fn(), isPending: false, isError: false },
    unfollow: { mutate: vi.fn(), isPending: false, isError: false },
    unfriend: { mutate: mocks.unfriend, isPending: false, isError: mocks.actionError },
    friendRequest: {
      mutate: mocks.friendRequest,
      isPending: false,
      isError: mocks.actionError,
    },
    cancelFriendRequest: {
      mutate: mocks.cancelFriendRequest,
      isPending: false,
      isError: false,
    },
    acceptFriendRequest: {
      mutate: mocks.acceptFriendRequest,
      isPending: false,
      isError: false,
    },
    rejectFriendRequest: {
      mutate: mocks.rejectFriendRequest,
      isPending: false,
      isError: false,
    },
    block: { mutate: vi.fn(), isPending: false, isError: false },
    unblock: { mutate: vi.fn(), isPending: false, isError: false },
    syncContacts: { mutate: vi.fn(), isPending: false, isError: false },
    runSearch: vi.fn(),
    refreshContacts: vi.fn(),
  }),
}));

vi.mock("@/components/UserMenu", () => ({
  UserMenu: ({
    canSendFriendRequest,
    friendRequest,
    onAction,
  }: {
    canSendFriendRequest?: boolean;
    friendRequest?: "incoming" | "outgoing";
    onAction: (key: string) => void;
  }) =>
    friendRequest === "outgoing" ? (
      <button type="button" onClick={() => onAction("cancel_friend_request")}>
        Cancel friend request
      </button>
    ) : (
      <button
        type="button"
        disabled={!canSendFriendRequest}
        onClick={() => onAction("friend_request")}
      >
        Request friendship
      </button>
    ),
}));

describe("Contacts friend request action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friends = false;
    mocks.friendsError = false;
    mocks.pending = false;
    mocks.sent = false;
    mocks.requestsError = false;
    mocks.loading = false;
    mocks.isFriend = false;
    mocks.blockedByMe = false;
    mocks.blockedMe = false;
    mocks.actionError = false;
  });

  it("sends a request for an eligible contact", () => {
    renderWithI18n(<Contacts />);

    fireEvent.click(screen.getByRole("button", { name: "Request friendship" }));
    expect(mocks.friendRequest).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
  });

  it("shows friends and handles received and sent friend requests", async () => {
    mocks.friends = true;
    mocks.pending = true;
    mocks.sent = true;
    renderWithI18n(<Contacts />);

    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByText("Target User")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove friend: Target User" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove friend" }));
    expect(mocks.unfriend).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Friend requests" }));
    expect(screen.getByRole("heading", { name: "Received" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Respond to friend request: Target User" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Respond to friend request: Target User" }));
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel friend request" }));

    expect(mocks.cancelFriendRequest).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
    expect(mocks.acceptFriendRequest).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
    expect(mocks.rejectFriendRequest).toHaveBeenCalledWith({
      targetUserId: "user_2",
      targetUser: expect.objectContaining({ id: "user_2" }),
    });
  });

  it("shows empty and failed friend states", () => {
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByText("No friends yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Friend requests" }));
    expect(screen.getByText("No received friend requests")).toBeTruthy();
    expect(screen.getByText("No sent friend requests")).toBeTruthy();
  });

  it("renders complete skeleton rows while friend requests load", () => {
    mocks.loading = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("button", { name: "Friend requests" }));

    const rows = screen.getAllByTestId("contact-skeleton-row");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.className).toContain("flex-row");
      expect(row.querySelectorAll(".skeleton")).toHaveLength(3);
    }
  });

  it("surfaces friend and request loading failures", () => {
    mocks.friendsError = true;
    mocks.requestsError = true;
    renderWithI18n(<Contacts />);
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByRole("alert").textContent).toBe("Could not load friends");
    fireEvent.click(screen.getByRole("button", { name: "Friend requests" }));
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByText("Could not load friend requests")).toHaveLength(2);
  });

  it("shows relationship mutation failures", () => {
    mocks.actionError = true;
    renderWithI18n(<Contacts />);

    expect(screen.getByRole("alert").textContent).toContain("Could not complete the action");
  });

  it.each(["pending", "sent", "loading", "isFriend", "blockedByMe", "blockedMe"] as const)(
    "disables ineligible requests: %s",
    (state) => {
      mocks[state] = true;
      renderWithI18n(<Contacts />);

      expect(
        (screen.getByRole("button", { name: "Request friendship" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    },
  );
});
