import type {
  AndroidNativeProps,
  DateTimePickerEvent,
  IOSNativeProps,
} from "@react-native-community/datetimepicker";
import { act, cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventDateTimeField } from "../EventDateTimeField";

const sdk = vi.hoisted(() => ({
  open: vi.fn<(props: AndroidNativeProps) => void>(),
  dismiss: vi.fn(async (_mode: "date" | "time") => true),
  ios: vi.fn<(props: IOSNativeProps) => void>(),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  DateTimePickerAndroid: { open: sdk.open, dismiss: sdk.dismiss },
  // UIKit/native dialogs are the external SDK boundary. Retain the app's real
  // field, form ownership, HeroUI button/dialog, lifecycle and callback logic.
  default: (props: IOSNativeProps) => {
    sdk.ios(props);
    return <View {...props} testID="sdk-ios-date-picker" />;
  },
}));
type Props = ComponentProps<typeof EventDateTimeField>;
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
const change = vi.fn<(value: string) => void>();
const initial: Props = {
  label: "Event time",
  value: "2030-06-03T10:30",
  mode: "datetime",
  timeZone: "UTC",
  onChange: change,
};
function Fixture({ props, locale = "en" }: { props: Props; locale?: "en" | "it" }) {
  return (
    <NativeTestProviders locale={locale}>
      <EventDateTimeField {...props} />
    </NativeTestProviders>
  );
}
async function fixture(patch: Partial<Props> = {}, locale: "en" | "it" = "en") {
  let props = { ...initial, ...patch };
  const view = await render(<Fixture props={props} locale={locale} />);
  return {
    ...view,
    press: () => userEvent.setup().press(screen.getByRole("button", { name: props.label })),
    update: async (next: Partial<Props>) => {
      props = { ...props, ...next };
      await view.rerender(<Fixture props={props} locale={locale} />);
    },
  };
}
function request(index = sdk.open.mock.calls.length - 1) {
  const result = sdk.open.mock.calls[index]?.[0];
  if (!result) throw new Error(`Expected native picker request ${index}`);
  return result;
}
function event(type: DateTimePickerEvent["type"], date?: Date): DateTimePickerEvent {
  return {
    type,
    nativeEvent: { timestamp: date?.getTime() ?? 0, utcOffset: 0 },
  };
}
async function answer(
  props: AndroidNativeProps,
  type: DateTimePickerEvent["type"],
  value?: string,
) {
  const date = value ? new Date(value) : undefined;
  await act(() => props.onChange?.(event(type, date), date));
}
async function openStage(stage: "date" | "time") {
  const f = await fixture({ min: "2030-06-03T10:30", max: "2030-06-03T11:30" });
  await f.press();
  if (stage === "time") await answer(request(), "set", "2030-06-03T00:00Z");
  expect(request().mode).toBe(stage);
  return f;
}
beforeEach(() => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  sdk.open.mockClear();
  sdk.dismiss.mockClear();
  sdk.ios.mockClear();
  change.mockClear();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});

it("opens bounded Android date then time and commits only the final calendar/clock combination once", async () => {
  const f = await fixture({ min: "2030-06-03T10:30", max: "2030-06-04T11:30" });
  await f.press();
  expect(request()).toMatchObject({
    mode: "date",
    timeZoneName: "UTC",
    is24Hour: true,
    value: new Date("2030-06-03T10:30Z"),
    minimumDate: new Date("2030-06-03T10:30Z"),
    maximumDate: new Date("2030-06-04T11:30Z"),
  });
  await answer(request(), "set", "2030-06-04T00:00Z");
  expect(change).not.toHaveBeenCalled();
  expect(request()).toMatchObject({
    mode: "time",
    timeZoneName: "UTC",
    is24Hour: true,
    value: new Date("2030-06-04T10:30Z"),
  });
  const clock = request();
  await answer(clock, "set", "2030-06-03T11:15Z");
  await answer(clock, "set", "2030-06-03T11:15Z");
  expect(change).toHaveBeenCalledExactlyOnceWith("2030-06-04T11:15");
  expect(sdk.open).toHaveBeenCalledTimes(2);
});

it.each(["date", "time"] as const)(
  "cancelling the Android %s stage commits nothing and invalidates its later callback",
  async (stage) => {
    const f = await openStage(stage);
    const opened = request();
    const count = sdk.open.mock.calls.length;
    await answer(opened, "dismissed");
    await answer(opened, "set", "2030-06-03T11:00Z");
    expect(change).not.toHaveBeenCalled();
    expect(sdk.open).toHaveBeenCalledTimes(count);
    await f.press();
    expect(sdk.open).toHaveBeenCalledTimes(count + 1);
    expect(request().mode).toBe("date");
  },
);

