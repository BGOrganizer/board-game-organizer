import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Typography } from "heroui-native/text";
import { TextField } from "heroui-native/text-field";
import { Plus, UserRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";
import { HelpPopover } from "./HelpPopover";

export function GuestNameRow({
  maxLength,
  isDisabled = false,
  onAdd,
}: {
  maxLength: number;
  isDisabled?: boolean;
  onAdd: (name: string, reset: () => void) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const name = value.trim();
  const valid = !isDisabled && name.length > 0 && name.length <= maxLength;
  function add() {
    if (valid) onAdd(name, () => setValue(""));
  }
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <UserRound size={16} color={muted} accessible={false} />
        <Typography className="font-semibold text-foreground">{t("Guest")}</Typography>
        <HelpPopover label={t("About guests")} title={t("Guest")} size="compact">
          <Typography className="text-foreground">
            {t("Add someone who does not have a Board Game Organizer account.")}
          </Typography>
        </HelpPopover>
      </View>
      <GroupedList>
        <GroupedRow>
          <TextField isDisabled={isDisabled} style={{ flex: 1, minWidth: 0 }}>
            <Input
              accessibilityLabel={t("Guest name")}
              className="text-sm"
              style={{ minHeight: 40, paddingVertical: 4 }}
              placeholder={t("Add a guest")}
              value={value}
              onChangeText={setValue}
              maxLength={maxLength}
              returnKeyType="done"
              onSubmitEditing={add}
            />
          </TextField>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            accessibilityLabel={t("Add a guest")}
            isDisabled={!valid}
            onPress={add}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Plus size={18} color={foreground} accessible={false} />
          </Button>
        </GroupedRow>
      </GroupedList>
    </View>
  );
}
