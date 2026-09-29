import { type ListRole, listRoles } from "@board-game-organizer/shared";
import { Button, Label, SearchField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function ListSearchFilters({
  query,
  onQueryChange,
  roles,
  onToggle,
  label,
  placeholder,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  roles: ListRole[];
  onToggle: (role: ListRole) => void;
  label: string;
  placeholder: string;
}) {
  const { t } = useLingui();
  const names = { admin: t`Admin`, invited: t`Invited`, accepted: t`Accepted` };
  return (
    <div className="mb-4 space-y-3">
      <SearchField fullWidth value={query} onChange={onQueryChange}>
        <Label className="sr-only">{label}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={placeholder} />
          <SearchField.ClearButton aria-label={t`Clear search`} />
        </SearchField.Group>
      </SearchField>
      <div className="flex flex-wrap gap-2">
        {listRoles.map((role) => (
          <Button
            key={role}
            size="sm"
            variant="primary"
            className="h-7 min-h-7 px-2 text-xs"
            style={roles.includes(role) ? undefined : { backgroundColor: "#52525b" }}
            aria-pressed={roles.includes(role)}
            onPress={() => onToggle(role)}
          >
            <span className="text-white">{names[role]}</span>
          </Button>
        ))}
      </div>
      {query.trim().length > 0 && query.trim().length < 4 && (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
      )}
    </div>
  );
}
