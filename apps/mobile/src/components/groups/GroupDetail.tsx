import { notificationItemId } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  isGroupManagerRole,
  ownGroupActions,
  useGroupRecord,
  useGroupRecordActions,
  useNotificationChanges,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Info,
  LogOut,
  Pencil,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { Events } from "@/components/events/Events";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesAlert } from "@/components/notifications/NotificationChangesAlert";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
import { GroupIdentityCard } from "./GroupIdentityCard";
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
    warning = useThemeColor("warning-soft-foreground"),
    q = useGroupRecord(o, groupId),
    a = useGroupRecordActions(o, groupId),
    [tab, setTab] = useState<string>(initialTab),
    [confirm, setConfirm] = useState<"decline" | "cancel" | "delete" | null>(null),
    [error, setError] = useState(false);
  const group = communityAccessDenied(q.error) ? undefined : q.data;
  const selectedTab =
    (tab === "members" && !group?.canViewMembers) || (tab === "events" && !group?.canViewEvents)
      ? "info"
      : tab;
  const changes = useNotificationChanges(
    { ...o, enabled: o.enabled !== false && Boolean(group) },
    {
      kind: "group",
      id: groupId,
      tab: selectedTab === "info" ? "details" : selectedTab === "members" ? "members" : "none",
    },
  );
  const ownBusy = a.isPersonBusy(groupId, o.userId ?? "");
  const canDelete = group?.role === "admin";
  const header = (
    <Stack.Screen
      options={{
        title: group?.name ?? t("Group details"),
        headerRight: () =>
          canDelete || group?.myMembership?.status === "ACCEPTED" ? (
            <Button
              {...headerButtonProps}
              variant="danger"
              isDisabled={canDelete ? a.busy : ownBusy}
              accessibilityLabel={canDelete ? t("Delete group") : t("Leave group")}
              onPress={() => {
                setError(false);
                setConfirm(canDelete ? "delete" : "cancel");
              }}
            >
              {canDelete ? (
                <Trash2 size={HEADER_ICON_SIZE} color={dangerForeground} />
              ) : (
                <LogOut size={HEADER_ICON_SIZE} color={dangerForeground} />
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
  const run = (action: "request" | "accept" | "decline" | "cancel" | "delete") => {
    if (action === "delete") {
      if (!canDelete || a.isBusy(group.id)) return;
      a.remove.mutate({ id: group.id, input: { version: group.version, deleteEvents: true } });
      setConfirm(null);
      router.replace("/(tabs)/groups");
      return;
    }
    if (a.isPersonBusy(group.id, o.userId ?? "") || !ownGroupActions(group).includes(action))
      return;
    if (action === "request") a.requestJoin.mutate(group.id);
    else if (group.myMembership)
      a.membership.mutate({
        id: group.id,
        userId: group.myMembership.userId,
        input: { action, version: group.myMembership.version },
      });
    setError(false);
    setConfirm(null);
  };
  const bodyActions = ownGroupActions(group).filter(
    (action) =>
      action === "request" || (action === "cancel" && group.myMembership?.status !== "ACCEPTED"),
  );
  return (
    <NotificationAttentionScope
      options={o}
      targets={[
        { kind: "group", id: group.id },
        ...(group.canViewEvents ? [{ kind: "event-list" as const, id: group.id }] : []),
        { kind: "item", id: notificationItemId(group.id, "invitation") },
        { kind: "item", id: notificationItemId(group.id, "members") },
        { kind: "item", id: notificationItemId(group.id, "overview", undefined, "group") },
      ]}
    >
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
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <GroupIdentityCard group={group} />
        </View>
        <Tabs value={selectedTab} onValueChange={setTab} style={{ flex: 1 }}>
          <View style={{ alignSelf: "stretch", marginTop: 8, maxWidth: "100%" }}>
            <TabBar>
              {(
                [
                  ["info", t("Details"), Info],
                  ["members", t("Members"), UsersRound],
                  ["events", t("Events"), CalendarDays],
                  ["rankings", t("Ranking"), ChartNoAxesCombined],
                ] as const
              )
                .filter(
                  ([key]) =>
                    key === "info" ||
                    (key === "members"
                      ? group.canViewMembers
                      : key === "events"
                        ? group.canViewEvents
                        : group.canViewRankings),
                )
                .map(([key, label, icon]) => (
                  <TabTrigger
                    icon={icon}
                    key={key}
                    value={key}
                    style={{ flexDirection: "row", gap: 6 }}
                  >
                    <Tabs.Label>{label}</Tabs.Label>
                    {key === "info" ? (
                      <NotificationTabBadge
                        target={{ kind: "group", id: group.id }}
                        count={changes.tabCounts.details}
                        overviewItems={[
                          notificationItemId(group.id, "invitation"),
                          notificationItemId(group.id, "overview", undefined, "group"),
                        ]}
                      />
                    ) : null}
                    {key === "events" ? (
                      <NotificationTabBadge target={{ kind: "event-list", id: group.id }} />
                    ) : null}
                    {key === "members" ? (
                      <NotificationTabBadge
                        target={{ kind: "item", id: notificationItemId(group.id, "members") }}
                        count={changes.tabCounts.members}
                      />
                    ) : null}
                    {key === "members" &&
                    isGroupManagerRole(group.role) &&
                    (group.pendingRequestCount ?? 0) > 0 ? (
                      <View accessible accessibilityLabel={t("Requests to review")}>
                        <UserRoundPlus size={16} color={warning} accessible={false} />
                      </View>
                    ) : null}
                  </TabTrigger>
                ))}
            </TabBar>
          </View>
          {selectedTab === "info" || selectedTab === "members" ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, flexShrink: 1 }}>
              <NotificationChangesAlert
                key={JSON.stringify([o.apiUrl, o.userId, group.id, selectedTab])}
                model={changes}
              />
            </View>
          ) : null}
          <View style={{ flex: 1, paddingTop: 8 }}>
            {tab === "members" && group.canViewMembers ? (
              <GroupMembers group={group} />
            ) : tab === "events" && group.canViewEvents ? (
              <Events
                groupId={group.id}
                canCreate={isGroupManagerRole(group.role) && group.canInvite}
              />
            ) : tab === "rankings" && group.canViewRankings ? (
              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <GroupLeaderboard groupId={group.id} />
              </View>
            ) : (
              <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
                <GroupDetailsCard group={group} identity={null} />
                {bodyActions.length ? (
                  <GroupJoinRequest
                    pending={group.role === "requested"}
                    busy={ownBusy}
                    onRequest={() => void run("request")}
                    onCancel={() => {
                      setError(false);
                      setConfirm("cancel");
                    }}
                  />
                ) : null}
                {group.role === "invited" ? (
                  <GroupInvitationCard
                    groupId={group.id}
                    busy={ownBusy}
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
            onPress={() =>
              router.push({ pathname: "/group/wizard", params: { groupId: group.id } })
            }
          >
            <Pencil size={24} color={accentForeground} />
          </FloatingActions>
        ) : null}
        {confirm && (confirm !== "delete" || canDelete) ? (
          <ConfirmDialog
            title={
              confirm === "delete"
                ? t("Delete group")
                : group.myMembership?.status === "ACCEPTED"
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
            busy={confirm === "delete" ? a.busy : ownBusy}
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
    </NotificationAttentionScope>
  );
}
