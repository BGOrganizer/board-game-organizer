import { type RecordListOrder, recordListSortFields } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Menu } from "heroui-native/menu";
import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp, CalendarDays, ListOrdered } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

const face = {
  height: 28,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: 4,
} as const;

export const ListOrdering = memo(function ListOrdering({
  order: { sort, direction },
  onChange,
}: {
  order: RecordListOrder;
  onChange: (order: RecordListOrder) => void;
}) {
  const t = useT();
  const [accent, foreground] = useThemeColor(["accent", "foreground"]);
  const fields = {
    name: { label: t("Name"), Icon: ListOrdered },
    date: { label: t("Date"), Icon: CalendarDays },
  };
  const { label, Icon } = fields[sort];
  const DirectionIcon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        columnGap: 8,
      }}
    >
      <Typography className="text-sm text-muted">{t("Sort by")}</Typography>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Menu>
          <Menu.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              testID="list-sort-field"
              accessibilityLabel={`${t("Sort by")} ${label}`}
              style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 0 }}
            >
              <View className="bg-surface-secondary" style={{ ...face, paddingHorizontal: 8 }}>
                <Icon size={14} color={accent} accessible={false} />
                <Typography className="text-xs text-foreground">{label}</Typography>
              </View>
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Overlay />
            <Menu.Content presentation="popover" placement="bottom" align="end" width={180}>
              <Menu.Group
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[sort]}
                onSelectionChange={(keys) => {
                  const field = recordListSortFields.find((item) => keys.has(item));
                  if (field) onChange({ sort: field, direction });
                }}
              >
                {recordListSortFields.map((field) => {
                  const { Icon, label } = fields[field];
                  return (
                    <Menu.Item key={field} id={field} accessibilityLabel={label}>
                      <Icon size={16} color={accent} accessible={false} />
                      <Menu.ItemTitle>{label}</Menu.ItemTitle>
                      <Menu.ItemIndicator />
                    </Menu.Item>
                  );
                })}
              </Menu.Group>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          testID="list-sort-direction"
          accessibilityLabel={direction === "asc" ? t("Sort descending") : t("Sort ascending")}
          onPress={() => onChange({ sort, direction: direction === "asc" ? "desc" : "asc" })}
          style={{ width: 44, minHeight: 44, padding: 0 }}
        >
          <View className="bg-surface-secondary" style={{ ...face, width: 28 }}>
            <DirectionIcon size={14} color={foreground} accessible={false} />
          </View>
        </Button>
      </View>
    </View>
  );
});
