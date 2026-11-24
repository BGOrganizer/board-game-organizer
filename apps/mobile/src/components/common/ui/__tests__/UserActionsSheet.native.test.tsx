import type { ContactUser } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { UserActionsSheet } from "../UserActionsSheet";

const io = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: io.push }) }));
const user: ContactUser = {
  id: "friend",
  name: "Friend Player",
  username: "friend",
  email: "friend@fixture.test",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
};
const make = () => ({
  onClose: vi.fn(),
  onAction: vi.fn(async () => undefined),
});
afterEach(() => {
  io.push.mockClear();
  vi.restoreAllMocks();
});

// Real HeroUI ConfirmDialog is visible and receives real user events. Gorhom
// menu assertions below concern rendered state/controlled callbacks only: its
// worklet-driven physical opening/tappability still requires device acceptance.
it.each([
  ["Accept", "accept_friend_request"],
  ["Decline", "reject_friend_request"],
] as const)(
  "offers one explicit %s decision for an incoming request without acting on entry",
  async (label, key) => {
    const callbacks = make();
    await render(
      <UserActionsSheet
        visible
        user={user}
        friendRequest="incoming"
        initialConfirmAction="respond_friend_request"
        {...callbacks}
      />,
      { wrapper: NativeTestProviders },
    );
    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText("Respond to friend request")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    await userEvent.setup().press(within(dialog).getByRole("button", { name: label }));
    expect(callbacks.onAction).toHaveBeenCalledExactlyOnceWith(key);
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(io.push).not.toHaveBeenCalled();
  },
);

it("keeps both pending decisions and cancellation disabled until the current operation ends", async () => {
  const callbacks = make();
  const view = await render(
    <UserActionsSheet
      visible
      user={user}
      busy
      initialConfirmAction="respond_friend_request"
      {...callbacks}
    />,
    { wrapper: NativeTestProviders },
  );
  for (const name of ["Accept", "Decline", "Cancel"]) {
    const action = within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name });
    expect(action).toBeDisabled();
    await userEvent.setup().press(action);
  }
  expect(callbacks.onAction).not.toHaveBeenCalled();
  expect(callbacks.onClose).not.toHaveBeenCalled();
  await view.rerender(
    <UserActionsSheet
      visible
      user={user}
      initialConfirmAction="respond_friend_request"
      {...callbacks}
    />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Accept" }));
  expect(callbacks.onAction).toHaveBeenCalledExactlyOnceWith("accept_friend_request");
});

it("cancels the combined decision back to the actual incoming-request menu without granting consent", async () => {
  const callbacks = make();
  await render(
    <UserActionsSheet
      visible
      user={user}
      friendRequest="incoming"
      initialConfirmAction="respond_friend_request"
      {...callbacks}
    />,
    { wrapper: NativeTestProviders },
  );
  await userEvent.setup().press(screen.getByTestId("cancel-confirmation-btn"));
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Accept friend request",
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "Decline friend request",
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(callbacks.onAction).not.toHaveBeenCalled();
  expect(callbacks.onClose).not.toHaveBeenCalled();
});

it("leaves rejected action feedback to its caller and closes once without an unhandled rejection", async () => {
  const callbacks = make();
  callbacks.onAction.mockRejectedValueOnce(new Error("Authoritative mutation failure"));
  await render(<UserActionsSheet visible user={user} {...callbacks} />, {
    wrapper: NativeTestProviders,
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Follow", includeHiddenElements: true }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(callbacks.onAction).toHaveBeenCalledExactlyOnceWith("follow");
  expect(callbacks.onClose).toHaveBeenCalledOnce();
  expect(io.push).not.toHaveBeenCalled();
});

it("uses the custom block intent and match consequence only inside its explicit confirmation", async () => {
  const callbacks = make();
  await render(
    <UserActionsSheet
      visible
      user={user}
      initialConfirmAction="block"
      blockLabel="Block globally"
      matchContext
      {...callbacks}
    />,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
  expect(
    screen.getByText(/Players remain in this match until they leave or are removed/),
  ).toBeVisible();
  expect(callbacks.onAction).not.toHaveBeenCalled();
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Block globally",
    }),
  );
  expect(callbacks.onAction).toHaveBeenCalledExactlyOnceWith("block");
});

