import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import constellation from "@dicebear/styles/constellation.json" with { type: "json" };
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
  constellation: new Style(constellation),
  landscape: new Style(landscape),
  planets: new Style(planets),
  shapes: new Style(shapes),
  waves: new Style(waves),
};

export function AnimatedDicebearArtwork({
  seed,
  variant,
  size = 64,
  presentation = "thumbnail",
}: {
  seed: string;
  variant: keyof typeof styles;
  size?: number;
  presentation?: "thumbnail" | "background" | "cover";
}) {
  const xml = useMemo(
    () =>
      new DiceBearAvatar(styles[variant], {
        seed,
        size: size + 8,
        ...(presentation === "cover" ? { backgroundColor: [] } : {}),
      }).toString(),
    [seed, variant, size, presentation],
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
      className={presentation === "cover" ? undefined : "bg-accent/10"}
      style={
        presentation !== "thumbnail"
          ? {
              position: "absolute",
              inset: 0,
              borderRadius: presentation === "cover" ? 0 : 12,
              overflow: "hidden",
            }
          : { width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }
      }
    >
      <Animated.View
        testID={variant === "waves" ? "match-waves-image" : `dicebear-${variant}-image`}
        style={[
          {
            position: "absolute",
            left: presentation === "cover" ? 4 : -4,
            top: presentation === "cover" ? 4 : -4,
            ...(presentation === "cover"
              ? { right: 4, bottom: 4 }
              : presentation === "background"
                ? { right: -4, bottom: -4 }
                : {}),
          },
          animatedStyle,
        ]}
      >
        <SvgXml
          xml={xml}
          width={presentation !== "thumbnail" ? "100%" : size + 8}
          height={presentation !== "thumbnail" ? "100%" : size + 8}
          preserveAspectRatio={presentation === "cover" ? "xMidYMid meet" : "xMidYMid slice"}
        />
      </Animated.View>
    </View>
  );
}
