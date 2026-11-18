import type { ResourceArtwork } from "@board-game-organizer/shared/artwork";
import { NavigationContext } from "expo-router/react-navigation";
import {
  type ReactNode,
  startTransition,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, Animated, AppState, Easing, View } from "react-native";
import { parse } from "react-native-svg";
import { useListActivity } from "@/lib/listActivity";
import { type ArtworkLayer, resourceArtworkLayers } from "@/lib/resourceArtworkLayers";
import { ARTWORK_CYCLE_MS } from "@/lib/resourceArtworkMotion";
import { DicebearArtworkLayer } from "./DicebearArtworkLayer";

/** Only an active detail uses immutable SVG planes driven by one native clock. */
export function AnimatedDetailArtwork({
  artwork,
  children,
}: {
  artwork: ResourceArtwork;
  children: ReactNode;
}) {
  const navigation = use(NavigationContext);
  const isActive = useListActivity();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [preference, setPreference] = useState<{ reduced: boolean } | null>(null);
  const motionAllowed = useRef(false);
  const [size, setSize] = useState(0);
  const [prepared, setPrepared] = useState(false);
  const progress = useMemo(() => new Animated.Value(0), []);
  const loop = useRef<Animated.CompositeAnimation | null>(null);
  const stop = useCallback(() => {
    loop.current?.stop();
    loop.current = null;
    progress.stopAnimation();
    progress.setValue(0);
  }, [progress]);
  useEffect(() => {
    if (!navigation) return;
    const update = () => {
      const next = navigation.isFocused();
      if (!next) stop();
      setFocused(next);
    };
    update();
    const focus = navigation.addListener("focus", update);
    const blur = navigation.addListener("blur", update);
    return () => {
      focus();
      blur();
      stop();
    };
  }, [navigation, stop]);
  useEffect(() => {
    let current = true;
    let changed = false;
    motionAllowed.current = false;
    setPreference(null);
    stop();
    const apply = (reduced: boolean) => {
      if (!current) return;
      motionAllowed.current = !reduced;
      if (reduced) stop();
      setPreference({ reduced });
    };
    const preferenceSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        changed = true;
        apply(reduced);
      },
    );
    const app = AppState.addEventListener("change", (state) => {
      if (!current) return;
      if (state !== "active") stop();
      setForeground(state === "active");
    });
    setForeground(AppState.currentState === "active");
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!changed) apply(reduced);
      })
      .catch(() => {
        if (!changed) apply(true);
      });
    return () => {
      current = false;
      motionAllowed.current = false;
      preferenceSubscription.remove();
      app.remove();
      stop();
    };
  }, [stop]);
  const eligible = focused && foreground && preference !== null && !preference.reduced && size > 0;
  useEffect(() => {
    if (eligible && isActive()) startTransition(() => setPrepared(true));
  }, [eligible, isActive]);
  useEffect(() => {
    stop();
    if (
      !eligible ||
      !prepared ||
      !preference ||
      preference.reduced ||
      !motionAllowed.current ||
      !isActive() ||
      !navigation?.isFocused() ||
      AppState.currentState !== "active"
    )
      return;
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: ARTWORK_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
      { iterations: -1, resetBeforeIteration: true },
    );
    loop.current = animation;
    animation.start();
    return stop;
  }, [eligible, prepared, preference, isActive, navigation, progress, stop]);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={({ nativeEvent: { layout } }) => {
        if (!isActive()) return;
        const next = Math.min(layout.width, layout.height);
        if (next > 0) setSize((previous) => (previous === next ? previous : next));
      }}
    >
      {prepared && size > 0 ? (
        <NativeArtwork artwork={artwork} size={size} enabled={eligible} progress={progress} />
      ) : (
        children
      )}
    </View>
  );
}

function NativeArtwork({
  artwork,
  size,
  enabled,
  progress,
}: {
  artwork: ResourceArtwork;
  size: number;
  enabled: boolean;
  progress: Animated.Value;
}) {
  const layers = useMemo(() => {
    let result: ArtworkLayer[] = [];
    const celebration =
      typeof artwork.options.celebrationVariant === "string"
        ? artwork.options.celebrationVariant
        : undefined;
    parse(artwork.svg, (root) => {
      result = resourceArtworkLayers(root, celebration);
      return { ...root, children: [] };
    });
    return result;
  }, [artwork]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size, height: size, overflow: "hidden" }}>
        {layers.map((layer) => (
          <DicebearArtworkLayer
            key={layer.key}
            layer={layer}
            progress={progress}
            enabled={enabled}
            size={size}
          />
        ))}
      </View>
    </View>
  );
}
