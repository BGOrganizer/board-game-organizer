import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { UserPlus, UserRoundPlus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";

export function GuestNameRow({
  maxLength,
  isDisabled = false,
  onAdd,
}: {
  maxLength: number;
  isDisabled?: boolean;
  onAdd: (name: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const name = value.trim();
  const valid = !isDisabled && name.length > 0 && name.length <= maxLength;
  function add() {
    if (valid) onAdd(name);
  }
  return (
    <GroupedList>
      <GroupedRow>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View
            className="bg-default"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserRoundPlus size={20} color={muted} accessible={false} />
          </View>
          <TextField isDisabled={isDisabled} style={{ flex: 1, minWidth: 0 }}>
            <Label>{t("Guest name")}</Label>
            <Input
              accessibilityLabel={t("Guest name")}
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
            <UserPlus size={18} color={foreground} accessible={false} />
          </Button>
        </View>
      </GroupedRow>
    </GroupedList>
  );
}
