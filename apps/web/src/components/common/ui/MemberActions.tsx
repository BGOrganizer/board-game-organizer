"use client";
import { Button, Drawer } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundCog } from "lucide-react";
import { type ReactNode, useState } from "react";

export function MemberActions<Action extends string>({
  title,
  busy,
  items,
  onAction,
}: {
  title: string;
  busy: boolean;
  items: readonly { action: Action; label: string; icon: ReactNode }[];
  onAction: (action: Action) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <Drawer.Trigger
        className="button button--primary button--icon-only button--sm"
        isDisabled={busy}
        aria-label={title}
      >
        <UserRoundCog className="size-5" aria-hidden />
      </Drawer.Trigger>
      <Drawer.Backdrop>
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="mx-auto w-full max-w-md">
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2">
              {items.map(({ action, label, icon }) => (
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
                  {icon}
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
