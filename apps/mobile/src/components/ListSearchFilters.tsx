import { type ListRole, listRoles } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { SearchField } from "heroui-native/search-field";
import { Typography } from "heroui-native/text";
import { Check, Crown, Mail } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

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
    <View style={{ gap: 12, marginBottom: 8 }}>
      <SearchField value={query} onChange={onQueryChange}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input accessibilityLabel={label} placeholder={placeholder} />
          <SearchField.ClearButton accessibilityLabel={t("Clear search")} />
        </SearchField.Group>
      </SearchField>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {listRoles.map((role) => {
          const Icon = roleIcons[role];
          return (
            <Button
              key={role}
              size="sm"
              variant="primary"
              style={{
                minHeight: 32,
                height: 32,
                paddingHorizontal: 8,
                ...(!roles.includes(role) && { backgroundColor: "#52525b" }),
              }}
              accessibilityLabel={names[role]}
              accessibilityState={{ selected: roles.includes(role) }}
              onPress={() => onToggle(role)}
            >
              <Icon size={14} color="#fff" />
              <Typography className="text-white" style={{ fontSize: 12 }}>
                {names[role]}
              </Typography>
            </Button>
          );
        })}
      </View>
      {query.trim().length > 0 && query.trim().length < 4 && (
        <Typography className="text-sm text-muted">
          {t("Enter at least 4 characters to search")}
        </Typography>
      )}
    </View>
  );
}
