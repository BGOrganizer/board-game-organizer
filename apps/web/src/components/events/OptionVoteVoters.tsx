"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Avatar, Button, Popover, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { WindowedList } from "@/components/common/ui/WindowedList";

type Voters = NonNullable<PlannedTableResponse["gameVoteVoters"]>[string];

export function OptionVoteVoters({
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
        {groups.map(({ id, text, Icon, color }) => {
          const paired = voters[id].length === 2;
          return (
            <li
              key={id}
              aria-label={`${text}: ${voters[id].map(displayName).join(", ")}`}
              className="flex flex-wrap items-center gap-0.5"
            >
              <Icon
                size={16}
                className={
                  paired
                    ? `${color} pointer-events-none pointer-coarse:z-10 pointer-coarse:translate-x-5`
                    : color
                }
                aria-hidden
              />
              {voters[id].map((person, index) => {
                const name = displayName(person);
                const guestAvatar = person.guestName ? (
                  <GuestAvatar name={person.guestName} />
                ) : undefined;
                return (
                  <Popover key={person.userId}>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`${name} (${text})`}
                      className="size-11 min-h-11 min-w-11 transform-none rounded-full bg-transparent p-0 pointer-fine:size-4 pointer-fine:min-h-4 pointer-fine:min-w-4"
                    >
                      <Avatar
                        className={
                          paired
                            ? `size-4 ${index === 0 ? "pointer-coarse:translate-x-3" : "pointer-coarse:-translate-x-3"}`
                            : "size-4"
                        }
                        aria-hidden
                      >
                        {guestAvatar ?? <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />}
                        <Avatar.Fallback className="text-[10px]">
                          {name.replace(/^@/, "").charAt(0)}
                        </Avatar.Fallback>
                      </Avatar>
                    </Button>
                    <Popover.Content placement="bottom" className="w-64 max-w-[calc(100vw-2rem)]">
                      <Popover.Dialog aria-label={name}>
                        <UserListRow
                          as="div"
                          name={name}
                          avatarUrl={person.avatarUrl}
                          avatarContent={guestAvatar}
                          secondary={
                            person.name && person.username ? `@${person.username}` : undefined
                          }
                        />
                      </Popover.Dialog>
                    </Popover.Content>
                  </Popover>
                );
              })}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Tabs className="flex min-h-0 flex-col" defaultSelectedKey="YES">
      <TabBar label={t`Votes`}>
        {choices.map(({ id, text, Icon, color }) => (
          <TabTrigger key={id} id={id} icon={Icon} iconClassName={color}>
            {text}
          </TabTrigger>
        ))}
      </TabBar>
      {choices.map(({ id, text }) => (
        <Tabs.Panel key={id} id={id} className="min-h-0 overflow-y-auto">
          {voters[id].length ? (
            <div className="rounded-xl bg-surface">
              <WindowedList
                items={voters[id]}
                label={text}
                itemKey={(person) => person.userId}
                gap={0}
                estimatedRowHeight={52}
                onEndReached={() => {}}
                renderItem={(person) => (
                  <GroupedRow as="div" className="py-1.5">
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
                )}
              />
            </div>
          ) : (
            <p className="p-3 text-sm text-muted">{t`No votes`}</p>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
