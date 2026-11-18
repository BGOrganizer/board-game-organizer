import { act, render, screen, userEvent, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { GroupBanDialog } from "../GroupBanDialog";

type NativePickerOptions = Parameters<
  typeof import("@react-native-community/datetimepicker").DateTimePickerAndroid.open
>[0];
const picker = vi.hoisted(() => ({ open: vi.fn(), dismiss: vi.fn() }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: picker,
}));
const confirm = vi.fn();
const cancel = vi.fn();
const now = "2030-01-01T00:00:00.000Z";

function Fixture(props: Partial<ComponentProps<typeof GroupBanDialog>> = {}) {
  return (
    <NativeTestProviders>
      <GroupBanDialog
        name="Player One"
        busy={false}
        onConfirm={confirm}
        onCancel={cancel}
        {...props}
      />
    </NativeTestProviders>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  // Only the clock is controlled; RN/SDK gesture and animation timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const dialogButton = (name: string) =>
  within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name });
const press = (name: string) => userEvent.setup().press(dialogButton(name));
function expectDialogFailure(message: string) {
  const failure = within(screen.getByTestId("confirmation-dialog")).getByText(message, {
    exact: true,
  });
  expect(failure).toBeVisible();
  expect(failure).toHaveProp("accessibilityRole", "alert");
}
async function temporary() {
  await userEvent.setup().press(screen.getByRole("switch", { name: "Temporary exclusion" }));
}
async function choose(label: string, date: string) {
  await userEvent.setup().press(screen.getByRole("button", { name: label }));
  const options = picker.open.mock.calls.at(-1)?.[0] as NativePickerOptions | undefined;
  if (!options?.onChange)
    throw new Error("Expected the real field to open the native date/time SDK");
  const value = new Date(date);
  await act(() =>
    options.onChange?.(
      { type: "set", nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } },
      value,
    ),
  );
  return options;
}

it("keeps permanent exclusion inert until explicit confirmation and cancellation separate", async () => {
  await render(<Fixture />);
  expect(screen.getByText(/Group exclusion is separate from global blocking/)).toBeVisible();
  expect(screen.getByRole("switch", { name: "Temporary exclusion" })).not.toBeChecked();
  expect(screen.queryByRole("button", { name: "Excluded until" })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  await press("Cancel");
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  // The parent decides whether to unmount; this fixture deliberately remains.
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith(null);
  expect(picker.open).not.toHaveBeenCalled();
});

it("converts the actual native date/time selections in the venue's timezone", async () => {
  await render(<Fixture timeZone="Europe/Rome" />);
  await temporary();
  const day = await choose("Excluded until", "2030-01-03T05:00:00.000Z");
  expect(day.mode).toBe("date");
  const time = await choose("Time", "2030-01-03T12:30:00.000Z");
  expect(time.mode).toBe("time");
  expect(time.timeZoneName).toBe("UTC");
  expect(confirm).not.toHaveBeenCalled();
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith("2030-01-03T11:30:00.000Z");
  expect(
    within(screen.getByTestId("confirmation-dialog")).queryByText(
      "Choose a valid future date and time.",
    ),
  ).toBeNull();
});

it("rejects a past date, preserves the user's selection and clears validation only after a valid confirmation", async () => {
  await render(<Fixture timeZone="Europe/Rome" />);
  await temporary();
  await choose("Excluded until", "2029-12-31T00:00:00.000Z");
  await press("Ban from group");
  expect(screen.getAllByText("Choose a valid future date and time.").length).toBeGreaterThan(0);
  expect(confirm).not.toHaveBeenCalled();
  await choose("Excluded until", "2030-01-04T00:00:00.000Z");
  await choose("Time", "2030-01-04T09:15:00.000Z");
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith("2030-01-04T08:15:00.000Z");
  expect(screen.queryByText("Choose a valid future date and time.")).toBeNull();
});

it("rejects a nonexistent daylight-saving wall time instead of silently changing the requested deadline", async () => {
  await render(<Fixture timeZone="Europe/Rome" />);
  await temporary();
  await choose("Excluded until", "2030-03-31T00:00:00.000Z");
  await choose("Time", "2030-03-31T02:30:00.000Z");
  await press("Ban from group");
  expect(screen.getAllByText("Choose a valid future date and time.").length).toBeGreaterThan(0);
  expect(confirm).not.toHaveBeenCalled();
});

it("keeps server failure visible while allowing an explicit permanent retry", async () => {
  await render(<Fixture timeZone="UTC" failure="Participation changed on the server" />);
  expectDialogFailure("Participation changed on the server");
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith(null);
  expect(cancel).not.toHaveBeenCalled();
});

it("gives local validation priority over a server error, then allows switching to permanent exclusion", async () => {
  await render(<Fixture timeZone="UTC" failure="Previous request failed" />);
  await temporary();
  await choose("Excluded until", "2029-12-31T00:00:00.000Z");
  await press("Ban from group");
  expect(screen.queryByText("Previous request failed")).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  await temporary();
  expect(screen.queryByRole("button", { name: "Excluded until" })).toBeNull();
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith(null);
  expectDialogFailure("Previous request failed");
});

it("blocks temporary controls, cancellation and duplicate confirmation while the parent operation is pending", async () => {
  const view = await render(<Fixture timeZone="Europe/Rome" />);
  await temporary();
  await view.rerender(<Fixture timeZone="Europe/Rome" busy failure="Waiting for moderation" />);
  for (const name of ["Excluded until", "Time"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Temporary exclusion" })).toBeDisabled();
  expect(dialogButton("Ban from group")).toBeDisabled();
  expect(dialogButton("Cancel")).toBeDisabled();
  await press("Ban from group");
  await press("Cancel");
  await temporary();
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(picker.open).not.toHaveBeenCalled();
  expectDialogFailure("Waiting for moderation");
});

it("leaves the initial future deadline unchanged when the external native date dialog is dismissed", async () => {
  await render(<Fixture timeZone="UTC" />);
  await temporary();
  await userEvent.setup().press(screen.getByRole("button", { name: "Excluded until" }));
  const options = picker.open.mock.calls.at(-1)?.[0] as NativePickerOptions | undefined;
  if (!options?.onChange) throw new Error("Expected native date picker callback");
  await act(() =>
    options.onChange?.({ type: "dismissed", nativeEvent: { timestamp: Date.now(), utcOffset: 0 } }),
  );
  await press("Ban from group");
  expect(confirm).toHaveBeenCalledExactlyOnceWith("2030-01-02T00:00:00.000Z");
});
