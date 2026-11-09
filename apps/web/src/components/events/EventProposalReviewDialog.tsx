"use client";
import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { eventProposalAuthorRows } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
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
  const { t } = useLingui();
  const authors = useMemo(() => eventProposalAuthorRows(row), [row]);
  const [count, setCount] = useState(8);
  return (
    <ContactConfirmDialog
      title={row.status === "PENDING" ? t`Review proposal` : t`Proposal details`}
      description={
        valid
          ? t`Accept adds this choice to the available options. Reject discards the pending proposal. The decision applies to every pending proposal for this same choice.`
          : row.status !== "PENDING"
            ? t`This proposal has already been reviewed.`
            : t`This proposal changed or the action is unavailable. Close and review current proposals.`
      }
      onCancel={onCancel}
      actions={
        valid
          ? [
              {
                label: t`Accept`,
                variant: "primary",
                icon: <Check className="size-4" aria-hidden />,
                onPress: () => onDecision("accept"),
              },
              {
                label: t`Reject`,
                variant: "danger",
                icon: <X className="size-4" aria-hidden />,
                onPress: () => onDecision("reject"),
              },
            ]
          : []
      }
    >
      <div className="space-y-3">
        <EventProposalItem row={row} />
        <h3 className="font-medium">{t`Proposed by`}</h3>
        <ul className="space-y-2">
          {authors.slice(0, count).map((author) => (
            <li key={author.id} className="truncate" title={author.label}>
              {author.label}
            </li>
          ))}
        </ul>
        {count < authors.length ? (
          <Button
            variant="secondary"
            onPress={() => setCount((value) => value + 8)}
          >{t`Load more`}</Button>
        ) : null}
      </div>
    </ContactConfirmDialog>
  );
}
