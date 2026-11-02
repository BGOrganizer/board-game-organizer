import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Gamepad2 } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  year,
  average,
  rank,
  titleAccessory,
  onPress,
  actions,
  metadata,
  children,
}: ComponentProps<typeof GameCatalogMetadata> & {
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  onPress?: () => void;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  const Identity = onPress ? Pressable : View;
  return (
    <GroupedRow>
      <Identity
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? name : undefined}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
      >
        <View
          className="bg-muted/20"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              accessible={false}
              resizeMode="contain"
              style={{ width: 40, height: 40 }}
            />
          ) : (
            <Gamepad2 size={18} color={muted} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Typography
              className="font-medium text-foreground"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {name}
            </Typography>
            {titleAccessory}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <GameCatalogMetadata year={year} average={average} rank={rank} />
            {metadata}
          </View>
          {children}
        </View>
      </Identity>
      {actions}
    </GroupedRow>
  );
}
