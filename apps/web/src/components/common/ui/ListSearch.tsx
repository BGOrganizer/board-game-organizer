import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
import { FilterChips } from "./FilterChips";
import { SearchHelpLabel } from "./SearchHelpLabel";
import { SearchInput } from "./SearchInput";

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
  const { t } = useLingui();
  return (
    <div className="mb-4 space-y-3">
      <SearchInput
        value={query}
        onChange={onQueryChange}
        name="list-search"
        placeholder={placeholder}
        label={<SearchHelpLabel label={label} help={t`Type at least 4 characters to search`} />}
        inputProps={{ autoComplete: "off", maxLength: 120 }}
      />
      <FilterChips options={options} selected={selected} onToggle={onToggle} />
      {query.trim().length > 0 && query.trim().length < 4 ? (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
      ) : null}
    </div>
  );
}
