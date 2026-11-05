"use client";
import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { type GroupPersonAction, groupPersonActions } from "@board-game-organizer/shared";
import { Button, Drawer } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Ban, ShieldMinus, ShieldPlus, UserRoundCog, UserRoundMinus } from "lucide-react";
import { useState } from "react";

export function GroupMemberActions({
  group,
  person,
  busy,
  onAction,
}: {
  group: GroupRecordResponse;
  person: GroupPersonResponse;
  busy: boolean;
  onAction: (action: GroupPersonAction) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const allowed = groupPersonActions(group, person);
  const items = [
    { action: "ban", label: t`Ban from group`, Icon: Ban },
    { action: "remove", label: t`Remove member`, Icon: UserRoundMinus },
    { action: "promote", label: t`Make moderator`, Icon: ShieldPlus },
    { action: "demote", label: t`Demote to member`, Icon: ShieldMinus },
  ] as const;
  if (!items.some((item) => allowed.includes(item.action))) return null;
  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <Drawer.Trigger
        className="button button--primary button--icon-only button--sm"
        isDisabled={busy}
        aria-label={`${t`Manage member`}: ${person.username || person.name || t`Username unavailable`}`}
      >
        <UserRoundCog className="size-5" aria-hidden />
      </Drawer.Trigger>
      <Drawer.Backdrop>
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="mx-auto w-full max-w-md">
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>
                {t`Manage member`}: {person.username || person.name || t`Username unavailable`}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2">
              {items
                .filter((item) => allowed.includes(item.action))
                .map(({ action, label, Icon }) => (
                  <Button
                    key={action}
                    className="min-h-11 w-full justify-start"
                    variant="ghost"
                    isDisabled={busy}
                    onPress={() => {
                      setOpen(false);
                      onAction(action);
                    }}
                  >
                    <Icon className="size-5" aria-hidden />
                    {label}
                  </Button>
                ))}
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="ghost" onPress={() => setOpen(false)}>{t`Cancel`}</Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
