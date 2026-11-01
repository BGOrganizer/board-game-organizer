import { useAppStore } from "@board-game-organizer/store";
import { useIsFocused } from "expo-router/react-navigation";
import { useThemeColor } from "heroui-native/hooks";
import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useT } from "@/lib/i18n";

type Pulse = { owner: string; itemId: string; signal?: string };
const frame = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  borderRadius: 12,
} as const;
/** An absolute childless layer never changes card/row measurements or touch targets. */
export function NotificationAttentionBorder({ active, pulse }: { active: boolean; pulse?: Pulse }) {
  const accent = useThemeColor("accent"),
    t = useT();
  if (!active) return null;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("Needs attention")}
      style={{ ...frame, zIndex: 2 }}
    >
      <View style={{ ...frame, borderWidth: 1.5, borderColor: accent, opacity: 0.8 }} />
      {pulse ? <PulseLayer {...pulse} /> : null}
    </View>
  );
}
function PulseLayer({ owner, itemId, signal }: Pulse) {
  const accent = useThemeColor("accent"),
    focused = useIsFocused();
  const claim = useAppStore((state) => state.claimAttentionPulse);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [reduced, setReduced] = useState<boolean>();
  const opacity = useSharedValue(0);
  useEffect(() => {
    let current = true,
      revision = 0;
    const refresh = () => {
      const at = ++revision;
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (current && at === revision) setReduced(value);
        })
        .catch(() => {
          if (current && at === revision) setReduced(true);
        });
    };
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      revision++;
      setReduced(value);
    });
    const app = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state === "active") {
        setReduced(undefined);
        refresh();
      }
    });
    refresh();
    return () => {
      current = false;
      motion.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(0);
    if (!signal || !focused || !foreground || reduced === undefined) return;
    const first = claim(owner, itemId, signal);
    if (!first || reduced) return;
    const config = {
      duration: 800,
      easing: Easing.bezier(0.77, 0, 0.175, 1),
      reduceMotion: ReduceMotion.System,
    };
    opacity.set(
      withRepeat(
        withSequence(ReduceMotion.System, withTiming(0.65, config), withTiming(0, config)),
        3,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
    return () => {
      cancelAnimation(opacity);
      opacity.set(0);
    };
  }, [owner, itemId, signal, focused, foreground, reduced, claim, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ ...frame, borderWidth: 2, borderColor: accent }, animated]}
    />
  );
}
