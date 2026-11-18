import { createRequire } from "node:module";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { expect, it } from "vitest";

const nativeSafeArea = createRequire(import.meta.url)(
  "react-native-safe-area-context",
) as typeof import("react-native-safe-area-context");

function InsetsProbe() {
  const insets = useSafeAreaInsets();
  return <Text>{`${insets.top}/${insets.bottom}/${insets.left}/${insets.right}`}</Text>;
}

it("shares the real native safe-area context between app imports and native-owned dependencies", async () => {
  expect(SafeAreaInsetsContext).toBe(nativeSafeArea.SafeAreaInsetsContext);
  expect(SafeAreaProvider).toBe(nativeSafeArea.SafeAreaProvider);
  await render(
    <nativeSafeArea.SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, bottom: 16, left: 3, right: 5 },
      }}
    >
      <InsetsProbe />
    </nativeSafeArea.SafeAreaProvider>,
  );
  expect(screen.getByText("24/16/3/5")).toBeOnTheScreen();
});
