import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

export function FilterChips<Key extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { key: Key; label: string; icon: LucideIcon; disabled?: boolean }[];
  selected: readonly Key[];
  onToggle: (key: Key) => void;
}) {
  const [defaultForeground, accentForeground] = useThemeColor([
    "default-foreground",
    "accent-foreground",
  ]);
  return options.length ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(({ key, label, icon: Icon, disabled }) => {
        const active = selected.includes(key);
        return (
          <View key={key} style={{ minHeight: 44, justifyContent: "center" }}>
            <Button
              testID={`list-filter-${key}`}
              size="sm"
              variant={active ? "primary" : "secondary"}
              style={{
                minWidth: 44,
                minHeight: 32,
                height: 32,
                paddingHorizontal: 8,
                paddingVertical: 0,
              }}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityLabel={label}
              isDisabled={disabled}
              accessibilityState={{ selected: active, disabled }}
              onPress={() => onToggle(key)}
            >
              <Icon
                size={14}
                color={active ? accentForeground : defaultForeground}
                accessible={false}
              />
              <Button.Label style={{ fontSize: 12 }}>{label}</Button.Label>
            </Button>
          </View>
        );
      })}
    </View>
  ) : null;
}
