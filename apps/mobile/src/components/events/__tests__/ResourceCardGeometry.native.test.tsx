import { RECORD_USER_ROLES, type RecordUserRole } from "@board-game-organizer/shared";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { type ColorValue, Dimensions, processColor, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { EventRolePopover } from "../EventRolePopover";
import { EventTableGamesPopover } from "../EventTableGamesPopover";

let previousWindow: ReturnType<typeof Dimensions.get>;
let previousScreen: ReturnType<typeof Dimensions.get>;
const fetchBoundary = vi.fn(() => {
  throw new Error("Card metadata must not issue requests or acknowledge notifications");
});
beforeEach(async () => {
  previousWindow = Dimensions.get("window");
  previousScreen = Dimensions.get("screen");
  fetchBoundary.mockClear();
  vi.stubGlobal("fetch", fetchBoundary);
  await installNativePopoverMeasurements();
});
afterEach(async () => {
  expect(fetchBoundary).not.toHaveBeenCalled();
  await cleanup();
  await act(() => Dimensions.set({ window: previousWindow, screen: previousScreen }));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function viewport(width: number, height: number) {
  await act(() =>
    Dimensions.set({
      window: { width, height, scale: 1, fontScale: 1 },
      screen: { width, height, scale: 1, fontScale: 1 },
    }),
  );
}
function popoverContent() {
  const dialogs = screen.container.queryAll(
    (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
  );
  expect(dialogs).toHaveLength(1);
  return dialogs[0];
}
function nativeColor(color: ColorValue | undefined) {
  const value = processColor(color);
  if (typeof value !== "number") throw new Error("Expected a resolved native HeroUI color");
  expect((value >>> 24) & 255).toBe(255);
  return value >>> 0;
}
function expectCompactTrigger(
  trigger: ReturnType<typeof screen.getByRole>,
  foreground: ColorValue,
  surface: ColorValue,
) {
  expect(trigger).toBeEnabled();
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44, padding: 0 });
  const frames = trigger.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.width === 28 && style?.height === 28;
  });
  expect(frames).toHaveLength(1);
  expect(nativeColor(StyleSheet.flatten(frames[0].props.style).backgroundColor)).toBe(
    nativeColor(surface),
  );
  const icons = frames[0].queryAll(
    (node) =>
      node.type.startsWith("RNSVG") &&
      Number(node.props.bbWidth) === 16 &&
      Number(node.props.bbHeight) === 16,
  );
  expect(icons).toHaveLength(1);
  expect(icons[0]).toHaveProp("accessible", false);
  const group = icons[0].queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0];
  if (!group) throw new Error("Expected the real compact Lucide glyph's native brush");
  expect(group.props.stroke.type).toBe(0);
  expect(group.props.stroke.payload >>> 0).toBe(nativeColor(foreground));
}

// Fixed dimensions/native measurements establish public host styles and state,
// not device text clipping, Yoga layout, physical touch or frame timing.
it.each([
  { width: 240, height: 400, gameCount: 10, expectedWidth: 208, expectedHeight: 200 },
  { width: 320, height: 640, gameCount: 1, expectedWidth: 288, expectedHeight: 70 },
  { width: 800, height: 1200, gameCount: 10, expectedWidth: 360, expectedHeight: 320 },
])(
  "bounds the real games popover with $gameCount games at $width×$height",
  async ({ width, height, gameCount, expectedWidth, expectedHeight }) => {
    await viewport(width, height);
    const palette = await renderHook(() => useThemeColor(["accent-soft-foreground", "default"]), {
      wrapper: NativeTestProviders,
    });
    await render(
      <EventTableGamesPopover
        name="Strategy table"
        games={Array.from({ length: gameCount }, (_, index) => ({
          id: index + 1,
          name: index === 0 ? "Approved game" : `Game ${index + 1}`,
          imageUrl: null,
          year: 2024,
          average: 8,
          rank: index + 2,
        }))}
      />,
      { wrapper: NativeTestProviders },
    );
    const trigger = screen.getByRole("button", { name: "Board games: Strategy table" });
    expectCompactTrigger(trigger, palette.result.current[0], palette.result.current[1]);
    expect(screen.queryByText("Approved game")).toBeNull();
    await pressMeasuredPopover(trigger);
    const popover = popoverContent();
    expect(popover).toHaveStyle({ width: expectedWidth });
    expect(screen.getByRole("heading", { name: "Board games" })).toBeVisible();
    const game = screen.getByText("Approved game");
    expect(game).toBeVisible();
    let list: typeof game | null = game;
    while (list && typeof list.props.onScroll !== "function") list = list.parent;
    if (!list) throw new Error("Expected the actual game's native virtualized list host");
    let frame = list.parent;
    while (frame && frame !== popover && StyleSheet.flatten(frame.props.style)?.height == null)
      frame = frame.parent;
    expect(frame).not.toBe(popover);
    expect(frame).toHaveStyle({ height: expectedHeight });
    expect(screen.getByRole("button", { name: "Game information: Approved game" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^(Approved game|Select|Vote)/ })).toBeNull();
  },
);

it.each([240, 320, 800])(
  "bounds the actual cumulative-role popover at width %s without truncating its role text",
  async (width) => {
    await viewport(width, 1200);
    const palette = await renderHook(() => useThemeColor(["muted", "default"]), {
      wrapper: NativeTestProviders,
    });
    const roles: RecordUserRole[] = [
      "admin",
      "moderator",
      "demonstrator",
      "invitedPlayer",
      "waitingPlayer",
      "confirmedPlayer",
      "acceptedParticipant",
      "requestedMember",
    ];
    await render(<EventRolePopover roles={roles} action="reply" />, {
      wrapper: NativeTestProviders,
    });
    const trigger = screen.getByRole("button", { name: "Roles and participation" });
    expectCompactTrigger(trigger, palette.result.current[0], palette.result.current[1]);
    await pressMeasuredPopover(trigger);
    expect(popoverContent()).toHaveStyle({ width: Math.min(320, width - 32) });
    expect(screen.getByRole("heading", { name: "Roles and participation" })).toBeVisible();
    for (const role of roles) {
      const text = screen.getByText(RECORD_USER_ROLES[role].message);
      expect(text).toBeVisible();
      expect(text).toHaveStyle({ flex: 1, minWidth: 0 });
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.parent).toHaveStyle({ flexDirection: "row", alignItems: "flex-start" });
    }
    expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
    expect(screen.queryByText("You are not registered.")).toBeNull();
  },
);
