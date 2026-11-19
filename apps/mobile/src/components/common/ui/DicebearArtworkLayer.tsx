import { createElement, memo, useMemo } from "react";
import { Animated, Easing } from "react-native";
import { type JsxAST, SvgAst, type XmlAST } from "react-native-svg";
import { resourceArtworkFrames } from "@/lib/resourceArtworkFrames";
import type { ArtworkLayer } from "@/lib/resourceArtworkLayers";

const easeInOut = Easing.bezier(0.42, 0, 0.58, 1);
const identityStyle = {
  opacity: 1,
  transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0rad" as const }],
};

function svgElement(
  node: XmlAST | string,
  index: number,
): ReturnType<typeof createElement> | string {
  if (typeof node === "string") return node;
  const { class: className, ...props } = node.props;
  return createElement(
    node.Tag,
    { ...props, className: typeof className === "string" ? className : undefined, key: index },
    ...node.children.map(svgElement),
  );
}

/** GPU transforms reuse static SVG textures instead of rerasterizing the drawing every frame. */
export const DicebearArtworkLayer = memo(function DicebearArtworkLayer({
  layer,
  progress,
  enabled,
  size,
}: {
  layer: ArtworkLayer;
  progress: Animated.Value;
  enabled: boolean;
  size: number;
}) {
  const ast = useMemo<JsxAST>(
    () => ({ ...layer.ast, children: layer.ast.children.map(svgElement) }),
    [layer.ast],
  );
  const { motion, placement } = layer;
  const animatedStyle = useMemo(() => {
    if (!motion) return identityStyle;
    const frames = resourceArtworkFrames(motion, placement, size, easeInOut);
    const config = { inputRange: frames.inputRange, extrapolate: "clamp" as const };
    const interpolateNumber = (outputRange: number[]) =>
      outputRange.every((value) => value === outputRange[0])
        ? outputRange[0]
        : progress.interpolate<number>({ ...config, outputRange });
    const rotation = frames.rotate.every((value) => value === frames.rotate[0])
      ? frames.rotate[0]
      : progress.interpolate<`${number}rad`>({ ...config, outputRange: frames.rotate });
    return {
      opacity: interpolateNumber(frames.opacity),
      transform: [
        { translateX: interpolateNumber(frames.translateX) },
        { translateY: interpolateNumber(frames.translateY) },
        { rotate: rotation },
      ],
    };
  }, [motion, placement, size, progress]);
  const drawing = useMemo(
    () => (
      <SvgAst
        ast={ast}
        override={{ width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet" }}
      />
    ),
    [ast],
  );
  return (
    <Animated.View
      collapsable={false}
      renderToHardwareTextureAndroid={!!layer.motion}
      shouldRasterizeIOS={!!layer.motion}
      pointerEvents="none"
      style={[
        { position: "absolute", inset: 0, transformOrigin: [0, 0, 0] },
        enabled && motion ? animatedStyle : identityStyle,
      ]}
    >
      {drawing}
    </Animated.View>
  );
});
