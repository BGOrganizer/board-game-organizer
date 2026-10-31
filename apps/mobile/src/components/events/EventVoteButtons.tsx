import type { EventVote } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Minus, Vote, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useT } from "@/lib/i18n";
export function EventVoteButtons({
  value = "UNKNOWN",
  label,
  busy,
  onChange,
  inline = false,
  disabledVotes = [],
}: {
  value?: EventVote;
  label: string;
  busy: boolean;
  onChange: (vote: Exclude<EventVote, "UNKNOWN">) => void;
  inline?: boolean;
  disabledVotes?: readonly EventVote[];
}) {
  const t = useT(),
    [open, setOpen] = useState(false);
  const [success, warning, danger, foreground, accentForeground] = useThemeColor([
    "success",
    "warning",
    "danger",
    "foreground",
    "accent-foreground",
  ]);
  const options = [
    { key: "YES", text: t("Yes"), Icon: Check, color: success },
    { key: "IF_NEEDED", text: t("If needed"), Icon: Minus, color: warning },
    { key: "NO", text: t("No"), Icon: X, color: danger },
  ] as const;
  const selected = options.find((option) => option.key === value) ?? {
    text: t("Choose your vote"),
    Icon: Vote,
    color: foreground,
  };
  const choices = options;
  if (inline)
    return (
      <View style={{ flexDirection: "row", gap: 4 }}>
        {choices.map(({ key, text, Icon, color }) => (
          <Button
            key={key}
            isIconOnly
            size="sm"
            variant={value === key ? "primary" : "secondary"}
            accessibilityLabel={`${label}: ${text}`}
            accessibilityState={{ selected: value === key }}
            style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
            hitSlop={4}
            isDisabled={busy || disabledVotes.includes(key)}
            onPress={() => onChange(key)}
          >
            <Icon size={16} color={value === key ? accentForeground : color} accessible={false} />
          </Button>
        ))}
      </View>
    );
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="secondary"
        style={{ minWidth: 44, minHeight: 44 }}
        accessibilityLabel={`${label}: ${selected.text}`}
        accessibilityState={{ expanded: open }}
        isDisabled={busy}
        onPress={() => setOpen(true)}
      >
        <selected.Icon size={20} color={selected.color} />
      </Button>
      {open ? (
        <ConfirmDialog
          title={t("Choose your vote")}
          description={label}
          busy={busy}
          onCancel={() => setOpen(false)}
          actions={[]}
        >
          <View style={{ gap: 8 }}>
            {choices.map(({ key, text, Icon, color }) => (
              <Button
                key={key}
                variant="secondary"
                accessibilityState={{ selected: value === key }}
                isDisabled={busy || disabledVotes.includes(key)}
                onPress={() => {
                  setOpen(false);
                  onChange(key);
                }}
              >
                <Icon size={20} color={color} />
                <Button.Label>{text}</Button.Label>
              </Button>
            ))}
          </View>
          {disabledVotes.includes("NO") ? (
            <Typography className="text-sm text-muted">
              {t("Keep at least one Yes or If needed among the available options.")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
