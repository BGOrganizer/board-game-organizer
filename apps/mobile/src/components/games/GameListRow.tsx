import type { BggSearchItem } from "@board-game-organizer/schemas";
import { gameMetadataMissing } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Gamepad2 } from "lucide-react-native";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Image, Pressable, useWindowDimensions, View } from "react-native";
import {
  ExpandableGroupedRow,
  type GroupedRowDisclosure,
} from "@/components/common/ui/ExpandableGroupedRow";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputScrollContext } from "@/lib/inputScrollContext";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  game,
  titleAccessory,
  onPress,
  actions,
  metadata,
  children,
  disclosure,
}: {
  game?: BggSearchItem;
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  onPress?: () => void;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
  disclosure?: GroupedRowDisclosure;
}) {
  const muted = useThemeColor("muted");
  const viewport = useContext(InputScrollContext);
  const { height } = useWindowDimensions();
  const cover = useRef<View>(null);
  const [visibleId, setVisibleId] = useState<number>();
  const id = game?.id;
  const expandable = disclosure !== undefined;
  const needsMetadata = Boolean(game && gameMetadataMissing(game) && visibleId !== id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Switching row layouts replaces the observed cover.
  useEffect(() => {
    if (!needsMetadata || id === undefined || !cover.current || !viewport?.observeVisibility)
      return;
    return viewport.observeVisibility(cover.current, () => setVisibleId(id));
  }, [id, needsMetadata, viewport, expandable]);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const Identity = onPress && !disclosure ? Pressable : View;
  const identity = (
    <Identity
      onPress={disclosure ? undefined : onPress}
      accessibilityRole={Identity === Pressable ? "button" : undefined}
      accessibilityLabel={Identity === Pressable ? name : undefined}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
    >
      <View
        ref={cover}
        collapsable={needsMetadata ? false : undefined}
        onLayout={
          needsMetadata && !viewport?.observeVisibility
            ? () => {
                cover.current?.measureInWindow((_x, y, width, rowHeight) => {
                  if (
                    id !== undefined &&
                    width > 0 &&
                    rowHeight > 0 &&
                    y < height &&
                    y + rowHeight > 0
                  )
                    setVisibleId(id);
                });
              }
            : undefined
        }
        style={{ width: 48, height: 48, zIndex: 1, overflow: "visible" }}
      >
        <View
          className="bg-muted/20"
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {imageUrl && imageUrl !== failedImage ? (
            <Image
              source={{ uri: imageUrl }}
              onError={() => setFailedImage(imageUrl)}
              accessible={false}
              resizeMode="contain"
              style={{ width: 48, height: 48 }}
            />
          ) : (
            <Gamepad2 size={20} color={muted} accessible={false} />
          )}
        </View>
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
        {metadata ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {metadata}
          </View>
        ) : null}
        {children}
      </View>
    </Identity>
  );
  const gameInfo = game ? (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 26, top: "50%", marginTop: 2, zIndex: 2 }}
    >
      <GameCatalogMetadata name={name} game={game} visible={id === visibleId} />
    </View>
  ) : null;
  if (disclosure) {
    return (
      <ExpandableGroupedRow
        disclosure={disclosure}
        summary={identity}
        overlay={gameInfo}
        actions={actions}
      />
    );
  }
  return (
    <GroupedRow>
      <View style={{ position: "relative", flex: 1, minWidth: 0 }}>
        {identity}
        {gameInfo}
      </View>
      {actions}
    </GroupedRow>
  );
}