it.each(["date", "time"] as const)(
  "rejects an Android set callback without a selected value at the %s stage",
  async (stage) => {
    await openStage(stage);
    const opened = request();
    await answer(opened, "set");
    await answer(opened, "set", "2030-06-03T11:00Z");
    expect(change).not.toHaveBeenCalled();
  },
);

it.each(["date", "time"] as const)(
  "dismisses and invalidates the native %s callback when its actual field unmounts",
  async (stage) => {
    const f = await openStage(stage);
    const opened = request();
    const count = sdk.open.mock.calls.length;
    await f.unmount();
    expect(sdk.dismiss).toHaveBeenCalledWith(stage);
    await answer(opened, "set", "2030-06-03T11:00Z");
    expect(change).not.toHaveBeenCalled();
    expect(sdk.open).toHaveBeenCalledTimes(count);
  },
);

const scopeChanges: [string, Partial<Props>][] = [
  ["value", { value: "2030-06-03T11:15" }],
  ["zone", { timeZone: "Europe/Rome" }],
  ["day", { day: "2030-06-04" }],
  ["minimum", { min: "2030-06-03T10:45" }],
  ["maximum", { max: "2030-06-03T11:15" }],
  ["mode", { mode: "date" }],
  ["disabled", { isDisabled: true }],
];
it.each(scopeChanges)(
  "invalidates the captured date-stage callback after current %s changes",
  async (_name, patch) => {
    const f = await openStage("date");
    const opened = request();
    await f.update(patch);
    expect(sdk.dismiss).toHaveBeenCalledWith("date");
    await answer(opened, "set", "2030-06-03T11:00Z");
    expect(change).not.toHaveBeenCalled();
    expect(sdk.open).toHaveBeenCalledOnce();
  },
);
it.each(scopeChanges)(
  "invalidates the captured time-stage callback after current %s changes",
  async (_name, patch) => {
    const f = await openStage("time");
    const opened = request();
    await f.update(patch);
    expect(sdk.dismiss).toHaveBeenCalledWith("time");
    await answer(opened, "set", "2030-06-03T11:00Z");
    expect(change).not.toHaveBeenCalled();
    expect(sdk.open).toHaveBeenCalledTimes(2);
  },
);

it.each(["10:30", "11:30"])(
  "accepts the inclusive native time boundary %s for the owning day",
  async (time) => {
    const f = await fixture({
      mode: "time",
      value: "10:30",
      day: "2030-06-03",
      min: "2030-06-03T10:30",
      max: "2030-06-03T11:30",
    });
    await f.press();
    expect(request()).toMatchObject({
      mode: "time",
      timeZoneName: "UTC",
      is24Hour: true,
    });
    await answer(request(), "set", `2040-02-04T${time}Z`);
    expect(change).toHaveBeenCalledExactlyOnceWith(`2030-06-03T${time}`);
  },
);

it.each(["10:29", "11:31"])(
  "rejects out-of-range native time %s without clamping and allows an explicit retry",
  async (time) => {
    const f = await fixture({
      mode: "time",
      value: "10:30",
      day: "2030-06-03",
      min: "2030-06-03T10:30",
      max: "2030-06-03T11:30",
    });
    await f.press();
    await answer(request(), "set", `2030-06-03T${time}Z`);
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a time within the allowed range.")).toBeOnTheScreen();
    await f.press();
    expect(screen.queryByText("Choose a time within the allowed range.")).toBeNull();
    await answer(request(), "set", "2030-06-03T11:00Z");
    expect(change).toHaveBeenCalledExactlyOnceWith("2030-06-03T11:00");
  },
);

it.each([
  ["2030-06-03T08:00", "2030-06-03T10:30"],
  ["2030-06-03T13:00", "2030-06-03T11:30"],
])(
  "bounds only the initial native value %s to %s without writing a choice",
  async (value, expected) => {
    const f = await fixture({
      value,
      min: "2030-06-03T10:30",
      max: "2030-06-03T11:30",
    });
    await f.press();
    expect(request().value).toEqual(new Date(`${expected}Z`));
    expect(change).not.toHaveBeenCalled();
  },
);

