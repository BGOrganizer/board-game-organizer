import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { FilterChips } from "./FilterChips";
import { SearchHelpLabel } from "./SearchHelpLabel";
import { SearchInput } from "./SearchInput";

export function ListSearch<Filter extends string>({
  query,
  onQueryChange,
  label,
  placeholder,
  mode = "search",
  options,
  selected,
  onToggle,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  label: string;
  placeholder: string;
  mode?: "search" | "filter";
  options: readonly { key: Filter; label: string; icon: LucideIcon }[];
  selected: readonly Filter[];
  onToggle: (key: Filter) => void;
}) {
  const t = useT();
  return (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <SearchHelpLabel
        label={label}
        helpTitle={mode === "filter" ? t("Filter help") : undefined}
        help={
          mode === "filter"
            ? t("Filter this list by name. No minimum length.")
            : t("Type at least 4 characters to search")
        }
      />
      <SearchInput
        value={query}
        onChange={onQueryChange}
        label={label}
        placeholder={placeholder}
        clearLabel={mode === "filter" ? t("Clear filter") : undefined}
        testID="list-search-input"
        maxLength={120}
      />
      <FilterChips options={options} selected={selected} onToggle={onToggle} />
      {mode === "search" && query.trim().length > 0 && query.trim().length < 4 ? (
        <Typography className="text-sm text-muted">
          {t("Enter at least 4 characters to search")}
        </Typography>
      ) : null}
    </View>
  );
}
