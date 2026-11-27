import { Button, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import { FilterChips } from "./FilterChips";
import { SearchHelpLabel } from "./SearchHelpLabel";
import { SearchInput } from "./SearchInput";

export function ListSearch<Filter extends string>({
  query,
  onQueryChange,
  label,
  placeholder,
  mode = "search",
  showSearchGuidance = true,
  options,
  selected,
  onToggle,
  headerSearch,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  label: string;
  placeholder: string;
  mode?: "search" | "filter";
  showSearchGuidance?: boolean;
  options: readonly { key: Filter; label: string; icon: LucideIcon }[];
  selected: readonly Filter[];
  onToggle: (key: Filter) => void;
  headerSearch?: { active: boolean; open: () => void; close: () => void };
}) {
  const { t } = useLingui();
  const input = useRef<HTMLInputElement>(null);
  const closeSearch = () => {
    input.current?.blur();
    headerSearch?.close();
  };
  const showGuidance = mode === "search" && showSearchGuidance;
  return (
    <div className={headerSearch ? "space-y-2" : "mb-4 space-y-3"}>
      <SearchInput
        value={query}
        onChange={onQueryChange}
        name="list-search"
        placeholder={placeholder}
        clearLabel={mode === "filter" ? t`Clear filter` : undefined}
        label={
          showGuidance ? (
            <SearchHelpLabel label={label} help={t`Type at least 4 characters to search`} />
          ) : (
            <Label className="sr-only">{label}</Label>
          )
        }
        leading={
          headerSearch?.active ? (
            <Button
              slot={null}
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Back`}
              onPress={closeSearch}
            >
              <ArrowLeft className="size-5" aria-hidden />
            </Button>
          ) : undefined
        }
        inputProps={{
          ref: input,
          autoComplete: "off",
          maxLength: 120,
          onFocus: headerSearch?.open,
          onKeyDown: headerSearch?.active
            ? (event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                closeSearch();
              }
            : undefined,
        }}
      />
      {!headerSearch || headerSearch.active ? (
        <FilterChips options={options} selected={selected} onToggle={onToggle} />
      ) : null}
      {showGuidance && query.trim().length > 0 && query.trim().length < 4 ? (
        <p className="text-sm text-muted">{t`Enter at least 4 characters to search`}</p>
      ) : null}
    </div>
  );
}
