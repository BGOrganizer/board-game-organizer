"use client";
import { useAppStore } from "@board-game-organizer/store";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
export function ProfileLogout() {
  const { t } = useLingui(),
    { signOut } = useClerk();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await signOut({ redirectUrl: "/" });
      useAppStore.getState().clearProfileViews();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <div className="space-y-2">
      {failed ? (
        <p role="alert" className="text-danger">{t`Could not sign out. Try again.`}</p>
      ) : null}
      <Button variant="danger" className="w-full" isDisabled={busy} onPress={() => setOpen(true)}>
        <LogOut className="size-4" aria-hidden />
        {t`Sign out of your account`}
      </Button>
      {open ? (
        <ContactConfirmDialog
          title={t`Sign out of your account?`}
          description={t`You will need to sign in again to access your account.`}
          busy={busy}
          onCancel={() => setOpen(false)}
          actions={[{ label: t`Sign out`, variant: "danger", onPress: () => void run() }]}
        />
      ) : null}
    </div>
  );
}
