import {
  communityAccessDenied,
  ownGroupActions,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { TabBar } from "@/components/common/ui/TabBar";
import { Events } from "@/components/events/Events";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
import { GroupLeaderboard } from "./GroupLeaderboard";
import { GroupMembers } from "./GroupMembers";
export function GroupDetail({
  groupId,
  initialTab = "info",
}: {
  groupId: string;
  initialTab?: "info" | "members";
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    accentForeground = useThemeColor("accent-foreground"),
    q = useGroupRecord(o, groupId),
    a = useGroupRecordActions(o),
    [tab, setTab] = useState<string>(initialTab),
    [confirm, setConfirm] = useState<"decline" | "cancel" | null>(null),
    [error, setError] = useState(false);
  const group = communityAccessDenied(q.error) ? undefined : q.data;
  if (!group)
    return (
      <View style={{ padding: 20, gap: 12 }}>
        {q.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load group details")}
            </Typography>
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  const run = async (action: "request" | "accept" | "decline" | "cancel") => {
    setError(false);
    try {
      if (action === "request") await a.requestJoin.mutateAsync(group.id);
      else if (group.myMembership)
        await a.membership.mutateAsync({
          id: group.id,
          userId: group.myMembership.userId,
          input: { action, version: group.myMembership.version },
        });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: group.name }} />
      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        {group.role === "invited" || group.role === "requested" ? (
          <Typography className="text-muted">
            {t(
              "Membership pending. Events, rankings and group social actions are unavailable until acceptance.",
            )}
          </Typography>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ownGroupActions(group).map((action) => (
            <Button
              key={action}
              size="sm"
              isDisabled={a.busy}
              variant={action === "cancel" || action === "decline" ? "danger-soft" : "primary"}
              onPress={() =>
                action === "cancel" || action === "decline" ? setConfirm(action) : void run(action)
              }
            >
              <Button.Label>
                {action === "request"
                  ? t("Request membership")
                  : action === "accept"
                    ? t("Accept invitation")
                    : action === "decline"
                      ? t("Decline invitation")
                      : group.role === "accepted"
                        ? t("Leave group")
                        : t("Cancel request")}
              </Button.Label>
            </Button>
          ))}
        </View>
        {error ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not update group membership")}
          </Typography>
        ) : null}
      </View>
      <Tabs value={tab} onValueChange={setTab} style={{ flex: 1 }}>
        <View style={{ alignItems: "center" }}>
          <TabBar>
            {[
              ["info", t("Overview")],
              ["members", t("Members")],
              ["events", t("Events")],
              ["rankings", t("Rankings")],
            ]
              .filter(
                ([key]) =>
                  key === "info" ||
                  (key === "members"
                    ? group.canViewMembers
                    : key === "events"
                      ? group.canViewEvents
                      : group.canViewRankings),
              )
              .map(([key, label]) => (
                <Tabs.Trigger key={key} value={key}>
                  <Tabs.Label>{label}</Tabs.Label>
                </Tabs.Trigger>
              ))}
          </TabBar>
        </View>
        <View style={{ flex: 1 }}>
          {tab === "members" && group.canViewMembers ? (
            <GroupMembers group={group} />
          ) : tab === "events" && group.canViewEvents ? (
            <Events groupId={group.id} canCreate={group.role === "admin" && group.canInvite} />
          ) : tab === "rankings" && group.canViewRankings ? (
            <GroupLeaderboard groupId={group.id} />
          ) : (
            <ScreenScrollView>
              <GroupDetailsCard group={group} />
            </ScreenScrollView>
          )}
        </View>
      </Tabs>
      {group.canEdit ? (
        <FloatingActions
          label={t("Edit group")}
          isDisabled={a.busy}
          onPress={() => router.push({ pathname: "/group/wizard", params: { groupId: group.id } })}
        >
          <Pencil size={24} color={accentForeground} />
        </FloatingActions>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={group.role === "accepted" ? t("Leave group") : t("Cancel membership")}
          description={t(
            "Active table registrations are removed. Historical results remain unchanged.",
          )}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t("Confirm"), variant: "danger", onPress: () => void run(confirm) }]}
        >
          {error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not update group membership")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