it("clears an initial decision when ownership changes or the sheet is no longer selected", async () => {
  const callbacks = make();
  const view = await render(
    <UserActionsSheet
      visible
      user={user}
      initialConfirmAction="respond_friend_request"
      {...callbacks}
    />,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
  await view.rerender(
    <UserActionsSheet
      visible
      user={{ ...user, id: "other", name: "Other Player" }}
      {...callbacks}
    />,
  );
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(screen.getByText("Other Player", { includeHiddenElements: true })).toBeOnTheScreen();
  await view.rerender(
    <UserActionsSheet visible={false} user={null} initialConfirmAction="block" {...callbacks} />,
  );
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(screen.queryByRole("button", { includeHiddenElements: true })).toBeNull();
  expect(callbacks.onAction).not.toHaveBeenCalled();
  expect(callbacks.onClose).not.toHaveBeenCalled();
});

it("routes to the currently selected person's profile without creating a social mutation", async () => {
  const callbacks = make();
  const view = await render(<UserActionsSheet visible user={null} {...callbacks} />, {
    wrapper: NativeTestProviders,
  });
  expect(screen.queryByText(user.name, { includeHiddenElements: true })).toBeNull();
  await view.rerender(<UserActionsSheet visible user={user} busy {...callbacks} />);
  const pending = screen.getByRole("button", { name: "View profile", includeHiddenElements: true });
  expect(pending).toBeDisabled();
  await fireEvent.press(pending);
  expect(io.push).not.toHaveBeenCalled();
  expect(callbacks.onClose).not.toHaveBeenCalled();

  const replacement = { ...user, id: "newly-selected" };
  await view.rerender(<UserActionsSheet visible user={replacement} {...callbacks} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "View profile", includeHiddenElements: true }),
  );
  expect(io.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/user/[userId]",
    params: { userId: replacement.id },
  });
  expect(callbacks.onAction).not.toHaveBeenCalled();
  expect(callbacks.onClose).toHaveBeenCalledOnce();
});

it.each([
  { patch: { blockedByMe: true }, menu: "Unblock", confirmation: "Unblock", key: "unblock" },
  {
    patch: { isFriend: true },
    menu: "Remove friend",
    confirmation: "Remove friend",
    key: "unfriend",
  },
] as const)(
  "demands explicit $key confirmation after selection in the native menu",
  async (intent) => {
    const callbacks = make();
    await render(<UserActionsSheet visible user={{ ...user, ...intent.patch }} {...callbacks} />, {
      wrapper: NativeTestProviders,
    });
    if ("blockedByMe" in intent.patch)
      expect(
        screen.queryByRole("button", { name: "View profile", includeHiddenElements: true }),
      ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: intent.menu, includeHiddenElements: true }),
    );
    const confirm = within(screen.getByTestId("confirmation-dialog"));
    expect(callbacks.onAction).not.toHaveBeenCalled();
    await userEvent.setup().press(confirm.getByRole("button", { name: intent.confirmation }));
    expect(callbacks.onAction).toHaveBeenCalledExactlyOnceWith(intent.key);
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  },
);

it.each([true, false])(
  "honors a real native backdrop dismissal only when the user action is idle (busy=%s)",
  async (busy) => {
    const callbacks = make();
    await render(<UserActionsSheet visible user={user} busy={busy} {...callbacks} />, {
      wrapper: NativeTestProviders,
    });
    const overlays = screen.container.queryAll(
      (node) =>
        typeof node.props.onStartShouldSetResponder === "function" &&
        StyleSheet.flatten(node.props.style)?.position === "absolute",
    );
    expect(overlays).toHaveLength(1);
    await userEvent.setup().press(overlays[0]);
    expect(callbacks.onClose).toHaveBeenCalledTimes(busy ? 0 : 1);
    expect(callbacks.onAction).not.toHaveBeenCalled();
    expect(io.push).not.toHaveBeenCalled();
  },
);
