import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { NavigationContext } from "expo-router/react-navigation";
import {
  memo,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  type LayoutChangeEvent,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { parse, SvgXml } from "react-native-svg";
import { ScopedTheme } from "uniwind";
import { type ArtworkLayer, resourceArtworkLayers } from "@/lib/resourceArtworkLayers";
import { ARTWORK_CYCLE_MS } from "@/lib/resourceArtworkMotion";
import { ArtworkHeaderContext, ArtworkVisibleContext } from "./ArtworkVisibility";
import { DicebearArtworkLayer } from "./DicebearArtworkLayer";

type Props = {
  seed: string;
  variant: ResourceArtworkKind;
  size?: number;
  presentation?: "thumbnail" | "background" | "cover";
};

export const AnimatedDicebearArtwork = memo(function AnimatedDicebearArtwork(props: Props) {
  return props.presentation === "background" ? (
    <AnimatedDetailArtwork {...props} />
  ) : (
    <StaticArtwork {...props} />
  );
});

// Lists and selectors use one static SVG, without animation planes or native clocks.
function StaticArtwork({ seed, variant, size = 64, presentation = "thumbnail" }: Props) {
  const artwork = useMemo(() => createResourceArtwork(variant, seed, "none"), [variant, seed]);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID={`dicebear-${variant}-image`}
      style={
        presentation === "cover"
          ? { position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden" }
          : { width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }
      }
    >
      <ScopedTheme theme="light">
        <View className="bg-surface" style={{ flex: 1, padding: presentation === "cover" ? 4 : 0 }}>
          <SvgXml
            xml={artwork.svg}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          />
        </View>
      </ScopedTheme>
    </View>
  );
}

function AnimatedDetailArtwork({ seed, variant, size = 64, presentation = "background" }: Props) {
  const artwork = useMemo(() => createResourceArtwork(variant, seed), [variant, seed]);
  const celebration =
    typeof artwork.options.celebrationVariant === "string"
      ? artwork.options.celebrationVariant
      : undefined;
  const layers = useMemo(() => {
    let layers: ArtworkLayer[] = [];
    parse(artwork.svg, (root) => {
      layers = resourceArtworkLayers(root, celebration);
      return { ...root, children: [] };
    });
    return layers;
  }, [artwork.svg, celebration]);
  const [frameSize, setFrameSize] = useState(0);
  const measureArtwork = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrameSize(Math.min(width, height));
  }, []);
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
  const progress = useMemo(() => new Animated.Value(0), []);
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
    progress.stopAnimation();
    progress.setValue(0);
    const animation = enabled
      ? Animated.loop(
          Animated.timing(progress, {
            toValue: 1,
            duration: ARTWORK_CYCLE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
            isInteraction: false,
          }),
          { iterations: -1, resetBeforeIteration: true },
        )
      : null;
    animation?.start();
    return () => {
      animation?.stop();
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [enabled, progress]);
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
          <View
            onLayout={measureArtwork}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: frameSize, height: frameSize, overflow: "hidden" }}>
              {frameSize > 0 &&
                layers.map((layer) => (
                  <DicebearArtworkLayer
                    key={layer.key}
                    layer={layer}
                    progress={progress}
                    enabled={enabled}
                    size={frameSize}
                  />
                ))}
            </View>
          </View>
        </View>
      </ScopedTheme>
    </View>
  );
}
