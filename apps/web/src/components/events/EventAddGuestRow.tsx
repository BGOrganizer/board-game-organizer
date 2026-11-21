"use client";

import { GUEST_NAME_MAX_LENGTH, tableGuestDetailsSchema } from "@board-game-organizer/schemas";
import type { useTableGuestActions } from "@board-game-organizer/shared";
import { Avatar, Button, Drawer, Input, Label, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { AtSign, Mail, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function EventAddGuestRow({
  guest,
  disabled,
  onSaved,
}: {
  guest: ReturnType<typeof useTableGuestActions>;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const details = tableGuestDetailsSchema.safeParse({ name, email: email.trim() || undefined });
  const invalidEmail =
    emailTouched &&
    !tableGuestDetailsSchema.shape.email.safeParse(email.trim() || undefined).success;
  const saving = guest.add.isPending;

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setEmailTouched(false);
    guest.add.reset();
  }

  return (
    <li className="list-none">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-muted" aria-hidden />
        <span className="font-semibold">{t`Guest`}</span>
        <HelpPopover label={t`About guests`} title={t`Guest`} size="compact">
          {t`Add someone who does not have a Board Game Organizer account.`}
        </HelpPopover>
      </div>
      <GroupedList>
        <GroupedRow>
          <Avatar size="md" aria-hidden>
            <Avatar.Fallback>
              <UserRound className="size-5" />
            </Avatar.Fallback>
          </Avatar>
          <span className="min-w-0 flex-1">{t`Add a guest`}</span>
          <Button
            isIconOnly
            size="sm"
            variant="primary"
            className="min-h-11 min-w-11"
            aria-label={t`Add a guest`}
            isDisabled={disabled || saving}
            onPress={() => setOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </GroupedRow>
      </GroupedList>
      <Drawer.Backdrop
        isOpen={open}
        isDismissable={!saving}
        isKeyboardDismissDisabled={saving}
        onOpenChange={(next) => {
          if (!next && !saving) close();
        }}
      >
        <Drawer.Content placement="bottom">
          <Drawer.Dialog
            className="mx-auto w-full max-w-md"
            style={{ maxHeight: "var(--app-visible-height, 100dvh)" }}
            data-form-scope
          >
            <Drawer.Handle />
            <Drawer.CloseTrigger aria-label={t`Close`} isDisabled={saving} />
            <Drawer.Header>
              <Drawer.Heading>{t`Add a guest`}</Drawer.Heading>
            </Drawer.Header>
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (!details.success || disabled || saving) return;
                guest.addGuest(details.data, () => {
                  close();
                  onSaved();
                });
              }}
            >
              <Drawer.Body className="grid gap-3 overflow-y-auto">
                <TextField fullWidth isRequired isDisabled={saving} value={name} onChange={setName}>
                  <Label className="flex items-center gap-2">
                    <AtSign className="size-4" aria-hidden />
                    {t`Username`}
                  </Label>
                  <Input
                    placeholder={t`Enter a username`}
                    autoComplete="off"
                    maxLength={GUEST_NAME_MAX_LENGTH}
                  />
                </TextField>
                <TextField
                  fullWidth
                  type="email"
                  isDisabled={saving}
                  value={email}
                  onChange={setEmail}
                  isInvalid={invalidEmail}
                >
                  <Label className="flex items-center gap-2">
                    <Mail className="size-4" aria-hidden />
                    {t`Email (optional)`}
                  </Label>
                  <Input
                    placeholder={t`Enter an email address`}
                    autoComplete="off"
                    maxLength={320}
                    onBlur={() => setEmailTouched(true)}
                    aria-describedby={invalidEmail ? "guest-email-error" : undefined}
                  />
                  {invalidEmail ? (
                    <p
                      id="guest-email-error"
                      className="text-sm text-danger"
                      role="alert"
                    >{t`Enter a valid email address.`}</p>
                  ) : null}
                </TextField>
                {guest.add.isError ? (
                  <p className="text-danger" role="alert">{t`Could not add guest. Try again.`}</p>
                ) : null}
              </Drawer.Body>
              <Drawer.Footer>
                <Button
                  fullWidth
                  type="submit"
                  variant="primary"
                  isDisabled={!details.success || disabled || saving}
                >
                  {t`Add`}
                </Button>
              </Drawer.Footer>
            </form>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </li>
  );
}
