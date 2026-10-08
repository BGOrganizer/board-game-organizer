import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { SearchField } from "heroui-native/search-field";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { SearchHelpLabel } from "./SearchHelpLabel";

export function ListSearch<Filter extends string>({
  query,
  onQueryChange,
  label,
  placeholder,
  options,
  selected,
  onToggle,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  label: string;
  placeholder: string;
  options: readonly { key: Filter; label: string; icon: LucideIcon }[];
  selected: readonly Filter[];
  onToggle: (key: Filter) => void;
}) {
  const t = useT();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  return (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <SearchHelpLabel label={label} help={t("Type at least 4 characters to search")} />
      <SearchField value={query} onChange={onQueryChange}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input
            testID="list-search-input"
            accessibilityLabel={label}
            placeholder={placeholder}
            maxLength={120}
          />
          {query ? <SearchField.ClearButton accessibilityLabel={t("Clear search")} /> : null}
        </SearchField.Group>
      </SearchField>
      {options.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {options.map(({ key, label: name, icon: Icon }) => {
            const active = selected.includes(key);
            return (
              <Button
                key={key}
                testID={`list-filter-${key}`}
                size="sm"
                variant={active ? "primary" : "secondary"}
                style={{ minHeight: 32, height: 32, paddingHorizontal: 8 }}
                accessibilityLabel={name}
                accessibilityState={{ selected: active }}
                onPress={() => onToggle(key)}
              >
                <Icon size={14} color={active ? accentForeground : foreground} accessible={false} />
                <Button.Label style={{ fontSize: 12 }}>{name}</Button.Label>
              </Button>
            );
          })}
        </View>
      ) : null}
      {query.trim().length > 0 && query.trim().length < 4 ? (
        <Typography className="text-sm text-muted">
          {t("Enter at least 4 characters to search")}
        </Typography>
      ) : null}
    </View>
  );
}
