"use client";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  isGroupManagerRole,
  ownGroupActions,
  useGroupRecord,
  useGroupRecordActions,
  useNotificationChanges,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  CalendarDays,
  ChartNoAxesCombined,
  Info,
  LogOut,
  Pencil,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { headerButtonProps } from "@/components/common/layout/headerStyles";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { Events } from "@/components/events/Events";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesAlert } from "@/components/notifications/NotificationChangesAlert";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
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
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
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
  const failure =
    confirm === "delete" ? t`Could not delete group` : t`Could not update group membership`;
  if (!group)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load group details`}</p>
        <Button variant="outline" onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  const run = (action: "request" | "accept" | "decline" | "cancel" | "delete") => {
    if (action === "delete") {
      if (!canDelete || a.isBusy(group.id)) return;
      a.remove.mutate({ id: group.id, input: { version: group.version, deleteEvents: true } });
      setConfirm(null);
      router.replace("/groups");
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
      <div className="space-y-5 pb-24">
        {canDelete || group.myMembership?.status === "ACCEPTED" ? (
          <HeaderActions>
            <Button
              {...headerButtonProps}
              variant="danger"
              aria-label={canDelete ? t`Delete group` : t`Leave group`}
              isDisabled={canDelete ? a.busy : ownBusy}
              onPress={() => {
                setError(false);
                setConfirm(canDelete ? "delete" : "cancel");
              }}
            >
              {canDelete ? (
                <Trash2 className="size-5" aria-hidden="true" />
              ) : (
                <LogOut className="size-5" aria-hidden="true" />
              )}
            </Button>
          </HeaderActions>
        ) : null}
        <Link href="/groups" className="inline-flex items-center gap-2 text-link">
          <ArrowLeft className="size-4" />
          {t`Back`}
        </Link>
        {error ? (
          <p role="alert" className="text-danger">
            {failure}
          </p>
        ) : null}
        <GroupIdentityCard group={group} />
        <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setTab(String(key))}>
          <TabBar label={t`Group sections`}>
            <TabTrigger icon={Info} id="info">
              {t`Details`}
              <NotificationTabBadge
                target={{ kind: "group", id: group.id }}
                count={changes.tabCounts.details}
                overviewItems={[
                  notificationItemId(group.id, "invitation"),
                  notificationItemId(group.id, "overview", undefined, "group"),
                ]}
              />
            </TabTrigger>
            {group.canViewMembers ? (
              <TabTrigger icon={UsersRound} id="members">
                {t`Members`}
                <NotificationTabBadge
                  target={{ kind: "item", id: notificationItemId(group.id, "members") }}
                  count={changes.tabCounts.members}
                />
                {isGroupManagerRole(group.role) && (group.pendingRequestCount ?? 0) > 0 ? (
                  <span
                    role="img"
                    aria-label={t`Requests to review`}
                    className="text-warning-soft-foreground"
                  >
                    <UserRoundPlus className="size-4" aria-hidden />
                  </span>
                ) : null}
              </TabTrigger>
            ) : null}
            {group.canViewEvents ? (
              <TabTrigger icon={CalendarDays} id="events">
                {t`Events`}
                <NotificationTabBadge target={{ kind: "event-list", id: group.id }} />
              </TabTrigger>
            ) : null}
            {group.canViewRankings ? (
              <TabTrigger icon={ChartNoAxesCombined} id="rankings">{t`Ranking`}</TabTrigger>
            ) : null}
          </TabBar>
          {selectedTab === "info" || selectedTab === "members" ? (
            <NotificationChangesAlert
              key={JSON.stringify([o.apiUrl, o.userId, group.id, selectedTab])}
              model={changes}
            />
          ) : null}
          <Tabs.Panel id="info" className="pt-0">
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
          </Tabs.Panel>
          {group.canViewMembers ? (
            <Tabs.Panel id="members" className="pt-0">
              <GroupMembers group={group} />
            </Tabs.Panel>
          ) : null}
          {group.canViewEvents ? (
            <Tabs.Panel id="events" className="pt-0">
              <Events
                groupId={group.id}
                canCreate={isGroupManagerRole(group.role) && group.canInvite}
              />
            </Tabs.Panel>
          ) : null}
          {group.canViewRankings ? (
            <Tabs.Panel id="rankings" className="px-4 pt-0 sm:px-5">
              <GroupLeaderboard groupId={group.id} />
            </Tabs.Panel>
          ) : null}
        </Tabs>
        {group.canEdit && tab === "info" ? (
          <FloatingActions
            href={`/groups/${group.id}/edit`}
            label={t`Edit group`}
            isDisabled={a.busy}
          >
            <Pencil className="size-6" aria-hidden />
          </FloatingActions>
        ) : null}
        {confirm && (confirm !== "delete" || canDelete) ? (
          <ContactConfirmDialog
            title={
              confirm === "delete"
                ? t`Delete group`
                : group.myMembership?.status === "ACCEPTED"
                  ? t`Leave group`
                  : t`Cancel membership`
            }
            description={
              confirm === "delete"
                ? t`Permanently delete this group and all its events, tables, registrations, votes, results and group rankings? Personal GLOBAL ratings remain unchanged. This cannot be undone.`
                : t`Active table registrations are removed. Historical results remain unchanged.`
            }
            busy={confirm === "delete" ? a.busy : ownBusy}
            onCancel={() => {
              setConfirm(null);
              setError(false);
            }}
            actions={[
              {
                label: confirm === "delete" ? t`Delete group and events` : t`Confirm`,
                variant: "danger",
                onPress: () => void run(confirm),
                ...(confirm === "delete"
                  ? { icon: <Trash2 className="size-4" aria-hidden="true" /> }
                  : {}),
              },
            ]}
          >
            {error ? (
              <p role="alert" className="text-danger">
                {failure}
              </p>
            ) : null}
          </ContactConfirmDialog>
        ) : null}
      </div>
    </NotificationAttentionScope>
  );
}
