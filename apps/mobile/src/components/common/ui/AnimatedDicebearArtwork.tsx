import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import landscape from "@dicebear/styles/landscape.json" with { type: "json" };
import planets from "@dicebear/styles/planets.json" with { type: "json" };
import shapes from "@dicebear/styles/shapes.json" with { type: "json" };
import waves from "@dicebear/styles/waves.json" with { type: "json" };
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";

const styles = {
  landscape: new Style(landscape),
  planets: new Style(planets),
  shapes: new Style(shapes),
  waves: new Style(waves),
};

export function AnimatedDicebearArtwork({
  seed,
  variant,
  size = 64,
}: {
  seed: string;
  variant: keyof typeof styles;
  size?: number;
}) {
  const xml = useMemo(
    () => new DiceBearAvatar(styles[variant], { seed, size: size + 8 }).toString(),
    [seed, variant, size],
  );
  const reducedMotion = useReducedMotion();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      shift.set(0);
      return;
    }
    shift.set(
      withRepeat(withTiming(4, { duration: 3000, reduceMotion: ReduceMotion.System }), -1, true),
    );
    return () => cancelAnimation(shift);
  }, [reducedMotion, shift]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className="bg-accent/10"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }}
    >
      <Animated.View
        testID={variant === "waves" ? "match-waves-image" : `dicebear-${variant}-image`}
        style={[{ position: "absolute", left: -4, top: -4 }, animatedStyle]}
      >
        <SvgXml xml={xml} width={size + 8} height={size + 8} />
      </Animated.View>
    </View>
  );
}
