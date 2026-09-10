import type { ContactUser } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/UserMenu";
import { renderWithI18n } from "@/test-utils";

const user: ContactUser = {
  id: "user_2",
  name: "Target User",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  await screen.findByRole("menu");
}

describe("UserMenu", () => {
  it("runs immediate follow and unfollow actions", async () => {
    const onAction = vi.fn();
    const first = renderWithI18n(<UserMenu user={user} onAction={onAction} />);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Follow" }));
    expect(onAction).toHaveBeenCalledWith("follow");

    first.unmount();
    renderWithI18n(<UserMenu user={{ ...user, isFollowing: true }} onAction={onAction} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unfollow" }));
    expect(onAction).toHaveBeenCalledWith("unfollow");
  });

  it("offers one relationship action for friends", async () => {
    const onAction = vi.fn();
    renderWithI18n(
      <UserMenu user={{ ...user, isFriend: true, isFollowing: true }} onAction={onAction} />,
    );

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Follow" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Unfollow" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Send friend request" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove friend" }));
    expect(await screen.findByRole("dialog", { name: "Remove friend?" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(onAction).toHaveBeenCalledWith("unfriend");
  });

  it("confirms friend requests in an accessible dialog", async () => {
    const onAction = vi.fn();
    renderWithI18n(<UserMenu user={user} canSendFriendRequest onAction={onAction} />);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Send friend request" }));
    const dialog = await screen.findByRole("dialog", { name: "Send friend request?" });
    expect(dialog.textContent).toContain("They can accept or decline your request.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Send friend request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send request" }));
    expect(onAction).toHaveBeenCalledWith("friend_request");
  });

  it("offers request response and cancellation actions in their correct contexts", async () => {
    const onAction = vi.fn();
    const incoming = renderWithI18n(
      <UserMenu user={user} friendRequest="incoming" onAction={onAction} />,
    );

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Send friend request" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Accept friend request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenCalledWith("accept_friend_request");

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Decline friend request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(onAction).toHaveBeenCalledWith("reject_friend_request");

    incoming.unmount();
    renderWithI18n(<UserMenu user={user} friendRequest="outgoing" onAction={onAction} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel friend request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    expect(onAction).toHaveBeenCalledWith("cancel_friend_request");
  });

  it("confirms blocking and closes on Escape", async () => {
    const onAction = vi.fn();
    renderWithI18n(<UserMenu user={user} onAction={onAction} />);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    expect(await screen.findByRole("dialog", { name: "Block contact" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Block$/ }));
    expect(onAction).toHaveBeenCalledWith("block");
  });

  it("offers only unblock and disabled profile actions for blocked contacts", async () => {
    const onAction = vi.fn();
    renderWithI18n(<UserMenu user={{ ...user, blockedByMe: true }} onAction={onAction} />);

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Send friend request" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unblock" }));
    expect(onAction).toHaveBeenCalledWith("unblock");
  });

  it("offers only safe cleanup when the other user blocked the viewer", async () => {
    const onAction = vi.fn();
    const following = renderWithI18n(
      <UserMenu user={{ ...user, blockedMe: true, isFollowing: true }} onAction={onAction} />,
    );

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Block" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unfollow" }));
    expect(onAction).toHaveBeenCalledWith("unfollow");

    following.unmount();
    renderWithI18n(
      <UserMenu user={{ ...user, blockedMe: true, isFollowing: false }} onAction={onAction} />,
    );
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Unfollow" })).toBeNull();
  });

  it("disables actions while another mutation is pending", async () => {
    const onAction = vi.fn();
    renderWithI18n(<UserMenu user={user} busy canSendFriendRequest onAction={onAction} />);

    await openMenu();
    const follow = screen.getByRole("menuitem", { name: "Follow" });
    const friendRequest = screen.getByRole("menuitem", { name: "Send friend request" });
    expect(follow.hasAttribute("data-disabled")).toBe(true);
    expect(friendRequest.hasAttribute("data-disabled")).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });
});
