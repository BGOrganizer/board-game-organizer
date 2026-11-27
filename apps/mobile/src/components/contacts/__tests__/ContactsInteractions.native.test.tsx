import type { ContactUser } from "@board-game-organizer/shared";
import { act, fireEvent, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { expect, it } from "vitest";
import {
  contactPress,
  contactsApi,
  contactsBoundary,
  contactsFixture,
  contactsReady,
  contactTab,
  fixtureJson,
  fixtureUser,
  relationship,
  renderContacts,
  socialWrites,
} from "./contactsScreenFixture";

async function confirmContactAction(name: string) {
  const dialog = await screen.findByTestId("confirmation-dialog");
  expect(dialog).toBeVisible();
  await userEvent.setup().press(within(dialog).getByRole("button", { name }));
}

const cases: {
  type: string;
  flags: Partial<ContactUser>;
  action: string;
  confirmation?: string;
  method: string;
  relationshipType?: string;
  decision?: string;
}[] = [
  {
    type: "followers",
    flags: { isFollower: true },
    action: "Follow",
    method: "POST",
    relationshipType: "follow",
  },
  {
    type: "following",
    flags: { isFollowing: true },
    action: "Unfollow",
    method: "DELETE",
    relationshipType: "follow",
  },
  {
    type: "friends",
    flags: { isFriend: true, isFollowing: true },
    action: "Remove friend",
    confirmation: "Remove friend",
    method: "DELETE",
    relationshipType: "friend",
  },
  {
    type: "followers",
    flags: { isFollower: true },
    action: "Send friend request",
    confirmation: "Send request",
    method: "POST",
    relationshipType: "friend_request",
  },
  {
    type: "sent",
    flags: {},
    action: "Cancel friend request",
    confirmation: "Cancel request",
    method: "DELETE",
    relationshipType: "friend_request",
  },
  {
    type: "pending",
    flags: {},
    action: "Accept friend request",
    confirmation: "Accept",
    method: "PATCH",
    decision: "accept",
  },
  {
    type: "pending",
    flags: {},
    action: "Decline friend request",
    confirmation: "Decline",
    method: "PATCH",
    decision: "reject",
  },
  {
    type: "followers",
    flags: { isFollower: true },
    action: "Block",
    confirmation: "Block",
    method: "POST",
    relationshipType: "block",
  },
  {
    type: "blocked",
    flags: { blockedByMe: true },
    action: "Unblock",
    confirmation: "Unblock",
    method: "DELETE",
    relationshipType: "block",
  },
];

it.each(cases)(
  "dispatches $action through the real actions sheet, confirmation and owned mutation",
  async (test) => {
    contactsFixture.target = fixtureUser(test.flags);
    relationship(test.type);
    if (test.type === "pending" || test.type === "sent") contactsBoundary.parameter = "requests";
    await renderContacts();
    await contactsReady();
    expect(await screen.findByText("@target-player")).toBeVisible();
    await contactPress("Actions: Target Player");
    await contactPress(test.action);
    if (test.confirmation) {
      expect(socialWrites()).toHaveLength(0);
      await confirmContactAction(test.confirmation);
    }
    await waitFor(() => expect(socialWrites()).toHaveLength(1));
    const write = socialWrites()[0];
    expect(write.method).toBe(test.method);
    expect(write.authorization).toBe("Bearer fixture-session-token");
    if (test.relationshipType) {
      expect(write.path).toBe("/api/relationships");
      expect(new URLSearchParams(write.query).get("type")).toBe(test.relationshipType);
      expect(write.input).toEqual({ targetUserId: "target" });
    } else {
      expect(write.path).toBe("/api/friend-requests/target");
      expect(write.input).toEqual({ decision: test.decision });
    }
  },
);

it("cancels destructive confirmation without mutating, then keeps the selected user available in the real menu", async () => {
  contactsFixture.target = fixtureUser({ isFriend: true });
  relationship("friends");
  await renderContacts();
  await contactsReady();
  await contactPress("Actions: Target Player");
  await contactPress("Remove friend");
  expect(screen.getByText(/The friendship and your follow will be removed/)).toBeVisible();
  await confirmContactAction("Cancel");
  // Gorhom motion does not execute in Node: assert menu state, not physical visibility.
  expect(screen.getByRole("button", { name: "Remove friend" })).toBeOnTheScreen();
  expect(socialWrites()).toHaveLength(0);
  await contactPress("Cancel");
  expect(screen.getByRole("button", { name: "Actions: Target Player" })).toBeVisible();
});

it("opens the current user's profile route deliberately without calling any relationship endpoint", async () => {
  contactsFixture.target = fixtureUser({ isFollower: true });
  relationship("followers");
  await renderContacts();
  await contactsReady();
  await contactPress("Actions: Target Player");
  await contactPress("View profile");
  expect(contactsBoundary.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/user/[userId]",
    params: { userId: "target" },
  });
  expect(socialWrites()).toHaveLength(0);
});

