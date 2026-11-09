import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { type ReactNode, useId, useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { ScopedTheme } from "uniwind";
import { ListCard } from "./ListCard";

type HeadingProps = { title: string; icon: LucideIcon; titleAccessory?: ReactNode };
function IdentityHeading({ title, icon: Icon, titleAccessory }: HeadingProps) {
  const [background, foreground] = useThemeColor(["background", "foreground"]);
  const id = useId().replaceAll(":", "");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width + 64,
    height = size.height + 64;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
      }}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((old) =>
          old.width === layout.width && old.height === layout.height
            ? old
            : { width: layout.width, height: layout.height },
        )
      }
    >
      <Svg
        accessible={false}
        pointerEvents="none"
        width={width}
        height={height}
        style={{ position: "absolute", left: -32, top: -32 }}
      >
        <Defs>
          <LinearGradient id={`${id}-horizontal`} x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor={background} stopOpacity={0} />
            <Stop offset={32 / width} stopColor={background} stopOpacity={0.9} />
            <Stop offset={1 - 32 / width} stopColor={background} stopOpacity={0.9} />
            <Stop offset="1" stopColor={background} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}-vertical`} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={foreground} stopOpacity={0} />
            <Stop offset={32 / height} stopColor={foreground} />
            <Stop offset={1 - 32 / height} stopColor={foreground} />
            <Stop offset="1" stopColor={foreground} stopOpacity={0} />
          </LinearGradient>
          <Mask id={`${id}-mask`}>
            <Rect width="100%" height="100%" fill={`url(#${id}-vertical)`} />
          </Mask>
        </Defs>
        <Rect
          width="100%"
          height="100%"
          fill={`url(#${id}-horizontal)`}
          mask={`url(#${id}-mask)`}
        />
      </Svg>
      <Icon size={20} color={foreground} accessible={false} style={{ marginTop: 4 }} />
      <Typography
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
        style={{
          flexShrink: 1,
          minWidth: 0,
          textShadowColor: background,
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}
      >
        {title}
      </Typography>
      {titleAccessory}
    </View>
  );
}

/** Full title first; informational controls wrap below without horizontal scrolling. */
export function RecordIdentityCard({
  background,
  children,
  ...heading
}: HeadingProps & { background: ReactNode; children: ReactNode }) {
  return (
    <ListCard background={background}>
      <View style={{ padding: 16, gap: 12, flex: 1 }}>
        <ScopedTheme theme="dark">
          <IdentityHeading {...heading} />
        </ScopedTheme>
        <View
          testID="record-identity-controls"
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", width: "100%" }}
        >
          {children}
        </View>
      </View>
    </ListCard>
  );
}
