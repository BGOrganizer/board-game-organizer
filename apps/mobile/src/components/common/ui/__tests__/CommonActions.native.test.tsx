import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { LockKeyhole, UsersRound } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { FormSubmitButton } from "../FormSubmitButton";
import { HelpPopover } from "../HelpPopover";
import { IconBadge } from "../IconBadge";
import { InvitationActions } from "../InvitationActions";
import { LinkedListCard } from "../LinkedListCard";
import { ListCardCoverContent } from "../ListCardCoverContent";
import { UserListRow } from "../UserListRow";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

describe("native common actions", () => {
  it("dispatches independent invitation decisions and disables both actions while pending", async () => {
    const accept = vi.fn(),
      decline = vi.fn();
    const view = await render(
      <InvitationActions
        placement="card"
        name="Alice"
        pending={false}
        onAccept={accept}
        onDecline={decline}
      />,
      { wrapper: NativeTestProviders },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept: Alice" }));
    await fireEvent.press(screen.getByRole("button", { name: "Decline: Alice" }));
    expect(accept).toHaveBeenCalledTimes(1);
    expect(decline).toHaveBeenCalledTimes(1);
    await view.rerender(
      <InvitationActions
        placement="detail"
        pending
        onAccept={accept}
        onDecline={decline}
        acceptLabel="Join"
        declineLabel="Leave"
      />,
    );
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Join" }));
    await fireEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(accept).toHaveBeenCalledTimes(1);
    expect(decline).toHaveBeenCalledTimes(1);
  });

  it("presents a noninteractive badge as an image, with the same 22dp chip size for multiple facts", async () => {
    const view = await render(
      <IconBadge testID="role-badge" icon={UsersRound} label="Participant" />,
      { wrapper: NativeTestProviders },
    );
    expect(screen.getByRole("image", { name: "Participant" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("role-badge", { includeHiddenElements: true })).toHaveStyle({
      width: 22,
      height: 22,
    });
    await view.rerender(
      <IconBadge
        testID="role-badge"
        icon={UsersRound}
        label="Participant and moderator"
        multiple
        color="warning"
      />,
    );
    expect(screen.getByRole("image", { name: "Participant and moderator" })).toBeTruthy();
    expect(screen.getByTestId("role-badge", { includeHiddenElements: true })).toHaveStyle({
      width: 22,
      height: 22,
    });
  });

  it("runs an icon action without propagating to its user row and respects a disabled state", async () => {
    const onPress = vi.fn(),
      stopPropagation = vi.fn();
    const view = await render(
      <IconBadge icon={LockKeyhole} label="Lock seat" onPress={onPress} testID="lock-badge" />,
      { wrapper: NativeTestProviders },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Lock seat" }), { stopPropagation });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    await view.rerender(
      <IconBadge
        icon={LockKeyhole}
        label="Lock seat"
        onPress={onPress}
        isDisabled
        color="danger"
      />,
    );
    expect(screen.getByRole("button", { name: "Lock seat" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Lock seat" }), { stopPropagation });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("opens an icon's explanatory popover", async () => {
    await render(
      <IconBadge icon={UsersRound} label="Participant" title="Roles and participation" multiple>
        <Text>Participant accepted</Text>
      </IconBadge>,
      { wrapper: NativeTestProviders },
    );
    expect(screen.queryByText("Participant accepted")).toBeNull();
    await pressMeasuredPopover(screen.getByRole("button", { name: "Participant" }));
    expect(await screen.findByRole("heading", { name: "Roles and participation" })).toBeTruthy();
    expect(screen.getByText("Participant accepted")).toBeTruthy();
  });

  it.each([
    ["default", "ghost"],
    ["compact", "primary"],
    ["compact", "danger-soft"],
    ["default", "danger"],
  ] as const)("opens %s %s help using the actual HeroUI popover", async (size, triggerVariant) => {
    const onOpenChange = vi.fn();
    await render(
      <HelpPopover
        label="Explain voting"
        title="Voting"
        size={size}
        triggerVariant={triggerVariant}
        tone="warning"
        indicator={<Text>New</Text>}
        onOpenChange={onOpenChange}
      >
        <Text>Choose at least one positive preference.</Text>
      </HelpPopover>,
      { wrapper: NativeTestProviders },
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: "Explain voting" }));
    expect(await screen.findByRole("heading", { name: "Voting" })).toBeTruthy();
    expect(screen.getByText("Choose at least one positive preference.")).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("supports help content without a separate title", async () => {
    await render(
      <HelpPopover label="Explain privacy">
        <Text>Only invited participants can join.</Text>
      </HelpPopover>,
      { wrapper: NativeTestProviders },
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: "Explain privacy" }));
    expect(await screen.findByText("Only invited participants can join.")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it.each(["thumbnail", "cover"] as const)(
    "keeps navigation and controls independent in a %s linked card",
    async (artworkLayout) => {
      const open = vi.fn(),
        control = vi.fn();
      const view = await render(
        <LinkedListCard
          label="Open event"
          onPress={open}
          artwork={<Text>Artwork</Text>}
          heading={<Text>Planning evening</Text>}
          artworkLayout={artworkLayout}
          notificationCount={2}
          leadingActions={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inspect role"
              onPress={control}
            >
              <Text>Role</Text>
            </Pressable>
          }
          actions={<Text>Extra control</Text>}
        >
          <Text>Six participants</Text>
        </LinkedListCard>,
        { wrapper: NativeTestProviders },
      );
      const link = screen.getByRole("button", { name: "Open event" });
      expect(link).toHaveAccessibilityValue({ text: "Unread updates" });
      await fireEvent.press(link);
      expect(open).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByRole("button", { name: "Inspect role" }));
      expect(control).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledTimes(1);
      await view.rerender(
        <LinkedListCard
          label="Open event"
          onPress={open}
          disabled
          artwork={<Text>Artwork</Text>}
          artworkLayout={artworkLayout}
          controlsDisabled
        >
          <Text>No seat available</Text>
        </LinkedListCard>,
      );
      expect(screen.getByRole("button", { name: "Open event" })).toBeDisabled();
      expect(screen.getByText("No seat available")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Inspect role" })).toBeNull();
    },
  );

  it("renders cover controls only when supplied and hides disabled controls from accessibility", async () => {
    const action = (
      <Pressable accessibilityRole="button" accessibilityLabel="Role details">
        <Text>Role</Text>
      </Pressable>
    );
    const view = await render(
      <ListCardCoverContent artwork={<Text>Artwork</Text>}>
        <Text>Four seats</Text>
      </ListCardCoverContent>,
      { wrapper: NativeTestProviders },
    );
    expect(screen.queryByTestId("card-controls")).toBeNull();
    await view.rerender(
      <ListCardCoverContent
        artwork={<Text>Artwork</Text>}
        heading={<Text>Friday game</Text>}
        controls={action}
      >
        <Text>Four seats</Text>
      </ListCardCoverContent>,
    );
    expect(screen.getByText("Friday game")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Role details" })).toBeTruthy();
    await view.rerender(
      <ListCardCoverContent artwork={<Text>Artwork</Text>} controls={action} controlsDisabled>
        <Text>Four seats</Text>
      </ListCardCoverContent>,
    );
    expect(screen.queryByRole("button", { name: "Role details" })).toBeNull();
    expect(screen.getByText("Four seats")).toBeTruthy();
  });

  it("runs a submit button outside a form interaction scope", async () => {
    const onPress = vi.fn();
    const view = await render(
      <FormSubmitButton accessibilityLabel="Save changes" onPress={onPress}>
        <Text>Save</Text>
      </FormSubmitButton>,
      { wrapper: NativeTestProviders },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(
      <FormSubmitButton accessibilityLabel="Save changes">
        <Text>Save</Text>
      </FormSubmitButton>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("preserves a user's accessible identity and separates row navigation from sibling actions", async () => {
    const open = vi.fn(),
      action = vi.fn();
    const view = await render(
      <UserListRow
        name="Alice"
        secondary="@alice"
        accessibilityLabel="Open Alice"
        onPress={open}
        online
        titleAccessory={<Text>Organizer</Text>}
        actions={
          <Pressable accessibilityRole="button" accessibilityLabel="Invite Alice" onPress={action}>
            <Text>Invite</Text>
          </Pressable>
        }
      >
        <Text>Accepted participant</Text>
      </UserListRow>,
      { wrapper: NativeTestProviders },
    );
    expect(screen.getByText("@alice")).toBeTruthy();
    expect(screen.getByText("Organizer")).toBeTruthy();
    expect(screen.getByText("Accepted participant")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open Alice" }));
    await fireEvent.press(screen.getByRole("button", { name: "Invite Alice" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    await view.rerender(<UserListRow name="Alice" onPress={open} isDisabled online={false} />);
    expect(screen.getByRole("button", { name: "Alice" })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Alice" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("@alice")).toBeNull();
    await view.rerender(<UserListRow name="Alice" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
