import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { ScopedTheme } from "uniwind";
import { AnimatedDetailArtwork } from "./AnimatedDetailArtwork";

export const AnimatedDicebearArtwork = memo(function AnimatedDicebearArtwork({
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
  const artwork = useMemo(() => createResourceArtwork(variant, seed, "none"), [variant, seed]);
  const drawing = (
    <SvgXml xml={artwork.svg} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
  );
  return (
    <View
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
          <AnimatedDetailArtwork key={`${variant}:${seed}`} artwork={artwork}>
            {drawing}
          </AnimatedDetailArtwork>
        </View>
      </ScopedTheme>
    </View>
  );
});
