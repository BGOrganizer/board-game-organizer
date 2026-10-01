import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { revealStartupSplash } from "@/lib/splash";
import { remainingSplashMs } from "@/lib/startup";

export function AnimatedStartupSplash({ startedAt }: { startedAt: number }) {
  const reducedMotion = useReducedMotion();
  const revealed = useRef(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  useEffect(() => {
    opacity.set(
      withDelay(
        remainingSplashMs(startedAt, Date.now()),
        withTiming(0, { duration: 0 }),
        ReduceMotion.Never,
      ),
    );
    if (!reducedMotion) {
      scale.set(
        withRepeat(
          withSequence(
            withTiming(1.04, { duration: 180 }),
            withTiming(0.97, { duration: 230 }),
            withTiming(1.035, { duration: 180 }),
            withTiming(1, { duration: 270 }),
            withDelay(600, withTiming(1, { duration: 0 })),
          ),
          -1,
        ),
      );
    }
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [startedAt, reducedMotion, scale, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => {
        if (revealed.current) return;
        revealed.current = true;
        revealStartupSplash();
      }}
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: "#fff",
          alignItems: "center",
          justifyContent: "center",
        },
        overlayStyle,
      ]}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Animated.Image
          source={require("../../assets/icon.png")}
          resizeMode="contain"
          style={[{ width: 200, height: 200, borderRadius: 100, overflow: "hidden" }, logoStyle]}
        />
      </View>
    </Animated.View>
  );
}
