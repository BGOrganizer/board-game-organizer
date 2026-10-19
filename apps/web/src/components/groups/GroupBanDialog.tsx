"use client";
import { eventLocalDateTime, groupBanDeadline } from "@board-game-organizer/shared";
import { Input, Label, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
export function GroupBanDialog({
  name,
  busy,
  failure,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  failure?: string;
  onCancel: () => void;
  onConfirm: (until: string | null) => void;
}) {
  const { t } = useLingui();
  const [zone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
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
      title={`${t`Exclude from group`}: ${name}`}
      description={t`Group exclusion is separate from global blocking. Membership and active registrations are removed; expiry or revocation never restores them. Historical results remain unchanged.`}
      busy={busy}
      onCancel={onCancel}
      actions={[{ label: t`Exclude from group`, variant: "danger", onPress: submit }]}
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
        <p className="text-sm text-default-500">{t`Time zone: ${zone}`}</p>
        {error || failure ? (
          <p role="alert" className="text-danger">
            {error || failure}
          </p>
        ) : null}
      </div>
    </ContactConfirmDialog>
  );
}
