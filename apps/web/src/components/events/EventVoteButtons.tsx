"use client";
import type { EventVote } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, HelpCircle, Minus, X } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
/** One status button; selecting a preference never accepts an invitation. */
export function EventVoteButtons({
  value = "UNKNOWN",
  label,
  busy,
  onChange,
  allowUnknown = true,
  inline = false,
  disabledVotes = [],
}: {
  value?: EventVote;
  label: string;
  busy: boolean;
  onChange: (vote: EventVote) => void;
  allowUnknown?: boolean;
  inline?: boolean;
  disabledVotes?: readonly EventVote[];
}) {
  const { t } = useLingui(),
    [open, setOpen] = useState(false);
  const options = [
    { key: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
    { key: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
    { key: "NO", text: t`No`, Icon: X, color: "text-danger" },
    { key: "UNKNOWN", text: t`Unknown`, Icon: HelpCircle, color: "text-foreground/60" },
  ] as const;
  const selected = options.find((option) => option.key === value) ?? options[3];
  const choices = options.filter((option) => allowUnknown || option.key !== "UNKNOWN");
  if (inline)
    return (
      <div className="flex shrink-0 items-center gap-1">
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
      </div>
    );
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="secondary"
        className="min-h-11 min-w-11 shrink-0"
        aria-label={`${label}: ${selected.text}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        isDisabled={busy}
        onPress={() => setOpen(true)}
      >
        <selected.Icon className={`size-5 ${selected.color}`} aria-hidden />
      </Button>
      {open ? (
        <ContactConfirmDialog
          title={t`Choose your vote`}
          description={label}
          busy={busy}
          onCancel={() => setOpen(false)}
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
                  setOpen(false);
                  onChange(key);
                }}
              >
                <Icon className={`size-5 ${color}`} aria-hidden />
                {text}
              </Button>
            ))}
          </div>
          {disabledVotes.includes("NO") ? (
            <p className="mt-3 text-sm text-default-500">{t`Keep at least one Yes or If needed for dates and locations.`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </>
  );
}
