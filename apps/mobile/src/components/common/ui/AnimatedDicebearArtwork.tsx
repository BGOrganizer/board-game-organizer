import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { NavigationContext } from "expo-router/react-navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AccessibilityInfo, AppState, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { G, type GProps, parse, SvgAst, type XmlAST } from "react-native-svg";
import { ScopedTheme } from "uniwind";
import {
  ARTWORK_CYCLE_MS,
  interpolateArtworkMotion,
  resourceArtworkMotion,
} from "@/lib/resourceArtworkMotion";
import { resourceArtworkTree } from "@/lib/resourceArtworkTree";
import { ArtworkHeaderContext, ArtworkVisibleContext } from "./ArtworkVisibility";

const AnimatedGroup = Animated.createAnimatedComponent(G);
const easeInOut = Easing.bezier(0.42, 0, 0.58, 1).factory();
const MotionContext = createContext<{
  progress: SharedValue<number>;
  enabled: boolean;
  celebration?: string;
} | null>(null);

function AnimatedArtworkPart({ className, ...props }: GProps & { className?: string }) {
  const motion = use(MotionContext);
  const profile = useMemo(
    () => resourceArtworkMotion(className ?? "", motion?.celebration),
    [className, motion?.celebration],
  );
  const animatedProps = useAnimatedProps(() =>
    motion && profile
      ? interpolateArtworkMotion(profile, motion.progress.get(), easeInOut, motion.enabled)
      : {},
  );
  return <AnimatedGroup {...props} animatedProps={animatedProps} />;
}

export function AnimatedDicebearArtwork({
  seed,
  variant,
  size = 64,
  presentation = "thumbnail",
}: {
  seed: string;
  variant: ResourceArtworkKind;
  size?: number;
  presentation?: "thumbnail" | "background" | "cover";
}) {
  const artwork = useMemo(() => createResourceArtwork(variant, seed), [variant, seed]);
  const celebration =
    typeof artwork.options.celebrationVariant === "string"
      ? artwork.options.celebrationVariant
      : undefined;
  const ast = useMemo(
    () =>
      parse(artwork.svg, (node) =>
        resourceArtworkTree(node, AnimatedArtworkPart as XmlAST["Tag"], celebration),
      ),
    [artwork.svg, celebration],
  );
  const visible = use(ArtworkVisibleContext);
  const header = use(ArtworkHeaderContext);
  const frameId = useId();
  const frame = useRef<View>(null);
  const subscribe = useCallback(
    (callback: () => void) => (header ? header.store.subscribe(frameId, callback) : () => {}),
    [header, frameId],
  );
  const snapshot = useCallback(
    () => (header ? header.store.isVisible(frameId) : true),
    [header, frameId],
  );
  const frameVisible = useSyncExternalStore(subscribe, snapshot, () => false);
  const navigation = use(NavigationContext);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // HeroUI portals are hosted outside the navigator: decorative artwork stays static there.
    if (!navigation) {
      setFocused(false);
      return;
    }
    let current = true;
    const update = () => {
      if (current) setFocused(navigation.isFocused());
    };
    update();
    const focus = navigation.addListener("focus", update);
    const blur = navigation.addListener("blur", update);
    return () => {
      current = false;
      focus();
      blur();
    };
  }, [navigation]);
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [active, setActive] = useState(AppState.currentState === "active");
  const progress = useSharedValue(0);
  const enabled = visible && frameVisible && focused && active && !reducedMotion;
  useEffect(() => {
    if (!header) return;
    let current = true;
    const stop = header.store.registerFrame(frameId, () => {
      const ancestor = header.ref.current;
      if (!ancestor) return;
      frame.current?.measureLayout(
        ancestor,
        (_x, y, _width, height) => {
          if (current) header.store.frame(frameId, y, height);
        },
        () => {
          if (current) header.store.frame(frameId, 0, 0);
        },
      );
    });
    return () => {
      current = false;
      stop();
    };
  }, [header, frameId]);
  useEffect(() => {
    let current = true;
    let changed = false;
    const preference = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduced) => {
      if (current) {
        changed = true;
        setReducedMotion(reduced);
      }
    });
    const app = AppState.addEventListener("change", (state) => {
      if (current) setActive(state === "active");
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (current && !changed) setReducedMotion(reduced);
      })
      .catch(() => {
        if (current && !changed) setReducedMotion(true);
      });
    return () => {
      current = false;
      preference.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    // AccessibilityInfo owns the live preference; Reanimated System caches its startup value.
    if (enabled)
      progress.set(
        withRepeat(
          withTiming(1, {
            duration: ARTWORK_CYCLE_MS,
            easing: Easing.linear,
            reduceMotion: ReduceMotion.Never,
          }),
          -1,
          false,
          undefined,
          ReduceMotion.Never,
        ),
      );
    return () => cancelAnimation(progress);
  }, [enabled, progress]);
  const motion = useMemo(
    () => ({ progress, enabled, celebration }),
    [progress, enabled, celebration],
  );
  return (
    <View
      ref={frame}
      collapsable={false}
      onLayout={() => header?.store.measureFrame(frameId)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID={`dicebear-${variant}-image`}
      style={
        presentation !== "thumbnail"
          ? { position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden" }
          : { width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }
      }
    >
      <ScopedTheme theme="light">
        <View className="bg-surface" style={{ flex: 1, padding: presentation === "cover" ? 4 : 0 }}>
          <MotionContext value={motion}>
            <SvgAst
              ast={ast}
              override={{ width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet" }}
            />
          </MotionContext>
        </View>
      </ScopedTheme>
    </View>
  );
}
