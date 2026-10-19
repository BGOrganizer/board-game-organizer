import type { EventVote } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check, HelpCircle, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
export function EventVoteButtons({
  value = "UNKNOWN",
  label,
  busy,
  onChange,
}: {
  value?: EventVote;
  label: string;
  busy: boolean;
  onChange: (vote: EventVote) => void;
}) {
  const t = useT(),
    fg = useThemeColor("foreground"),
    selected = useThemeColor("accent-foreground");
  return (
    <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={label}>
      {(
        [
          { key: "YES", text: t("Yes"), icon: Check },
          { key: "IF_NEEDED", text: t("If needed"), icon: Minus },
          { key: "NO", text: t("No"), icon: X },
          { key: "UNKNOWN", text: t("Unknown"), icon: HelpCircle },
        ] as const
      ).map(({ key, text, icon: Icon }) => (
        <Button
          key={key}
          size="sm"
          isIconOnly
          style={{ minWidth: 44, minHeight: 44 }}
          variant={value === key ? "primary" : "ghost"}
          accessibilityState={{ selected: value === key }}
          accessibilityLabel={`${label}: ${text}`}
          isDisabled={busy}
          onPress={() => onChange(key)}
        >
          <Icon size={18} color={value === key ? selected : fg} />
        </Button>
      ))}
    </View>
  );
}
