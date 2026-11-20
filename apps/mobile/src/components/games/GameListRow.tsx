import type { BggSearchItem } from "@board-game-organizer/schemas";
import { gameMetadataMissing } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Clock, Gamepad2 } from "lucide-react-native";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Image, Pressable, useWindowDimensions, View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputScrollContext } from "@/lib/inputScrollContext";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  game,
  durationMinutes,
  titleAccessory,
  onPress,
  actions,
  metadata,
  children,
}: {
  game?: BggSearchItem;
  durationMinutes?: number;
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  onPress?: () => void;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const viewport = useContext(InputScrollContext);
  const { height } = useWindowDimensions();
  const cover = useRef<View>(null);
  const [visibleId, setVisibleId] = useState<number>();
  const id = game?.id;
  const needsMetadata = Boolean(game && gameMetadataMissing(game) && visibleId !== id);
  useEffect(() => {
    if (!needsMetadata || id === undefined || !cover.current || !viewport?.observeVisibility)
      return;
    return viewport.observeVisibility(cover.current, () => setVisibleId(id));
  }, [id, needsMetadata, viewport]);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const Identity = onPress ? Pressable : View;
  return (
    <GroupedRow>
      <View style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <Identity
          onPress={onPress}
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={onPress ? name : undefined}
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
            style={{ width: 40, height: 40, zIndex: 1, overflow: "visible" }}
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
              {imageUrl && imageUrl !== failedImage ? (
                <Image
                  source={{ uri: imageUrl }}
                  onError={() => setFailedImage(imageUrl)}
                  accessible={false}
                  resizeMode="contain"
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <Gamepad2 size={18} color={muted} accessible={false} />
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
            {durationMinutes !== undefined || metadata ? (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}
              >
                {durationMinutes !== undefined ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Clock size={12} color={muted} accessible={false} />
                    <Typography className="text-xs text-muted">
                      {i18n.t("game.duration.minutes", { durationMinutes })}
                    </Typography>
                  </View>
                ) : null}
                {metadata}
              </View>
            ) : null}
            {children}
          </View>
        </Identity>
        {game ? (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", left: 12, top: "50%", marginTop: -8, zIndex: 2 }}
          >
            <GameCatalogMetadata name={name} game={game} visible={id === visibleId} />
          </View>
        ) : null}
      </View>
      {actions}
    </GroupedRow>
  );
}
