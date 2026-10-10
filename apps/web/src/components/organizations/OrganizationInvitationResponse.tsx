"use client";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ClipboardCheck, X } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";

export function OrganizationInvitationResponse({
  busy,
  onAction,
  presentation = "response",
}: {
  busy: boolean;
  presentation?: "response" | "choices";
  onAction: (action: "accept" | "decline") => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"accept" | "decline" | null>(null);
  return (
    <>
      {presentation === "choices" ? (
        <>
          <Button
            isIconOnly
            aria-label={t`Accept organization invitation`}
            isDisabled={busy}
            onPress={() => {
              setChoice("accept");
              setOpen(true);
            }}
          >
            <Check className="size-4" aria-hidden />
          </Button>
          <Button
            isIconOnly
            variant="danger-soft"
            aria-label={t`Reject organization invitation`}
            isDisabled={busy}
            onPress={() => {
              setChoice("decline");
              setOpen(true);
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </>
      ) : (
        <Button
          isIconOnly
          aria-label={t`Respond to organization invitation`}
          isDisabled={busy}
          onPress={() => {
            setChoice(null);
            setOpen(true);
          }}
        >
          <ClipboardCheck className="size-4" aria-hidden />
        </Button>
      )}
      {open ? (
        <ContactConfirmDialog
          title={
            choice === "accept"
              ? t`Accept organization invitation`
              : choice === "decline"
                ? t`Reject organization invitation`
                : t`Respond to organization invitation`
          }
          description={
            choice ? t`Are you sure?` : t`Accept or reject this organization invitation.`
          }
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
              variant: "primary" as const,
              onPress: () => {
                onAction("accept");
                setOpen(false);
              },
            },
            {
              label: t`Reject`,
              icon: <X className="size-4" aria-hidden />,
              variant: "danger" as const,
              onPress: () => {
                onAction("decline");
                setOpen(false);
              },
            },
          ].filter((_action, index) => choice === null || index === (choice === "accept" ? 0 : 1))}
        />
      ) : null}
    </>
  );
}
