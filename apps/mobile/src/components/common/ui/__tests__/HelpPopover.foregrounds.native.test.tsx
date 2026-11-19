import { render, screen } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { type ColorValue, processColor, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { HelpPopover } from "../HelpPopover";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it.each([
  { variant: "primary", token: "accent-foreground" },
  { variant: "danger-soft", token: "danger-soft-foreground" },
  { variant: "danger", token: "danger-foreground" },
  { variant: "ghost", token: "muted" },
] as const)(
  "pairs the actual $variant help glyph with the current $token and keeps dimmed help interactive",
  async ({ variant, token }) => {
    let foreground: ColorValue | undefined;
    function Fixture() {
      // Read the installed theme through its public SDK hook; no copied palette.
      foreground = useThemeColor(token);
      return (
        <HelpPopover
          label="Explain unavailable action"
          title="Action availability"
          triggerVariant={variant}
          triggerClassName="opacity-60"
        >
          <Text>Current eligibility explains why the action is unavailable.</Text>
        </HelpPopover>
      );
    }
    await render(<Fixture />, { wrapper: NativeTestProviders });
    const trigger = screen.getByRole("button", { name: "Explain unavailable action" });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44, opacity: 0.6 });
    expect(foreground).toBeDefined();
    const expectedColor = processColor(foreground);
    expect(typeof expectedColor).toBe("number");
    const svg = trigger.queryAll(
      (node) =>
        node.type.startsWith("RNSVG") &&
        Number(node.props.bbWidth) === 20 &&
        Number(node.props.bbHeight) === 20,
    )[0];
    if (!svg) throw new Error("Expected the actual header-sized Lucide help glyph");
    const brush = svg.queryAll((node) => node.type === "RNSVGGroup" && node.props.stroke != null)[0]
      ?.props.stroke;
    expect(brush).toMatchObject({ type: 0, payload: expectedColor });
    await pressMeasuredPopover(trigger);
    expect(screen.getByRole("heading", { name: "Action availability" })).toBeVisible();
    expect(
      screen.getByText("Current eligibility explains why the action is unavailable."),
    ).toBeVisible();
  },
);
