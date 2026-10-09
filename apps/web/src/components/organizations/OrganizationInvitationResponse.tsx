"use client";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ClipboardCheck, X } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";

export function OrganizationInvitationResponse({
  busy,
  onAction,
}: {
  busy: boolean;
  onAction: (action: "accept" | "decline") => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        isIconOnly
        aria-label={t`Respond to organization invitation`}
        isDisabled={busy}
        onPress={() => setOpen(true)}
      >
        <ClipboardCheck className="size-4" aria-hidden />
      </Button>
      {open ? (
        <ContactConfirmDialog
          title={t`Respond to organization invitation`}
          description={t`Accept or reject this organization invitation.`}
          busy={busy}
          cancelLast
          cancelIcon={<X className="size-4" aria-hidden />}
          onCancel={() => {
            if (!busy) setOpen(false);
          }}
          actions={[
            {
              label: t`Accept`,
              icon: <Check className="size-4" aria-hidden />,
              variant: "primary",
              onPress: () => {
                onAction("accept");
                setOpen(false);
              },
            },
            {
              label: t`Reject`,
              icon: <X className="size-4" aria-hidden />,
              variant: "danger",
              onPress: () => {
                onAction("decline");
                setOpen(false);
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}
