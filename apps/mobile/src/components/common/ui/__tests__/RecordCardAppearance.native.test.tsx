import { act, cleanup, render, renderHook, screen } from "@testing-library/react-native";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Dices } from "lucide-react-native";
import type { ReactNode } from "react";
import { type ColorValue, Dimensions, processColor, StyleSheet, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { RecordIdentityCard } from "../RecordIdentityCard";
import { SearchHelpLabel } from "../SearchHelpLabel";

let previousWindow: ReturnType<typeof Dimensions.get>;
let previousScreen: ReturnType<typeof Dimensions.get>;
beforeEach(async () => {
  previousWindow = Dimensions.get("window");
  previousScreen = Dimensions.get("screen");
  await installNativePopoverMeasurements();
});
afterEach(async () => {
  await cleanup();
  await act(() => Dimensions.set({ window: previousWindow, screen: previousScreen }));
  vi.restoreAllMocks();
});
function DarkPaletteProvider({ children }: { children: ReactNode }) {
  return (
    <NativeTestProviders>
      <ScopedTheme theme="dark">{children}</ScopedTheme>
    </NativeTestProviders>
  );
}
function nativeColor(value: ColorValue | undefined) {
  const color = processColor(value);
  if (typeof color !== "number") throw new Error("Expected a resolved compiled HeroUI color");
  return color >>> 0;
}

it.each(["light", "dark"] as const)(
  "keeps the natural detail title band on the installed dark palette inside a %s page",
  async (theme) => {
    const palette = await renderHook(() => useThemeColor(["background", "foreground"]), {
      wrapper: DarkPaletteProvider,
    });
    const background = nativeColor(palette.result.current[0]);
    const foreground = nativeColor(palette.result.current[1]);
    expect((background >>> 24) & 255).toBe(255);
    expect((foreground >>> 24) & 255).toBe(255);
    expect(background).not.toBe(foreground);
    const title = "A long title whose natural height must follow the user's font size";
    await render(
      <NativeTestProviders>
        <ScopedTheme theme={theme}>
          <RecordIdentityCard
            title={title}
            icon={Dices}
            background={<View testID="detail-artwork" />}
            titleAction={
              <Button accessibilityLabel="Resource notifications">
                <Button.Label>Notices</Button.Label>
              </Button>
            }
          >
            <Button accessibilityLabel="Resource state">
              <Button.Label>State</Button.Label>
            </Button>
          </RecordIdentityCard>
        </ScopedTheme>
      </NativeTestProviders>,
    );
    const heading = screen.getByRole("header", { name: title });
    expect(heading).toBeVisible();
    const textStyle = StyleSheet.flatten(heading.props.style);
    expect(nativeColor(textStyle.color)).toBe(foreground);
    expect(textStyle.width).toBeUndefined();
    expect(textStyle.height).toBeUndefined();
    expect(textStyle.textShadowColor).toBeUndefined();
    expect(heading.props.numberOfLines).toBeUndefined();
    const band = heading.parent;
    if (!band) throw new Error("Expected the actual title band's native host");
    const bandStyle = StyleSheet.flatten(band.props.style);
    expect(band).toHaveStyle({
      width: "100%",
      paddingVertical: 2,
      paddingHorizontal: 16,
      alignItems: "center",
    });
    expect(bandStyle.height).toBeUndefined();
    const bandColor = nativeColor(bandStyle.backgroundColor);
    expect(bandColor & 0x00ffffff).toBe(background & 0x00ffffff);
    expect((bandColor >>> 24) & 255).toBe(Math.round(255 * 0.8));
    const icons = band.queryAll(
      (node) =>
        node.type.startsWith("RNSVG") &&
        Number(node.props.bbWidth) === 20 &&
        Number(node.props.bbHeight) === 20,
    );
    expect(icons).toHaveLength(1);
    const brush = icons[0].queryAll(
      (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
    )[0]?.props.stroke;
    if (typeof brush?.payload !== "number")
      throw new Error("Expected the title glyph's native brush");
    expect(brush.type).toBe(0);
    expect(brush.payload >>> 0).toBe(foreground);
    expect(screen.getByTestId("card-background")).toHaveStyle({ position: "absolute", inset: 0 });
    expect(screen.getByTestId("card-background")).toHaveProp("pointerEvents", "none");
    expect(screen.getByTestId("detail-artwork")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resource notifications" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Resource state" })).toBeEnabled();
  },
);

it("retains the field-help label's shrinkable row and fixed accessible control at a large native font scale", async () => {
  await act(() =>
    Dimensions.set({
      window: { width: 320, height: 640, scale: 1, fontScale: 2 },
      screen: { width: 320, height: 640, scale: 1, fontScale: 2 },
    }),
  );
  await render(
    <SearchHelpLabel
      label="A long authorized-resource filter label"
      required
      help="This filter only includes resources available to the current account."
    />,
    { wrapper: NativeTestProviders },
  );
  expect(Dimensions.get("window").fontScale).toBe(2);
  const label = screen.getByText("A long authorized-resource filter label *", { exact: true });
  expect(label).toBeVisible();
  expect(label).toHaveStyle({ flexShrink: 1 });
  expect(label.props.allowFontScaling).not.toBe(false);
  expect(label.props.numberOfLines).toBeUndefined();
  expect(label.parent).toHaveStyle({ flexShrink: 1, minWidth: 0, flexDirection: "row" });
  const trigger = screen.getByRole("button", {
    name: "A long authorized-resource filter label: Search help",
  });
  expect(trigger).toBeEnabled();
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
  await pressMeasuredPopover(trigger);
  expect(
    screen.getByText("This filter only includes resources available to the current account."),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Search help" })).toBeVisible();
  // These are real native style and control contracts, not a Yoga text-fit measurement.
  expect(screen.queryByText("Field help")).toBeNull();
});
