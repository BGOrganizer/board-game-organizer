"use client";

import type { OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import { Drawer, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { WindowedList } from "@/components/common/ui/WindowedList";

export function VoteResultSheet({
  label,
  voters,
  initialVote = "YES",
  onClose,
}: {
  label: string;
  voters: Voters;
  initialVote?: keyof Voters;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const choices = [
    { id: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
    { id: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
    { id: "NO", text: t`No`, Icon: X, color: "text-danger" },
  ] as const;
  const displayName = ({ name, username, guestName }: Voters["YES"][number]) =>
    guestName ?? name ?? (username ? `@${username}` : t`Unknown`);
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog
          className="mx-auto w-full max-w-lg"
          style={{ maxHeight: "calc(var(--app-visible-height, 100dvh) * 0.85)" }}
        >
          <Drawer.Handle />
          <Drawer.CloseTrigger aria-label={t`Close`} />
          <Drawer.Header>
            <Drawer.Heading>{t`Votes`}</Drawer.Heading>
            <p className="text-sm text-muted">{label}</p>
          </Drawer.Header>
          <Drawer.Body className="flex min-h-0 flex-col overflow-hidden">
            <Tabs className="flex min-h-0 flex-col" defaultSelectedKey={initialVote}>
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
                                person.guestName ? (
                                  <GuestAvatar name={person.guestName} />
                                ) : undefined
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
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
