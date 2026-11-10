"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  eventRecordKeys,
  eventRecordVisibility,
  useClientMutationDraft,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button, Switch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Flag } from "lucide-react";
import { useRef, useState } from "react";
import { headerButtonProps } from "@/components/common/layout/headerStyles";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventFinalizeAction({
  event,
  disabled = false,
}: {
  event: PlannedEventResponse;
  disabled?: boolean;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    a = useEventRecordActions(o, event.id),
    [confirm, setConfirm] = useState<{
      scope: string;
      version: number;
      shareResultsWithFriends: boolean;
    } | null>(null);
  const scope = JSON.stringify([o.apiUrl, o.userId, event.id]);
  const stale = Boolean(confirm && (confirm.scope !== scope || confirm.version !== event.version));
  const canShare =
    Boolean(event.groupId) && eventRecordVisibility(event, event.groupType) === "PRIVATE";
  const submitted = useRef(new Set<string>());
  const draft = useClientMutationDraft(
    [...eventRecordKeys.mutation(o, event.id), "finalize"],
    event.version,
  );
  const checking = draft?.phase === "verifying";
  const blocked =
    disabled || a.busy || checking || !event.canFinalize || event.resultsReady !== true;
  if (!canManageEvent(event, o.userId) || event.status !== "CONFIRMED") return null;
  return (
    <div className="flex items-center gap-1">
      {event.resultsReady !== true ? (
        <HelpPopover
          label={t`Why finalization is unavailable`}
          title={t`Finalize event`}
          icon={Flag}
          triggerVariant="primary"
          triggerClassName="opacity-60"
        >
          <p>{t`Save results for every included table before finalizing. Excluded tables do not require results.`}</p>
        </HelpPopover>
      ) : (
        <Button
          {...headerButtonProps}
          variant="primary"
          aria-label={t`Finalize event`}
          isDisabled={blocked}
          onPress={() =>
            setConfirm({ scope, version: event.version, shareResultsWithFriends: false })
          }
        >
          <Flag className="size-5" aria-hidden />
        </Button>
      )}
      {confirm ? (
        <ContactConfirmDialog
          title={t`Finalize event?`}
          description={t`Results and ratings for all included tables become immutable together.`}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={
            stale || checking
              ? []
              : [
                  {
                    label: t`Finalize event`,
                    variant: "primary",
                    icon: <Flag className="size-4" aria-hidden />,
                    onPress: () => {
                      if (blocked || submitted.current.has(scope)) return;
                      submitted.current.add(scope);
                      a.finalize.mutate(
                        {
                          version: confirm.version,
                          ...(canShare
                            ? { shareResultsWithFriends: confirm.shareResultsWithFriends }
                            : {}),
                        },
                        {
                          onSuccess: () => setConfirm(null),
                          onSettled: () => submitted.current.delete(scope),
                        },
                      );
                    },
                  },
                ]
          }
        >
          {canShare ? (
            <div className="space-y-2">
              <Switch
                aria-label={t`Share results with participants' friends`}
                isSelected={confirm.shareResultsWithFriends}
                isDisabled={a.busy || stale || checking}
                onChange={(shareResultsWithFriends) =>
                  setConfirm((current) =>
                    current ? { ...current, shareResultsWithFriends } : null,
                  )
                }
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  {t`Share results with participants' friends`}
                </Switch.Content>
              </Switch>
              <p className="text-sm text-muted">{t`Only the finalized event, tables and results will be visible. Group details stay hidden. This choice cannot be changed after finalization.`}</p>
            </div>
          ) : null}
          {stale ? (
            <p
              role="alert"
              className="text-danger"
            >{t`This event changed. Close this confirmation and review the saved results.`}</p>
          ) : null}
          {checking ? <p role="status">{t`Checking saved changes`}</p> : null}
          {a.finalize.isError && !checking ? (
            <p
              role="alert"
              className="text-danger"
            >{t`Could not verify event finalization. Refresh the event before retrying.`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </div>
  );
}
