import type { ContactUser } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { act, screen, userEvent, within } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupBanDialog } from "@/components/common/ui/GroupBanDialog";
import { UserActionsSheet } from "@/components/common/ui/UserActionsSheet";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sdk = vi.hoisted(() => ({ open: vi.fn(), dismiss: vi.fn(), push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: sdk.push }) }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: sdk.open, dismiss: sdk.dismiss },
}));

type NativePickerOptions = Parameters<
  typeof import("@react-native-community/datetimepicker").DateTimePickerAndroid.open
>[0];
const user: ContactUser = {
  id: "friend",
  username: "friend",
  name: "Friend Player",
  email: "friend@fixture.test",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2030-01-01T00:00:00.000Z");
});
afterEach(() => vi.useRealTimers());

async function chooseDateTime(label: string, date: string) {
  await userEvent.setup().press(screen.getByRole("button", { name: label }));
  const options = sdk.open.mock.lastCall?.[0] as NativePickerOptions | undefined;
  if (!options?.onChange) throw new Error("Expected the actual native date/time selection");
  const value = new Date(date);
  await act(() =>
    options.onChange?.(
      { type: "set", nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } },
      value,
    ),
  );
}

it("GroupBanDialog: select a temporary ban deadline in the group's time zone", async () => {
  const confirm = vi.fn();
  const cancel = vi.fn();
  const result = await measureRenders(
    <GroupBanDialog
      name="Player One"
      busy={false}
      timeZone="Europe/Rome"
      onConfirm={confirm}
      onCancel={cancel}
    />,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        sdk.open.mockClear();
        confirm.mockClear();
        cancel.mockClear();
      },
      scenario: async () => {
        expect(screen.queryByRole("button", { name: "Excluded until" })).toBeNull();
        await userEvent.setup().press(screen.getByRole("switch", { name: "Temporary exclusion" }));
        await chooseDateTime("Excluded until", "2030-01-03T05:00:00.000Z");
        await chooseDateTime("Time", "2030-01-03T12:30:00.000Z");
        expect(confirm).not.toHaveBeenCalled();
        await userEvent.setup().press(
          within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
            name: "Ban from group",
          }),
        );
        expect(confirm).toHaveBeenCalledExactlyOnceWith("2030-01-03T11:30:00.000Z");
        expect(cancel).not.toHaveBeenCalled();
      },
    },
  );
  assertRenderMeasurement(result);
});

it("UserActionsSheet: confirm a friend request explicitly without an initial mutation", async () => {
  const close = vi.fn();
  const action = vi.fn(async () => undefined);
  const result = await measureRenders(
    <UserActionsSheet
      visible
      user={user}
      friendRequest="incoming"
      initialConfirmAction="respond_friend_request"
      onClose={close}
      onAction={action}
    />,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        close.mockClear();
        action.mockClear();
        sdk.push.mockClear();
      },
      scenario: async () => {
        const dialog = within(screen.getByTestId("confirmation-dialog"));
        expect(dialog.getByText("Respond to friend request")).toBeVisible();
        expect(action).not.toHaveBeenCalled();
        await userEvent.setup().press(dialog.getByRole("button", { name: "Accept" }));
        expect(action).toHaveBeenCalledExactlyOnceWith("accept_friend_request");
        expect(close).toHaveBeenCalledOnce();
        expect(sdk.push).not.toHaveBeenCalled();
      },
    },
  );
  assertRenderMeasurement(result);
});
