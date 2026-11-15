import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  eventRecordKeys,
  eventRecordVisibility,
  useClientMutationDraft,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Flag } from "lucide-react-native";
import { useRef, useState } from "react";
import { View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventFinalizeAction({
  event,
  disabled = false,
}: {
  event: PlannedEventResponse;
  disabled?: boolean;
}) {
  const t = useT(),
    o = useCommunityApi(),
    a = useEventRecordActions(o, event.id),
    [confirm, setConfirm] = useState<{
      scope: string;
      version: number;
      shareResultsWithFriends: boolean;
    } | null>(null),
    foreground = useThemeColor("accent-foreground");
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {event.resultsReady !== true ? (
        <HelpPopover
          label={t("Why finalization is unavailable")}
          title={t("Finalize event")}
          icon={Flag}
          triggerVariant="primary"
          triggerClassName="opacity-60"
        >
          <Typography className="text-foreground">
            {t(
              "Save results for every included table before finalizing. Excluded tables do not require results.",
            )}
          </Typography>
        </HelpPopover>
      ) : (
        <Button
          {...headerButtonProps}
          variant="primary"
          accessibilityLabel={t("Finalize event")}
          testID="event-finalize-results"
          isDisabled={blocked}
          onPress={() =>
            setConfirm({ scope, version: event.version, shareResultsWithFriends: false })
          }
        >
          <Flag size={HEADER_ICON_SIZE} color={foreground} accessible={false} />
        </Button>
      )}
      {confirm ? (
        <ConfirmDialog
          title={t("Finalize event?")}
          description={t("Results and ratings for all included tables become immutable together.")}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={
            stale || checking
              ? []
              : [
                  {
                    label: t("Finalize event"),
                    variant: "primary",
                    icon: <Flag size={16} color={foreground} accessible={false} />,
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
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Typography className="text-foreground" style={{ flex: 1 }}>
                  {t("Share results with participants' friends")}
                </Typography>
                <Switch
                  testID="event-results-share-switch"
                  accessibilityLabel={t("Share results with participants' friends")}
                  isSelected={confirm.shareResultsWithFriends}
                  isDisabled={a.busy || stale || checking}
                  onSelectedChange={(shareResultsWithFriends) =>
                    setConfirm((current) =>
                      current ? { ...current, shareResultsWithFriends } : null,
                    )
                  }
                />
              </View>
              <Typography className="text-sm text-muted">
                {t(
                  "Only the finalized event, tables and results will be visible. Group details stay hidden. This choice cannot be changed after finalization.",
                )}
              </Typography>
            </View>
          ) : null}
          {stale ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("This event changed. Close this confirmation and review the saved results.")}
            </Typography>
          ) : null}
          {checking ? (
            <Typography accessibilityLiveRegion="polite" className="text-foreground">
              {t("Checking saved changes")}
            </Typography>
          ) : null}
          {a.finalize.isError && !checking ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not verify event finalization. Refresh the event before retrying.")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