it("keeps only authorized unblock actions in rendered sheet state for a blocked contact and never exposes profile navigation", async () => {
  contactsFixture.target = fixtureUser({ blockedByMe: true });
  relationship("blocked");
  await renderContacts();
  await contactsReady();
  await contactPress("Actions: Target Player");
  // State-only: Gorhom opacity remains zero without its native animation host.
  expect(screen.getByRole("button", { name: "Unblock" })).toBeOnTheScreen();
  for (const name of ["View profile", "Follow", "Send friend request"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(contactsBoundary.push).not.toHaveBeenCalled();
});

it("uses the latest session token for a social mutation rather than the screen's earlier token snapshot", async () => {
  contactsFixture.target = fixtureUser({ isFollower: true });
  relationship("followers");
  await renderContacts();
  await contactsReady();
  contactsBoundary.token = "rotated-fixture-token";
  await contactPress("Actions: Target Player");
  await contactPress("Follow");
  await waitFor(() => expect(socialWrites()).toHaveLength(1));
  expect(socialWrites()[0].authorization).toBe("Bearer rotated-fixture-token");
});

it("disables all actions for the same user while the actual optimistic write is in flight", async () => {
  let finish: (response: Response) => void = () => {};
  contactsFixture.pendingAction = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  contactsFixture.target = fixtureUser({ isFollower: true });
  relationship("followers");
  await renderContacts();
  await contactsReady();
  await contactPress("Actions: Target Player");
  await contactPress("Follow");
  await waitFor(() => expect(socialWrites()).toHaveLength(1));
  await contactPress("Actions: Target Player");
  expect(screen.getByRole("button", { name: "Unfollow" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Block" })).toBeDisabled();
  await contactPress("Unfollow");
  expect(socialWrites()).toHaveLength(1);
  await act(() => finish(fixtureJson({ success: true })));
});

it("rolls back rejected relationship changes and leaves their action retryable", async () => {
  contactsFixture.actionStatus = 400;
  contactsFixture.target = fixtureUser({ isFollower: true, isFollowing: false });
  relationship("followers");
  await renderContacts();
  await contactsReady();
  await contactPress("Actions: Target Player");
  await contactPress("Follow");
  await waitFor(() => {
    const failed = contactsFixture.client
      ?.getMutationCache()
      .findAll({ status: "error" })
      .some((mutation) => mutation.options.mutationKey?.at(-1) === "follow");
    expect(failed).toBe(true);
  });
  await contactPress("Actions: Target Player");
  expect(screen.getByRole("button", { name: "Follow" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Unfollow" })).toBeNull();
});

it("keeps connection read errors explicit and retries the failed list without inventing an empty success", async () => {
  contactsFixture.relationshipStatus.set("followers", 503);
  relationship("followers", fixtureUser({ isFollower: true }));
  await renderContacts();
  expect(await screen.findByText("Could not load contacts")).toBeVisible();
  expect(screen.queryByText("No connections yet")).toBeNull();
  contactsFixture.relationshipStatus.delete("followers");
  await contactPress("Retry");
  expect(await screen.findByText("Target Player")).toBeVisible();
  expect(screen.queryByText("Could not load contacts")).toBeNull();
});

it("paginates a connection source through the real list control and keeps previous identities", async () => {
  relationship("followers", fixtureUser({ isFollower: true }));
  contactsFixture.cursors.set("followers", "next-followers");
  contactsFixture.nextRelationships.set("followers", [
    {
      fromUserId: "next",
      toUserId: "owner",
      profile: fixtureUser({
        id: "next",
        name: "Next Player",
        username: "next-player",
        isFollower: true,
      }),
    },
  ]);
  await renderContacts();
  await contactsReady();
  await contactPress("Load more");
  expect(await screen.findByText("Next Player")).toBeVisible();
  expect(screen.getByText("Target Player")).toBeVisible();
  expect(
    contactsFixture.reads.some(
      (url) =>
        url.pathname === "/api/relationships" &&
        url.searchParams.get("cursor") === "next-followers",
    ),
  ).toBe(true);
});

it("debounces real user discovery, distinguishes failures and empty results, and clears search on Back", async () => {
  await renderContacts();
  await contactsReady();
  await contactTab("search");
  await fireEvent(screen.getByTestId("contact-search-input"), "focus");
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Tar");
  expect(contactsFixture.reads.filter((url) => url.pathname === "/api/users/search")).toHaveLength(
    0,
  );
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Target");
  expect(await screen.findByText("Target Player")).toBeVisible();
  await contactPress("Back");
  await contactTab("connections");
  await contactTab("search");
  expect(screen.getByTestId("contact-search-input")).toHaveDisplayValue("");
  await fireEvent(screen.getByTestId("contact-search-input"), "focus");
  contactsFixture.searchStatus = 503;
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Failure");
  expect(await screen.findByText("Could not load contacts")).toBeVisible();
  expect(screen.queryByText("No users found")).toBeNull();
  contactsFixture.searchStatus = 200;
  contactsFixture.searchEmpty = true;
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Empty result");
  expect(await screen.findByText("No users found")).toBeVisible();
  await contactPress("Clear search");
  expect(screen.getByTestId("contact-search-input")).toHaveDisplayValue("");
  expect(screen.queryByText("No users found")).toBeNull();
  expect(
    contactsFixture.client?.getQueryState([
      "contacts",
      "search:Empty result",
      contactsApi,
      "owner",
      "pages",
    ])?.status,
  ).toBe("success");
});

it("omits redacted pending and sent profiles without exposing an action, while retaining visible requests", async () => {
  const known = fixtureUser({ id: "known", name: "Known Friend", username: "known" });
  contactsFixture.relationships.set("pending", [
    { fromUserId: "redacted-incoming", toUserId: "owner", profile: null },
  ]);
  contactsFixture.relationships.set("sent", [
    { fromUserId: "owner", toUserId: "redacted-outgoing", profile: null },
  ]);
  relationship("pending", known);
  contactsBoundary.parameter = "requests";
  await renderContacts();
  await contactsReady();
  expect(await screen.findByText("@known")).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions: Known Friend" })).toBeEnabled();
  expect(screen.getAllByRole("button", { name: /^Actions:/ })).toHaveLength(1);
  expect(screen.queryByText(/redacted-(incoming|outgoing)/)).toBeNull();
  expect(socialWrites()).toEqual([]);
});
