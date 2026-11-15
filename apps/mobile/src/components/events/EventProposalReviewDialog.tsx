import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { eventProposalAuthorRows } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useT } from "@/lib/i18n";
import { EventProposalItem } from "./EventProposalItem";

export function EventProposalReviewDialog({
  row,
  valid,
  onCancel,
  onDecision,
}: {
  row: EventProposalResponse;
  valid: boolean;
  onCancel: () => void;
  onDecision: (action: "accept" | "reject") => void;
}) {
  const t = useT();
  const [primary, danger] = useThemeColor(["accent-foreground", "danger-foreground"]);
  const authors = useMemo(() => eventProposalAuthorRows(row), [row]);
  const [count, setCount] = useState(8);
  return (
    <ConfirmDialog
      title={row.status === "PENDING" ? t("Review proposal") : t("Proposal details")}
      description={
        valid
          ? t(
              "Accept adds this choice to the available options. Reject discards the pending proposal. The decision applies to every pending proposal for this same choice.",
            )
          : row.status !== "PENDING"
            ? t("This proposal has already been reviewed.")
            : t(
                "This proposal changed or the action is unavailable. Close and review current proposals.",
              )
      }
      onCancel={onCancel}
      actions={
        valid
          ? [
              {
                label: t("Accept"),
                variant: "primary",
                icon: <Check size={16} color={primary} accessible={false} />,
                onPress: () => onDecision("accept"),
              },
              {
                label: t("Reject"),
                variant: "danger",
                icon: <X size={16} color={danger} accessible={false} />,
                onPress: () => onDecision("reject"),
              },
            ]
          : []
      }
    >
      <View style={{ gap: 12 }}>
        <EventProposalItem row={row} />
        <Typography accessibilityRole="header" className="font-medium text-foreground">
          {t("Proposed by")}
        </Typography>
        {authors.slice(0, count).map((author) => (
          <Typography
            key={author.id}
            numberOfLines={1}
            accessibilityLabel={author.label}
            className="text-foreground"
          >
            {author.label}
          </Typography>
        ))}
        {count < authors.length ? (
          <Button variant="secondary" onPress={() => setCount((value) => value + 8)}>
            <Button.Label>{t("Load more")}</Button.Label>
          </Button>
        ) : null}
      </View>
    </ConfirmDialog>
  );
}
