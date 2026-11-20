"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserAvatar } from "@/components/common/ui/UserAvatar";

type Voters = NonNullable<PlannedTableResponse["gameVoteVoters"]>[string];

export function GameVoteVoters({
  label,
  voters,
  compact = false,
}: {
  label: string;
  voters: Voters;
  compact?: boolean;
}) {
  const { t } = useLingui();
  const choices = [
    { id: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
    { id: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
    { id: "NO", text: t`No`, Icon: X, color: "text-danger" },
  ] as const;
  const displayName = ({ name, username, guestName }: Voters["YES"][number]) =>
    guestName ?? name ?? (username ? `@${username}` : t`Unknown`);
  if (compact) {
    const groups = choices.filter(({ id }) => voters[id].length);
    if (!groups.length) return null;
    return (
      <ul
        aria-label={`${t`Votes`}: ${label}`}
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        {groups.map(({ id, text, Icon, color }) => (
          <li
            key={id}
            aria-label={`${text}: ${voters[id].map(displayName).join(", ")}`}
            className="flex flex-wrap items-center gap-0.5"
          >
            <Icon size={12} className={color} aria-hidden />
            {voters[id].map((person) => (
              <Avatar key={person.userId} className="size-3" aria-hidden>
                {person.guestName ? (
                  <GuestAvatar name={person.guestName} />
                ) : (
                  <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                )}
                <Avatar.Fallback className="text-[8px]">
                  {displayName(person).replace(/^@/, "").charAt(0)}
                </Avatar.Fallback>
              </Avatar>
            ))}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {choices.map(({ id, text, Icon, color }) => (
        <section key={id} aria-label={text} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon size={18} className={color} aria-hidden />
            {text}
          </h3>
          {voters[id].length ? (
            <GroupedList>
              {voters[id].map((person) => (
                <GroupedRow key={person.userId} className="py-1.5">
                  <UserAvatar
                    name={displayName(person)}
                    avatarUrl={person.avatarUrl}
                    avatarContent={
                      person.guestName ? <GuestAvatar name={person.guestName} /> : undefined
                    }
                  />
                  <div className="min-w-0 text-sm break-words">
                    <p className="font-medium">{displayName(person)}</p>
                    {person.name && person.username ? (
                      <p className="text-xs text-muted">@{person.username}</p>
                    ) : null}
                  </div>
                </GroupedRow>
              ))}
            </GroupedList>
          ) : (
            <p className="pl-6 text-sm text-muted">{t`No votes`}</p>
          )}
        </section>
      ))}
    </div>
  );
}
