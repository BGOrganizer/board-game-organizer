import { groupDiscoveryRadiusPresetsKm } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import { Check, ChevronDown, Ruler } from "lucide-react-native";
import { useState } from "react";
import { Keyboard, View } from "react-native";
import { useT } from "@/lib/i18n";

export function GroupSearchDistance({
  radiusKm,
  onChange,
}: {
  radiusKm: number;
  onChange: (radiusKm: number) => void;
}) {
  const t = useT();
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const [isOpen, setOpen] = useState(false);
  const value = `${radiusKm} km`;
  const selectRadius = (radius: number) => {
    setOpen(false);
    onChange(radius);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) Keyboard.dismiss();
      }}
    >
      <Popover.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          testID="group-search-distance"
          accessibilityLabel={`${t("Distance")}, ${value}`}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 0 }}
        >
          <View className="h-7 flex-row items-center gap-1 rounded-lg bg-surface-secondary px-1.5">
            <Ruler size={14} color={foreground} accessible={false} />
            <Typography className="text-foreground text-xs">{value}</Typography>
            <ChevronDown size={14} color={foreground} accessible={false} />
          </View>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay className="bg-transparent" />
        <Popover.Content
          presentation="popover"
          placement="bottom"
          align="end"
          width={224}
          className="gap-1 p-2"
        >
          <Popover.Title className="px-2 text-sm">{t("Distance")}</Popover.Title>
          {groupDiscoveryRadiusPresetsKm.map((radius) => (
            <Button
              key={radius}
              testID={`group-distance-${radius}`}
              accessibilityState={{ selected: radiusKm === radius }}
              variant={radiusKm === radius ? "secondary" : "ghost"}
              className="justify-between"
              onPress={() => selectRadius(radius)}
              style={{ minHeight: 44 }}
            >
              <Button.Label>{`${radius} km`}</Button.Label>
              {radiusKm === radius ? <Check size={16} color={accent} accessible={false} /> : null}
            </Button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
