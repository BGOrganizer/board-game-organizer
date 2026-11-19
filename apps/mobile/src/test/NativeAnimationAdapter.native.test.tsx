import { fireEvent, render, screen } from "@testing-library/react-native";
import { Profiler } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { expect, it, vi } from "vitest";

it("retains the installed layout builder's reduced-motion configuration chain", () => {
  expect(LinearTransition.duration(120).reduceMotion(ReduceMotion.System)).toBe(LinearTransition);
});

function AnimationFixture() {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(opacity.get(), [0, 1], [0, 1]) }));
  return (
    <View>
      <Animated.View accessible accessibilityLabel="Animated layer" style={style} />
      <Pressable accessibilityRole="button" onPress={() => opacity.set(1)}>
        <Text>Reveal</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => opacity.set(0)}>
        <Text>Hide</Text>
      </Pressable>
    </View>
  );
}

it("samples the native animation boundary's current style without inventing React commits", async () => {
  const commits = vi.fn();
  expect(interpolate(0.5, [0, 1], [0, 10])).toBe(5);
  expect(interpolate(2, [0, 1], [0, 10], Extrapolation.CLAMP)).toBe(10);
  await render(
    <Profiler id="native-animation-boundary" onRender={commits}>
      <AnimationFixture />
    </Profiler>,
  );
  const layer = screen.getByLabelText("Animated layer", { includeHiddenElements: true });
  const initialCommits = commits.mock.calls.length;
  expect(layer).not.toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Reveal" }));
  expect(layer).toBeVisible();
  expect(commits).toHaveBeenCalledTimes(initialCommits);
  await fireEvent.press(screen.getByRole("button", { name: "Hide" }));
  expect(layer).not.toBeVisible();
  expect(commits).toHaveBeenCalledTimes(initialCommits);
});
