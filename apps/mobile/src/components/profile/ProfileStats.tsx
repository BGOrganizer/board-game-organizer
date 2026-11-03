import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";

export function ProfileStats({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flex: 1, minWidth: 0 }}>
          <ListCard>
            <View style={{ padding: 12, gap: 4 }}>
              <Typography className="text-lg font-semibold text-foreground">
                {item.value}
              </Typography>
              <Typography className="text-sm text-muted">{item.label}</Typography>
            </View>
          </ListCard>
        </View>
      ))}
    </View>
  );
}
