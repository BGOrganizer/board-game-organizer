"use client";
import type { EventVote } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, HelpCircle, Minus, X } from "lucide-react";
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
  const { t } = useLingui();
  return (
    <fieldset className="m-0 flex gap-1 border-0 p-0" aria-label={label}>
      {(
        [
          { key: "YES", text: t`Yes`, icon: Check },
          { key: "IF_NEEDED", text: t`If needed`, icon: Minus },
          { key: "NO", text: t`No`, icon: X },
          { key: "UNKNOWN", text: t`Unknown`, icon: HelpCircle },
        ] as const
      ).map(({ key, text, icon: Icon }) => (
        <Button
          key={key}
          size="sm"
          isIconOnly
          variant={value === key ? "primary" : "ghost"}
          aria-pressed={value === key}
          aria-label={`${label}: ${text}`}
          isDisabled={busy}
          onPress={() => onChange(key)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </fieldset>
  );
}
