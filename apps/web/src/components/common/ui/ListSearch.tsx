import { Button, SearchField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
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
  const { t } = useLingui();
  return (
    <div className="mb-4 space-y-3">
      <SearchField fullWidth name="list-search" value={query} onChange={onQueryChange}>
        <SearchHelpLabel label={label} help={t`Type at least 4 characters to search`} />
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={placeholder} autoComplete="off" maxLength={120} />
          {query ? <SearchField.ClearButton aria-label={t`Clear search`} /> : null}
        </SearchField.Group>
      </SearchField>
      {options.length ? (
        <div className="flex flex-wrap gap-2">
          {options.map(({ key, label: name, icon: Icon }) => (
            <Button
              key={key}
              size="sm"
              variant={selected.includes(key) ? "primary" : "secondary"}
              className="h-8 min-h-8 gap-1.5 px-2 text-xs"
              aria-pressed={selected.includes(key)}
              onPress={() => onToggle(key)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {name}
            </Button>
          ))}
        </div>
      ) : null}
      {query.trim().length > 0 && query.trim().length < 4 ? (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
      ) : null}
    </div>
  );
}
