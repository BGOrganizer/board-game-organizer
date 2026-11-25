import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

export function FilterChips<Key extends string>({
  options,
  selected,
  onToggle,
  children,
}: {
  options: readonly { key: Key; label: string; icon: LucideIcon; disabled?: boolean }[];
  selected: readonly Key[];
  onToggle: (key: Key) => void;
  children?: ReactNode;
}) {
  const [foreground, accentForeground] = useThemeColor(["foreground", "accent-foreground"]);
  return options.length ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      {options.map(({ key, label, icon: Icon, disabled }) => {
        const active = selected.includes(key);
        return (
          <View key={key} style={{ minHeight: 44, justifyContent: "center" }}>
            <Button
              testID={`list-filter-${key}`}
              size="sm"
              variant={active ? "primary" : "secondary"}
              className={active ? undefined : "bg-surface-secondary"}
              style={{
                minWidth: 44,
                minHeight: 28,
                height: "auto",
                borderRadius: 8,
                gap: 4,
                paddingHorizontal: 6,
                paddingVertical: 0,
              }}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityLabel={label}
              isDisabled={disabled}
              accessibilityState={{ selected: active, disabled }}
              onPress={() => onToggle(key)}
            >
              <Icon size={14} color={active ? accentForeground : foreground} accessible={false} />
              <Button.Label
                className={active ? undefined : "text-foreground"}
                style={{ fontSize: 12 }}
              >
                {label}
              </Button.Label>
            </Button>
          </View>
        );
      })}
      {children}
    </View>
  ) : null;
}
