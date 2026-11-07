import { Typography } from "heroui-native/text";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";

export function ProfileStats({ items }: { items: readonly { label: string; value: string }[] }) {
  const { fontScale } = useWindowDimensions();
  const scope = JSON.stringify([items, fontScale]);
  const [layout, setLayout] = useState<{ scope: string; heights: Record<string, number> }>({
    scope,
    heights: {},
  });
  if (layout.scope !== scope) setLayout({ scope, heights: {} });
  const numberHeight = layout.scope === scope ? Math.max(0, ...Object.values(layout.heights)) : 0;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flex: 1, minWidth: 0 }}>
          <ListCard style={{ flex: 1 }}>
            <View style={{ padding: 12, gap: 4, flex: 1 }}>
              <View style={{ minHeight: numberHeight }}>
                <Typography
                  className="text-lg font-semibold text-foreground"
                  onLayout={(e) => {
                    const height = e.nativeEvent.layout.height;
                    setLayout((old) =>
                      old.scope === scope && old.heights[item.label] !== height
                        ? { ...old, heights: { ...old.heights, [item.label]: height } }
                        : old,
                    );
                  }}
                >
                  {item.value}
                </Typography>
              </View>
              <Typography className="text-sm text-muted">{item.label}</Typography>
            </View>
          </ListCard>
        </View>
      ))}
    </View>
  );
}
