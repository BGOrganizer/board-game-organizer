"use client";
import type { EventVote, PlannedTableResponse } from "@board-game-organizer/schemas";
import { Button, Fieldset } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Eye, Minus, Vote, X } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { VoteResultSheet } from "./VoteResultSheet";
/** One status button; selecting a preference never accepts an invitation. */
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
  isInvalid = false,
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
  isInvalid?: boolean;
}) {
  const { t } = useLingui(),
    [panel, setPanel] = useState<"vote" | "voters" | null>(null);
  const options = [
    { key: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
    { key: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
    { key: "NO", text: t`No`, Icon: X, color: "text-danger" },
  ] as const;
  const selected = options.find((option) => option.key === value) ?? {
    text: t`Choose your vote`,
    Icon: Vote,
    color: "text-foreground/60",
  };
  const choices = options;
  if (inline)
    return (
      <Fieldset
        data-form-field
        data-form-error={isInvalid || undefined}
        aria-label={label}
        aria-invalid={isInvalid || undefined}
        className={`m-0 flex min-w-0 shrink-0 flex-row items-center gap-1 border-0 p-0 ${isInvalid ? "rounded-lg ring-1 ring-danger" : ""}`}
      >
        {choices.map(({ key, text, Icon, color }) => (
          <Button
            key={key}
            isIconOnly
            size="sm"
            variant={value === key ? "primary" : "secondary"}
            aria-label={`${label}: ${text}`}
            aria-pressed={value === key}
            isDisabled={busy || disabledVotes.includes(key)}
            onPress={() => onChange(key)}
          >
            <Icon className={`size-4 ${value === key ? "" : color}`} aria-hidden />
          </Button>
        ))}
      </Fieldset>
    );
  const trigger = readOnly
    ? { Icon: Eye, text: t`Show votes`, color: "text-foreground/60" }
    : selected;
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="secondary"
        className={
          compact
            ? "my-1 shrink-0 after:absolute after:inset-[-4px] md:my-1.5 md:after:inset-[-6px] pointer-fine:my-0 pointer-fine:after:hidden"
            : "min-h-11 min-w-11 shrink-0"
        }
        aria-label={`${label}: ${trigger.text}`}
        aria-haspopup="dialog"
        aria-expanded={panel !== null}
        isDisabled={busy}
        onPress={() => setPanel(readOnly ? "voters" : "vote")}
      >
        <trigger.Icon className={`size-5 ${trigger.color}`} aria-hidden />
      </Button>
      {panel === "vote" ? (
        <ContactConfirmDialog
          title={t`Choose your vote`}
          description={label}
          busy={busy}
          onCancel={() => setPanel(null)}
          actions={[]}
        >
          <div className="flex flex-col gap-2">
            {choices.map(({ key, text, Icon, color }) => (
              <Button
                key={key}
                variant="secondary"
                aria-pressed={value === key}
                isDisabled={busy || disabledVotes.includes(key)}
                onPress={() => {
                  setPanel(null);
                  onChange(key);
                }}
              >
                <Icon className={`size-5 ${color}`} aria-hidden />
                {text}
              </Button>
            ))}
          </div>
          {voters ? (
            <Button variant="ghost" className="min-h-11" onPress={() => setPanel("voters")}>
              <Eye className="size-5" aria-hidden />
              {t`Show votes`}
            </Button>
          ) : null}
          {disabledVotes.includes("NO") ? (
            <p className="mt-3 text-sm text-muted">{t`Keep at least one Yes or If needed among the available options.`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
      {voters && panel === "voters" ? (
        <VoteResultSheet label={label} voters={voters} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}
