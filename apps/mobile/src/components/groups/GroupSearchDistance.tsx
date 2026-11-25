import {
  groupDiscoveryRadiusInputSchema,
  groupDiscoveryRadiusPresetsKm,
} from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import { ArrowLeft, Check, ChevronDown, Ruler } from "lucide-react-native";
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
  const [draft, setDraft] = useState<string | null>(null);
  const custom = draft !== null;
  const value = `${radiusKm} km`;
  const parsed = groupDiscoveryRadiusInputSchema.safeParse(draft);
  const selectRadius = (radius: number) => {
    setOpen(false);
    setDraft(null);
    onChange(radius);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) Keyboard.dismiss();
        else setDraft(null);
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
          {custom ? (
            <View className="gap-2 p-1">
              <Typography className="text-sm">{t("Custom distance")}</Typography>
              <Input
                testID="group-custom-distance"
                accessibilityLabel={t("Custom distance")}
                inputMode="numeric"
                placeholder={t("1–100 km")}
                value={draft}
                onChangeText={setDraft}
              />
              <View className="flex-row justify-between gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  testID="group-custom-distance-back"
                  accessibilityLabel={t("Back")}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDraft(null);
                  }}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <ArrowLeft size={16} color={foreground} accessible={false} />
                </Button>
                <Button
                  size="sm"
                  testID="group-custom-distance-apply"
                  isDisabled={!parsed.success}
                  onPress={() => {
                    if (parsed.success) {
                      Keyboard.dismiss();
                      selectRadius(parsed.data);
                    }
                  }}
                  style={{ minHeight: 44 }}
                >
                  <Button.Label>{t("Apply")}</Button.Label>
                </Button>
              </View>
            </View>
          ) : (
            <>
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
                  {radiusKm === radius ? (
                    <Check size={16} color={accent} accessible={false} />
                  ) : null}
                </Button>
              ))}
              <Button
                testID="group-distance-custom"
                variant="ghost"
                className="justify-start"
                onPress={() => setDraft(String(radiusKm))}
                style={{ minHeight: 44 }}
              >
                <Button.Label>{t("Custom distance")}</Button.Label>
              </Button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
