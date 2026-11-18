import { cleanup, render, screen } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import type { ReactNode } from "react";
import { type ColorValue, processColor, StyleSheet, View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { NativeTestProviders } from "@/test/NativeTestProviders";

function TokenProbe() {
  const [danger, foreground] = useThemeColor(["danger", "danger-foreground"]);
  return (
    <View
      testID="badge-semantic-tokens"
      style={{ borderTopColor: danger, borderBottomColor: foreground }}
    />
  );
}
function Fixture({ children }: { children: ReactNode }) {
  return (
    <NativeTestProviders>
      <TokenProbe />
      {children}
    </NativeTestProviders>
  );
}
function nativeColor(value: ColorValue | undefined) {
  expect(value).toBeDefined();
  const color = processColor(value);
  expect(typeof color).toBe("number");
  if (typeof color !== "number") throw new Error("Expected a resolved native semantic badge color");
  expect((color >>> 24) & 255).toBe(255);
  return color;
}
afterEach(cleanup);

it.each([1, 99, 130])(
  "retains the real count %s accessibly with a 16dp bell badge and its exact corner placement",
  async (count) => {
    const view = await render(
      <Fixture>
        <NotificationCountBadge count={count} counted />
      </Fixture>,
    );
    const badge = screen.getByLabelText(`Notifications: ${count}`);
    const text = screen.getByText(count > 99 ? "99+" : String(count));
    expect(badge).toBeVisible();
    expect(badge).toHaveProp("pointerEvents", "none");
    expect(badge).toHaveStyle({
      position: "relative",
      minWidth: 16,
      height: 16,
      borderRadius: 8,
    });
    expect(text).toBeVisible();
    expect(text).toHaveStyle({
      fontSize: 9,
      lineHeight: 11,
      fontWeight: "700",
    });
    const tokens = StyleSheet.flatten(screen.getByTestId("badge-semantic-tokens").props.style);
    expect(nativeColor(StyleSheet.flatten(badge.props.style).backgroundColor)).toBe(
      nativeColor(tokens.borderTopColor),
    );
    expect(nativeColor(StyleSheet.flatten(text.props.style).color)).toBe(
      nativeColor(tokens.borderBottomColor),
    );
    await view.rerender(
      <Fixture>
        <NotificationCountBadge count={count} counted corner />
      </Fixture>,
    );
    expect(screen.getByLabelText(`Notifications: ${count}`)).toBe(badge);
    expect(badge).toHaveStyle({
      position: "absolute",
      top: -8,
      right: -8,
      minWidth: 16,
      height: 16,
    });
  },
);

it("keeps numberless attention at 8dp independently of the full bell counter and omits zero or unknown counts", async () => {
  const view = await render(
    <Fixture>
      <NotificationCountBadge count={130} corner />
    </Fixture>,
  );
  const dot = screen.getByLabelText("Needs attention");
  expect(dot).toBeVisible();
  expect(dot).toHaveProp("pointerEvents", "none");
  expect(dot).toHaveStyle({
    minWidth: 8,
    height: 8,
    borderRadius: 4,
    top: -4,
    right: -4,
    position: "absolute",
    paddingHorizontal: 0,
  });
  expect(screen.queryByText(/130|99\+/)).toBeNull();
  const tokens = StyleSheet.flatten(screen.getByTestId("badge-semantic-tokens").props.style);
  expect(nativeColor(StyleSheet.flatten(dot.props.style).backgroundColor)).toBe(
    nativeColor(tokens.borderTopColor),
  );
  for (const count of [undefined, 0]) {
    await view.rerender(
      <Fixture>
        <NotificationCountBadge count={count} counted corner />
      </Fixture>,
    );
    expect(screen.queryByLabelText(/Notifications:|Needs attention/)).toBeNull();
  }
});

it("keeps an actual unread marker static, noninteractive and exactly 8dp while authoritative visibility changes", async () => {
  const requests = vi.fn(() => {
    throw new Error("A presentation marker must not read or acknowledge anything");
  });
  vi.stubGlobal("fetch", requests);
  try {
    const view = await render(
      <Fixture>
        <NotificationUnreadDot active={false} />
      </Fixture>,
    );
    expect(screen.queryByRole("image", { name: "Unread updates" })).toBeNull();
    await view.rerender(
      <Fixture>
        <NotificationUnreadDot active />
      </Fixture>,
    );
    const dot = screen.getByRole("image", { name: "Unread updates" });
    expect(dot).toBeVisible();
    expect(dot).toHaveProp("pointerEvents", "none");
    expect(dot).toHaveStyle({
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    });
    const tokens = StyleSheet.flatten(screen.getByTestId("badge-semantic-tokens").props.style);
    expect(nativeColor(StyleSheet.flatten(dot.props.style).backgroundColor)).toBe(
      nativeColor(tokens.borderTopColor),
    );
    expect(screen.queryByRole("button")).toBeNull();
    await view.rerender(
      <Fixture>
        <NotificationUnreadDot active={false} />
      </Fixture>,
    );
    expect(screen.queryByRole("image", { name: "Unread updates" })).toBeNull();
    expect(requests).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
