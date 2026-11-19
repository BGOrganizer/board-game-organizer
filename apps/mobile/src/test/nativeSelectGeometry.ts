import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import { expect } from "vitest";

/**
 * Position the actual Select for callback/state tests only. Its primitive copies
 * animated opacity before the Node preset can apply native shared-value updates;
 * this helper establishes readiness, never animated visibility or tappability.
 * The caller must install the existing native measure boundary first.
 */
export async function positionMeasuredSelect(trigger: ReturnType<typeof screen.getByRole>) {
  await userEvent.setup().press(trigger);
  const dialogs = () =>
    screen.container.queryAll(
      (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
    );
  await waitFor(() => expect(dialogs()).toHaveLength(1));
  const dialog = dialogs()[0];
  // Supply the native measurement and positioned layout, with no extra jitter.
  for (let pass = 0; pass < 2; pass++) {
    const style = StyleSheet.flatten(dialog.props.style);
    const x = typeof style?.left === "number" ? style.left : 0;
    const y = typeof style?.top === "number" ? style.top : Dimensions.get("screen").height;
    await fireEvent.layout(dialog, { x, y, width: 260, height: 180 });
  }
  const positioned = StyleSheet.flatten(dialog.props.style);
  expect(positioned.top).toBeGreaterThan(0);
  expect(positioned.top).toBeLessThan(Dimensions.get("screen").height);
  await waitFor(() => expect(dialog.props.pointerEvents).not.toBe("none"));
}
