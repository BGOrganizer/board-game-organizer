import { cleanup, render, screen } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import type { ComponentProps } from "react";
import { processColor, StyleSheet, Text, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { HelpPopover } from "../HelpPopover";

const variants = [
  ["primary", "accent-foreground"],
  ["danger-soft", "danger-soft-foreground"],
  ["danger", "danger-foreground"],
  ["ghost", "muted"],
] as const;
type Token = (typeof variants)[number][1] | "accent-soft-foreground";
function Appearance({ token, ...props }: ComponentProps<typeof HelpPopover> & { token: Token }) {
  const expectedForeground = useThemeColor(token);
  return (
    <>
      <View testID="semantic-foreground" style={{ borderColor: expectedForeground }} />
      <HelpPopover {...props} />
    </>
  );
}
function glyph(trigger: ReturnType<typeof screen.getByRole>, size: number) {
  const glyphs = trigger.queryAll(
    (node) =>
      node.type.startsWith("RNSVG") &&
      Number(node.props.bbWidth) === size &&
      Number(node.props.bbHeight) === size,
  );
  expect(glyphs).toHaveLength(1);
  const group = glyphs[0].queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0];
  if (!group) throw new Error("Expected the actual native Lucide stroke group");
  const brush = group.props.stroke;
  expect(brush.type).toBe(0);
  expect(typeof brush.payload).toBe("number");
  expect((brush.payload >>> 24) & 255).toBe(255);
  const token = StyleSheet.flatten(
    screen.getByTestId("semantic-foreground").props.style,
  ).borderColor;
  expect(token).toBeDefined();
  const expected = processColor(token);
  expect(typeof expected).toBe("number");
  expect(brush.payload).toBe(expected);
  return glyphs[0];
}
beforeEach(installNativePopoverMeasurements);
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

it.each(["light", "dark"] as const)(
  "keeps every real header-help variant on its %s semantic foreground with a 44dp enabled target",
  async (theme) => {
    for (const [triggerVariant, token] of variants) {
      const view = await render(
        <ScopedTheme theme={theme}>
          <NativeTestProviders>
            <Appearance
              token={token}
              label="Why unavailable"
              title="Availability"
              triggerVariant={triggerVariant}
              triggerClassName="opacity-60"
            >
              <Text>Review the current requirements.</Text>
            </Appearance>
          </NativeTestProviders>
        </ScopedTheme>,
      );
      const trigger = screen.getByRole("button", { name: "Why unavailable" });
      expect(trigger).toBeEnabled();
      expect(trigger).toHaveStyle({
        minWidth: 44,
        minHeight: 44,
        opacity: 0.6,
      });
      glyph(trigger, 20);
      await pressMeasuredPopover(trigger);
      expect(screen.getByRole("heading", { name: "Availability" })).toBeVisible();
      expect(screen.getByText("Review the current requirements.")).toBeVisible();
      await view.unmount();
    }
  },
);

it("shrinks the real compact glyph and frame while retaining an accessible 44dp HeroUI target", async () => {
  await render(
    <Appearance
      token="accent-soft-foreground"
      label="Compact explanation"
      title="Compact explanation"
      size="compact"
      tone="accent"
      triggerClassName="bg-default"
    >
      <Text>The explanation remains reachable.</Text>
    </Appearance>,
    { wrapper: NativeTestProviders },
  );
  const trigger = screen.getByRole("button", { name: "Compact explanation" });
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44, padding: 0 });
  const icon = glyph(trigger, 16);
  let frame = icon.parent;
  while (frame && StyleSheet.flatten(frame.props.style)?.width !== 28) frame = frame.parent;
  if (!frame) throw new Error("Expected actual compact artwork frame");
  expect(frame).toHaveStyle({ width: 28, height: 28, borderRadius: 8 });
  await pressMeasuredPopover(trigger);
  expect(screen.getByText("The explanation remains reachable.")).toBeVisible();
});
