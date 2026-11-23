import type { EventVote, PlannedTableResponse } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Eye, Minus, Vote, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useT } from "@/lib/i18n";
import { VoteResultSheet } from "./VoteResultSheet";
export function EventVoteButtons({
  value = "UNKNOWN",
  label,
  busy,
  onChange,
  inline = false,
  compact = false,
  disabledVotes = [],
  voters,
  readOnly = false,
}: {
  value?: EventVote;
  label: string;
  busy: boolean;
  onChange: (vote: Exclude<EventVote, "UNKNOWN">) => void;
  inline?: boolean;
  compact?: boolean;
  disabledVotes?: readonly EventVote[];
  voters?: NonNullable<PlannedTableResponse["gameVoteVoters"]>[string];
  readOnly?: boolean;
}) {
  const t = useT(),
    [panel, setPanel] = useState<"vote" | "voters" | null>(null);
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
  const trigger = readOnly ? { Icon: Eye, text: t("Show votes"), color: foreground } : selected;
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="secondary"
        style={
          compact ? { width: 40, height: 40, marginVertical: 2 } : { minWidth: 44, minHeight: 44 }
        }
        hitSlop={compact ? 2 : undefined}
        accessibilityLabel={`${label}: ${trigger.text}`}
        accessibilityState={{ expanded: panel !== null }}
        isDisabled={busy}
        onPress={() => setPanel(readOnly ? "voters" : "vote")}
      >
        <trigger.Icon size={20} color={trigger.color} />
      </Button>
      {panel === "vote" ? (
        <ConfirmDialog
          title={t("Choose your vote")}
          description={label}
          busy={busy}
          onCancel={() => setPanel(null)}
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
                  setPanel(null);
                  onChange(key);
                }}
              >
                <Icon size={20} color={color} />
                <Button.Label>{text}</Button.Label>
              </Button>
            ))}
          </View>
          {voters ? (
            <Button variant="ghost" style={{ minHeight: 44 }} onPress={() => setPanel("voters")}>
              <Eye size={20} color={foreground} accessible={false} />
              <Button.Label>{t("Show votes")}</Button.Label>
            </Button>
          ) : null}
          {disabledVotes.includes("NO") ? (
            <Typography className="text-sm text-muted">
              {t("Keep at least one Yes or If needed among the available options.")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
      {voters && panel === "voters" ? (
        <VoteResultSheet voters={voters} label={label} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}
