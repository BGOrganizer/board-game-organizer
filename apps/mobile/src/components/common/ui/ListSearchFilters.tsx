import { type ListRole, listRoles } from "@board-game-organizer/shared";
import { Check, Crown, Mail } from "lucide-react-native";
import { useT } from "@/lib/i18n";
import { ListSearch } from "./ListSearch";

const roleIcons = { admin: Crown, invited: Mail, accepted: Check };

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
  const t = useT();
  const names = { admin: t("Admin"), invited: t("Invited"), accepted: t("Accepted") };
  return (
    <ListSearch
      query={query}
      onQueryChange={onQueryChange}
      label={label}
      placeholder={placeholder}
      options={listRoles.map((key) => ({ key, label: names[key], icon: roleIcons[key] }))}
      selected={roles}
      onToggle={onToggle}
    />
  );
}
