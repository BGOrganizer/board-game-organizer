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
import { LogOut, Pencil, Trash2 } from "lucide-react-native";
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
import { GroupInvitationCard } from "./GroupInvitationCard";
import { GroupJoinRequest } from "./GroupJoinRequest";
import { GroupLeaderboard } from "./GroupLeaderboard";
import { GroupMembers } from "./GroupMembers";
export function GroupDetail({
  groupId,
  initialTab = "info",
}: {
  groupId: string;
  initialTab?: "info" | "members" | "events";
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    accentForeground = useThemeColor("accent-foreground"),
    dangerForeground = useThemeColor("danger-foreground"),
    q = useGroupRecord(o, groupId),
    a = useGroupRecordActions(o, groupId),
    [tab, setTab] = useState<string>(initialTab),
    [confirm, setConfirm] = useState<"decline" | "cancel" | "delete" | null>(null),
    [error, setError] = useState(false);
  const group = communityAccessDenied(q.error) ? undefined : q.data;
  const header = (
    <Stack.Screen
      options={{
        title: group?.name ?? t("Group details"),
        headerRight: () =>
          group?.canEdit ||
          (group?.role === "accepted" && group.myMembership?.status === "ACCEPTED") ? (
            <Button
              isIconOnly
              size="sm"
              variant="danger"
              isDisabled={a.busy}
              accessibilityLabel={group?.canEdit ? t("Delete group") : t("Leave group")}
              style={{ minWidth: 44, minHeight: 44 }}
              onPress={() => {
                setError(false);
                setConfirm(group?.canEdit ? "delete" : "cancel");
              }}
            >
              {group?.canEdit ? (
                <Trash2 size={20} color={dangerForeground} />
              ) : (
                <LogOut size={20} color={dangerForeground} />
              )}
            </Button>
          ) : null,
      }}
    />
  );
  if (!group)
    return (
      <View style={{ padding: 20, gap: 12 }}>
        {header}
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
  const run = async (action: "request" | "accept" | "decline" | "cancel" | "delete") => {
    setError(false);
    try {
      if (action === "delete") {
        await a.remove.mutateAsync({
          id: group.id,
          input: { version: group.version, deleteEvents: true },
        });
        setConfirm(null);
        router.replace("/(tabs)/groups");
        return;
      }
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
  const bodyActions = ownGroupActions(group).filter(
    (action) => action === "request" || (action === "cancel" && group.role !== "accepted"),
  );
  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        {error ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {confirm === "delete"
              ? t("Could not delete group")
              : t("Could not update group membership")}
          </Typography>
        ) : null}
      </View>
      <Tabs
        value={
          (tab === "events" && !group.canViewEvents) || (tab === "members" && !group.canViewMembers)
            ? "info"
            : tab
        }
        onValueChange={setTab}
        style={{ flex: 1 }}
      >
        <View style={{ alignSelf: "center", marginTop: 16, maxWidth: "100%" }}>
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
            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              <GroupLeaderboard groupId={group.id} />
            </View>
          ) : (
            <ScreenScrollView>
              <GroupDetailsCard group={group} />
              {bodyActions.length ? (
                <GroupJoinRequest
                  pending={group.role === "requested"}
                  busy={a.busy}
                  onRequest={() => void run("request")}
                  onCancel={() => {
                    setError(false);
                    setConfirm("cancel");
                  }}
                />
              ) : null}
              {group.role === "invited" ? (
                <GroupInvitationCard
                  busy={a.busy}
                  onAccept={() => void run("accept")}
                  onDecline={() => {
                    setError(false);
                    setConfirm("decline");
                  }}
                />
              ) : null}
            </ScreenScrollView>
          )}
        </View>
      </Tabs>
      {group.canEdit && tab === "info" ? (
        <FloatingActions
          label={t("Edit group")}
          isDisabled={a.busy}
          onPress={() => router.push({ pathname: "/group/wizard", params: { groupId: group.id } })}
        >
          <Pencil size={24} color={accentForeground} />
        </FloatingActions>
      ) : null}
      {confirm && (confirm !== "delete" || group.canEdit) ? (
        <ConfirmDialog
          title={
            confirm === "delete"
              ? t("Delete group")
              : group.role === "accepted"
                ? t("Leave group")
                : t("Cancel membership")
          }
          description={
            confirm === "delete"
              ? t(
                  "Permanently delete this group and all its events, tables, registrations, votes, results and group rankings? Personal GLOBAL ratings remain unchanged. This cannot be undone.",
                )
              : t("Active table registrations are removed. Historical results remain unchanged.")
          }
          busy={a.busy}
          onCancel={() => {
            setConfirm(null);
            setError(false);
          }}
          actions={[
            {
              label: confirm === "delete" ? t("Delete group and events") : t("Confirm"),
              variant: "danger",
              onPress: () => void run(confirm),
              ...(confirm === "delete"
                ? { icon: <Trash2 size={18} color={dangerForeground} /> }
                : {}),
            },
          ]}
        >
          {error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {confirm === "delete"
                ? t("Could not delete group")
                : t("Could not update group membership")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
