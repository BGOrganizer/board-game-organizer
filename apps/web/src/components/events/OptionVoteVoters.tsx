"use client";

import type { OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import { Avatar, Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
import { useState } from "react";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { VoteResultSheet } from "./VoteResultSheet";

export function OptionVoteVoters({ label, voters }: { label: string; voters: Voters }) {
  const { t } = useLingui();
  const [selection, setSelection] = useState<keyof Voters | null>(null);
  const choices = [
    { id: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
    { id: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
    { id: "NO", text: t`No`, Icon: X, color: "text-danger" },
  ] as const;
  const groups = choices.filter(({ id }) => voters[id].length);
  const displayName = ({ name, username, guestName }: Voters["YES"][number]) =>
    guestName ?? name ?? (username ? `@${username}` : t`Unknown`);

  return (
    <>
      {groups.length ? (
        <ul aria-label={`${t`Votes`}: ${label}`} className="flex flex-wrap items-center">
          {groups.map(({ id, text, Icon, color }, index) => (
            <li
              key={id}
              aria-label={`${text}: ${voters[id].map(displayName).join(", ")}`}
              className="flex min-w-0 max-w-full items-center"
            >
              {index > 0 ? (
                <span aria-hidden className="ms-0.5 size-[3px] shrink-0 rounded-full bg-muted" />
              ) : null}
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`${label}: ${t`Show votes`} — ${text}`}
                aria-haspopup="dialog"
                className="size-7 min-h-7 min-w-7 shrink-0 justify-center p-0 pointer-fine:size-5 pointer-fine:min-h-5 pointer-fine:min-w-5"
                onPress={() => setSelection(id)}
              >
                <Icon size={16} className={color} aria-hidden />
              </Button>
              <div aria-hidden className="pointer-events-none flex min-w-0 flex-wrap ps-1">
                {voters[id].map((person) => (
                  <Avatar key={person.userId} className="-ms-1 size-4 shrink-0">
                    {person.guestName ? (
                      <GuestAvatar name={person.guestName} />
                    ) : (
                      <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                    )}
                    <Avatar.Fallback className="text-[10px]">
                      {displayName(person).replace(/^@/, "").charAt(0)}
                    </Avatar.Fallback>
                  </Avatar>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {selection ? (
        <VoteResultSheet
          label={label}
          voters={voters}
          initialVote={selection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </>
  );
}
