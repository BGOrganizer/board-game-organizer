import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Dices, UsersRound } from "lucide-react-native";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { AddUserRow } from "../AddUserRow";
import { ClientRecordBadge, useClientRecordStatus } from "../ClientRecordBadge";
import { DateTimeInfo } from "../DateTimeInfo";
import { EmptyList } from "../EmptyList";
import { GroupedList } from "../GroupedList";
import { GroupedRow } from "../GroupedRow";
import { GuestNameRow } from "../GuestNameRow";
import { ListCard } from "../ListCard";
import { ListCardBody } from "../ListCardBody";
import { NotificationCountBadge } from "../NotificationCountBadge";
import { NotificationUnreadDot } from "../NotificationUnreadDot";
import { PendingArtworkBadge } from "../PendingArtworkBadge";
import { RankPositionBadge } from "../RankPositionBadge";
import { WizardSteps } from "../WizardSteps";

function RecordStatus({ phase }: { phase?: "saving" | "verifying" | "failed" }) {
  return <Text>{useClientRecordStatus(phase) || "No pending changes"}</Text>;
}

describe("native common presentation components", () => {
  it("shows an empty-state message while keeping the decorative icon out of accessibility", async () => {
    await render(<EmptyList icon={<Text>Decorative icon</Text>}>No tables found</EmptyList>, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByText("No tables found")).toBeTruthy();
    expect(screen.queryByText("Decorative icon")).toBeNull();
  });

  it("exposes the title as a heading", async () => {
    const view = await render(<HeaderTitle title="Group members" icon={UsersRound} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByRole("header", { name: "Group members" })).toBeTruthy();
    await view.rerender(<HeaderTitle title="Group events" icon={Dices} />);
    expect(screen.getByRole("header", { name: "Group events" })).toBeTruthy();
    expect(screen.queryByText("Group members")).toBeNull();
  });

  it("renders no grouped list for no rows, and preserves rows across segmented list variants", async () => {
    const view = await render(<GroupedList>{null}</GroupedList>, { wrapper: NativeTestProviders });
    expect(screen.queryByTestId("first-row")).toBeNull();
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.queryByText("Bob")).toBeNull();
    for (const segment of [
      undefined,
      { index: 0, count: 2 },
      { index: 1, count: 3 },
      { index: 1, count: 2 },
    ]) {
      await view.rerender(
        <GroupedList segment={segment}>
          <GroupedRow testID="first-row">
            <Text>Alice</Text>
          </GroupedRow>
          <GroupedRow testID="second-row">
            <Text>Bob</Text>
          </GroupedRow>
        </GroupedList>,
      );
      expect(screen.getByTestId("first-row")).toBeTruthy();
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
    }
  });

  it("preserves a plain card's children and adds a noninteractive background when supplied", async () => {
    const view = await render(
      <ListCard>
        <Text>Card content</Text>
      </ListCard>,
      {
        wrapper: NativeTestProviders,
      },
    );
    expect(screen.getByText("Card content")).toBeTruthy();
    expect(screen.queryByTestId("card-background")).toBeNull();
    await view.rerender(
      <ListCard background={<Text>Generated artwork</Text>}>
        <Text>Card content</Text>
      </ListCard>,
    );
    expect(screen.getByTestId("card-background").props.pointerEvents).toBe("none");
    expect(screen.getByText("Card content")).toBeTruthy();
  });

  it("updates card facts, accessories and unread state without retaining stale values", async () => {
    const view = await render(<ListCardBody title="Original event" />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByText("Original event")).toBeTruthy();
    expect(screen.queryByLabelText("Unread updates")).toBeNull();
    await view.rerender(
      <ListCardBody
        title="Updated event"
        titleIcon={<Text>Calendar icon</Text>}
        titleAccessory={<Text>Private</Text>}
        unread
      >
        <Text>Six participants</Text>
      </ListCardBody>,
    );
    expect(screen.getByText("Updated event")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.getByText("Six participants")).toBeTruthy();
    expect(screen.getByLabelText("Unread updates")).toBeTruthy();
    expect(screen.queryByText("Original event")).toBeNull();
  });

  it("shows an unread dot only while there are unread updates", async () => {
    const view = await render(<NotificationUnreadDot active={false} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.queryByLabelText("Unread updates")).toBeNull();
    await view.rerender(<NotificationUnreadDot active />);
    expect(screen.getByRole("image", { name: "Unread updates" })).toBeTruthy();
    await view.rerender(<NotificationUnreadDot active={false} />);
    expect(screen.queryByLabelText("Unread updates")).toBeNull();
  });

  it("omits zero or missing notification counts and distinguishes counted badges from attention dots", async () => {
    const view = await render(<NotificationCountBadge />, { wrapper: NativeTestProviders });
    expect(screen.queryByLabelText("Needs attention")).toBeNull();
    await view.rerender(<NotificationCountBadge count={0} corner counted />);
    expect(screen.queryByText("0")).toBeNull();
    await view.rerender(<NotificationCountBadge count={3} corner />);
    expect(screen.getByLabelText("Needs attention")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
    await view.rerender(<NotificationCountBadge count={3} counted />);
    expect(screen.getByLabelText("Notifications: 3")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    await view.rerender(<NotificationCountBadge count={120} counted corner />);
    expect(screen.getByLabelText("Notifications: 120")).toBeTruthy();
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it.each(["invitation", "request"] as const)("labels a pending %s artwork badge", async (kind) => {
    await render(<PendingArtworkBadge kind={kind} label={`Pending ${kind}`} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByRole("image", { name: `Pending ${kind}` })).toBeTruthy();
  });

  it.each([
    ["saving", "Saving"],
    ["verifying", "Verifying"],
    ["failed", "Not saved"],
  ] as const)("shows the %s record phase in text and icon-only modes", async (phase, label) => {
    const view = await render(<ClientRecordBadge phase={phase} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByText(label)).toBeTruthy();
    await view.rerender(<ClientRecordBadge phase={phase} iconOnly />);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("does not show a record status when the record has no pending operation", async () => {
    const view = await render(<ClientRecordBadge />, { wrapper: NativeTestProviders });
    expect(screen.queryByText("Saving")).toBeNull();
    await view.rerender(<ClientRecordBadge iconOnly />);
    expect(screen.queryByLabelText("Saving")).toBeNull();
  });

  it.each([
    [undefined, "No pending changes"],
    ["saving", "Saving"],
    ["verifying", "Checking saved changes"],
    ["failed", "Not saved. Edit draft"],
  ] as const)("describes a record status %s", async (phase, label) => {
    await render(<RecordStatus phase={phase} />, { wrapper: NativeTestProviders });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("formats explicit-timezone date, start/end times and a custom start label", async () => {
    const startsAt = "2030-06-12T18:00:00.000Z";
    const endsAt = "2030-06-12T20:30:00.000Z";
    const expected = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const view = await render(<DateTimeInfo startsAt={startsAt} timeZone="UTC" />, {
      wrapper: NativeTestProviders,
    });
    expect(
      screen.getByLabelText(`Start time: ${expected.format(new Date(startsAt))}`),
    ).toBeTruthy();
    expect(screen.queryByLabelText(`End time: ${expected.format(new Date(endsAt))}`)).toBeNull();
    await view.rerender(
      <DateTimeInfo
        startsAt={startsAt}
        endsAt={endsAt}
        timeZone="UTC"
        timeLabel="Arrival"
        dateStyle="full"
      />,
    );
    expect(screen.getByLabelText(`Arrival: ${expected.format(new Date(startsAt))}`)).toBeTruthy();
    expect(screen.getByLabelText(`End time: ${expected.format(new Date(endsAt))}`)).toBeTruthy();
    expect(
      screen.getByText(
        new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(
          new Date(startsAt),
        ),
      ),
    ).toBeTruthy();
  });

  it("announces wizard progress and updates it", async () => {
    const view = await render(<WizardSteps current={1} count={3} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByRole("progressbar", { name: "Steps" })).toHaveAccessibilityValue({
      min: 1,
      max: 3,
      now: 1,
    });
    await view.rerender(<WizardSteps current={2} count={3} />);
    expect(screen.getByRole("progressbar", { name: "Steps" })).toHaveAccessibilityValue({
      min: 1,
      max: 3,
      now: 2,
    });
  });

  it("runs the add-user action and respects its disabled state", async () => {
    const onPress = vi.fn();
    const view = await render(
      <AddUserRow
        label="Invite friends"
        description="Generate an invitation"
        onPress={onPress}
        actions={<Text>Copy link</Text>}
      />,
      { wrapper: NativeTestProviders },
    );
    expect(screen.getByText("Generate an invitation")).toBeTruthy();
    expect(screen.getByText("Copy link")).toBeTruthy();
    await userEvent.setup().press(screen.getByRole("button", { name: "Invite friends" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<AddUserRow label="Invite friends" onPress={onPress} isDisabled />);
    await userEvent.setup().press(screen.getByRole("button", { name: "Invite friends" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Generate an invitation")).toBeNull();
  });
});

it("requires a valid guest name for the keyboard action and resets it only once accepted", async () => {
  let accept: (() => void) | undefined;
  const add = vi.fn((_name: string, reset: () => void) => {
    accept = reset;
  });
  await render(<GuestNameRow maxLength={20} onAdd={add} />, {
    wrapper: NativeTestProviders,
  });
  const input = screen.getByLabelText("Guest name");
  const button = screen.getByRole("button", { name: "Add a guest" });
  expect(button).toBeDisabled();
  await fireEvent(input, "submitEditing");
  expect(add).not.toHaveBeenCalled();

  await fireEvent.changeText(input, "  Guest Player  ");
  await fireEvent(input, "submitEditing", { nativeEvent: { text: "  Guest Player  " } });
  expect(add).toHaveBeenCalledExactlyOnceWith("Guest Player", expect.any(Function));
  expect(input).toHaveProp("value", "  Guest Player  ");
  if (!accept) throw new Error("Expected the real acceptance callback from the guest form");
  await act(accept);
  expect(input).toHaveProp("value", "");
  expect(button).toBeDisabled();
});

it("keeps the third-place medal and lower positions accessible without turning them into actions", async () => {
  const view = await render(<RankPositionBadge rank={3} />, { wrapper: NativeTestProviders });
  expect(screen.getByRole("image", { name: "Position: #3" })).toBeOnTheScreen();
  expect(screen.queryByRole("button")).toBeNull();
  await view.rerender(<RankPositionBadge rank={4} />);
  expect(screen.queryByRole("image", { name: "Position: #3" })).toBeNull();
  expect(screen.getByRole("image", { name: "Position: #4" })).toBeOnTheScreen();
  await view.rerender(<RankPositionBadge rank={null} />);
  expect(screen.getByRole("image", { name: "Position: ND" })).toBeOnTheScreen();
});
