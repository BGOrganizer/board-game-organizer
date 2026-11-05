"use client";
import { eventLocalDateTime, groupBanDeadline } from "@board-game-organizer/shared";
import { Input, Label, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Ban } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
export function GroupBanDialog({
  name,
  timeZone,
  busy,
  failure,
  onCancel,
  onConfirm,
}: {
  name: string;
  timeZone?: string;
  busy: boolean;
  failure?: string;
  onCancel: () => void;
  onConfirm: (until: string | null) => void;
}) {
  const { t } = useLingui();
  const [zone] = useState(() => timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [timed, setTimed] = useState(false),
    [wall, setWall] = useState(() =>
      eventLocalDateTime(new Date(Date.now() + 86400_000).toISOString(), zone),
    ),
    [error, setError] = useState("");
  const submit = () => {
    const until = groupBanDeadline(timed, wall, zone, Date.now());
    if (until === undefined) {
      setError(t`Choose a valid future date and time.`);
      return;
    }
    setError("");
    onConfirm(until);
  };
  return (
    <ContactConfirmDialog
      title={`${t`Ban from group`}: ${name}`}
      description={t`Group exclusion is separate from global blocking. Membership and active registrations are removed; expiry or revocation never restores them. Historical results remain unchanged.`}
      busy={busy}
      onCancel={onCancel}
      actions={[
        {
          label: t`Ban from group`,
          variant: "danger",
          icon: <Ban className="size-4" aria-hidden />,
          onPress: submit,
        },
      ]}
    >
      <div className="space-y-3">
        <Switch isSelected={timed} isDisabled={busy} onChange={setTimed}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            {t`Temporary exclusion`}
          </Switch.Content>
        </Switch>
        {timed ? (
          <TextField value={wall} onChange={setWall} isDisabled={busy} isInvalid={Boolean(error)}>
            <Label>{t`Excluded until`}</Label>
            <Input type="datetime-local" />
          </TextField>
        ) : null}
        {error || failure ? (
          <p role="alert" className="text-danger">
            {error || failure}
          </p>
        ) : null}
      </div>
    </ContactConfirmDialog>
  );
}
