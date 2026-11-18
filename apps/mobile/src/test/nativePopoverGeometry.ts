import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Dimensions, type NativeMethods, StyleSheet } from "react-native";
import { expect, vi } from "vitest";

/**
 * vitest-native preserves RN/HeroUI JavaScript but its native View.measure is a
 * no-op and it has no Yoga layout engine. Supply only that native boundary.
 * This fixed anchor is fixture geometry, never device/frame timing evidence.
 */
export async function installNativePopoverMeasurements() {
  const boundary = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measure"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  vi.spyOn(boundary.default.prototype, "measure").mockImplementation((callback) => {
    callback(0, 0, 44, 44, 120, 180);
  });
}

export async function pressMeasuredPopover(trigger: ReturnType<typeof screen.getByRole>) {
  await userEvent.setup().press(trigger);
  const dialogs = () =>
    screen.container.queryAll(
      (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
    );
  await waitFor(() => expect(dialogs()).toHaveLength(1));
  const dialog = dialogs()[0];
  expect(dialog).not.toBeVisible();
  // First Yoga pass measures the offscreen content. The real positioning hook
  // then places it relative to the fixture anchor, and a second pass reports it.
  for (let pass = 0; pass < 2; pass++) {
    const style = StyleSheet.flatten(dialog.props.style);
    const x = typeof style?.left === "number" ? style.left : 0;
    const y = typeof style?.top === "number" ? style.top : Dimensions.get("screen").height;
    await fireEvent.layout(dialog, { x, y, width: 260, height: 180 });
  }
  const positioned = StyleSheet.flatten(dialog.props.style);
  expect(positioned.top).toBeGreaterThan(0);
  expect(positioned.top).toBeLessThan(Dimensions.get("screen").height);
  await waitFor(() => expect(dialog).toBeVisible());
}