it("retains date-only callers and guards repeated presses while a native dialog is open", async () => {
  const f = await fixture({ mode: "date" });
  await f.press();
  await f.press();
  expect(sdk.open).toHaveBeenCalledOnce();
  expect(request().mode).toBe("date");
  await answer(request(), "set", "2030-06-04T11:00Z");
  expect(change).toHaveBeenCalledExactlyOnceWith("2030-06-04T11:00");
});

it.each([
  { isDisabled: true },
  { min: "2030-06-04T10:30", max: "2030-06-03T10:30" },
  { timeZone: "Invalid/Fixture" },
])("keeps the actual trigger disabled for invalid current constraints %j", async (patch) => {
  const f = await fixture(patch);
  expect(screen.getByRole("button", { name: "Event time" })).toBeDisabled();
  await f.press();
  expect(sdk.open).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
  if (patch.timeZone)
    expect(
      screen.getByText("Could not determine the location time zone. Choose a location."),
    ).toBeOnTheScreen();
});

it.each([
  ["date", "Pick event day"],
  ["time", "Pick time"],
  ["datetime", "Choose date and time"],
] as const)(
  "renders the empty %s placeholder without fabricating a selected value",
  async (mode, text) => {
    await fixture({ value: "", mode });
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(change).not.toHaveBeenCalled();
  },
);

it.each(["en", "it"] as const)(
  "formats the selected wall clock in actual %s Lingui locale without shifting it into the resource zone",
  async (locale) => {
    await fixture(
      {
        mode: "time",
        value: "10:30",
        day: "2030-06-03",
        timeZone: "Pacific/Honolulu",
      },
      locale,
    );
    expect(screen.getByText(locale === "it" ? "10:30" : "10:30 AM")).toBeOnTheScreen();
  },
);

it.each(["cancel", "done"] as const)(
  "retains the real iOS HeroUI picker dialog until explicit %s",
  async (action) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const f = await fixture({
      min: "2030-06-03T10:30",
      max: "2030-06-03T11:30",
    });
    await f.press();
    const picker = screen.getByTestId("sdk-ios-date-picker");
    const captured = sdk.ios.mock.calls.at(-1)?.[0];
    expect(captured).toMatchObject({
      mode: "datetime",
      display: "spinner",
      timeZoneName: "UTC",
      value: new Date("2030-06-03T10:30Z"),
      minimumDate: new Date("2030-06-03T10:30Z"),
      maximumDate: new Date("2030-06-03T11:30Z"),
    });
    expect(sdk.open).not.toHaveBeenCalled();
    const selected = new Date("2030-06-03T11:00Z");
    await fireEvent(picker, "change", event("set", selected), selected);
    expect(change).not.toHaveBeenCalled();
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: action === "cancel" ? "Cancel" : "Done",
      }),
    );
    if (action === "done") expect(change).toHaveBeenCalledExactlyOnceWith("2030-06-03T11:00");
    else expect(change).not.toHaveBeenCalled();
    expect(screen.queryByTestId("sdk-ios-date-picker")).toBeNull();
  },
);

it("uses the current event-zone calendar day for a time-only field without an explicit day", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-06-03T09:00:00Z"));
  const f = await fixture({ mode: "time", timeZone: "Pacific/Honolulu", value: "10:30" });
  await f.press();
  expect(request().value).toEqual(new Date("2030-06-02T10:30Z"));
  await answer(request(), "set", "2040-02-04T11:45Z");
  expect(change).toHaveBeenCalledExactlyOnceWith("2030-06-02T11:45");
});

it("keeps an unbounded iOS draft after a picker dismissal event and drops it on overlay close", async () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  const f = await fixture();
  await f.press();
  const picker = screen.getByTestId("sdk-ios-date-picker");
  const configured = sdk.ios.mock.calls.at(-1)?.[0];
  expect(configured?.minimumDate).toBeUndefined();
  expect(configured?.maximumDate).toBeUndefined();
  await fireEvent(picker, "change", event("dismissed"));
  expect(sdk.ios.mock.calls.at(-1)?.[0].value).toEqual(new Date("2030-06-03T10:30Z"));
  expect(change).not.toHaveBeenCalled();

  const overlays = screen.container.queryAll(
    (node) =>
      typeof node.props.onStartShouldSetResponder === "function" &&
      StyleSheet.flatten(node.props.style)?.position === "absolute",
  );
  expect(overlays).toHaveLength(1);
  await userEvent.setup().press(overlays[0]);
  expect(screen.queryByTestId("sdk-ios-date-picker")).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
