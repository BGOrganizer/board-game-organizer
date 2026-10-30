"use client";
import {
  communityAccessDenied,
  ownGroupActions,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LogOut, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { Events } from "@/components/events/Events";
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
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useGroupRecord(o, groupId),
    a = useGroupRecordActions(o, groupId),
    [tab, setTab] = useState<string>(initialTab),
    [confirm, setConfirm] = useState<"decline" | "cancel" | "delete" | null>(null),
    [error, setError] = useState(false);
  const group = communityAccessDenied(q.error) ? undefined : q.data;
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
  const run = async (action: "request" | "accept" | "decline" | "cancel" | "delete") => {
    setError(false);
    try {
      if (action === "delete") {
        await a.remove.mutateAsync({
          id: group.id,
          input: { version: group.version, deleteEvents: true },
        });
        setConfirm(null);
        router.replace("/groups");
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
    <div className="space-y-5 pb-24">
      {group.canEdit || (group.role === "accepted" && group.myMembership?.status === "ACCEPTED") ? (
        <HeaderActions>
          <Button
            isIconOnly
            variant="danger"
            className="min-h-11 min-w-11"
            aria-label={group.canEdit ? t`Delete group` : t`Leave group`}
            isDisabled={a.busy}
            onPress={() => {
              setError(false);
              setConfirm(group.canEdit ? "delete" : "cancel");
            }}
          >
            {group.canEdit ? (
              <Trash2 className="size-5" aria-hidden="true" />
            ) : (
              <LogOut className="size-5" aria-hidden="true" />
            )}
          </Button>
        </HeaderActions>
      ) : null}
      <Link href="/groups" className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" />
        {t`Back`}
      </Link>
      {error ? (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      ) : null}
      <Tabs
        selectedKey={
          (tab === "events" && !group.canViewEvents) || (tab === "members" && !group.canViewMembers)
            ? "info"
            : tab
        }
        onSelectionChange={(key) => setTab(String(key))}
      >
        <Tabs.ListContainer className="mt-4 w-fit max-w-full self-center">
          <Tabs.List aria-label={t`Group sections`}>
            <Tabs.Tab id="info">{t`Overview`}</Tabs.Tab>
            {group.canViewMembers ? <Tabs.Tab id="members">{t`Members`}</Tabs.Tab> : null}
            {group.canViewEvents ? <Tabs.Tab id="events">{t`Events`}</Tabs.Tab> : null}
            {group.canViewRankings ? <Tabs.Tab id="rankings">{t`Rankings`}</Tabs.Tab> : null}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="info">
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
        </Tabs.Panel>
        {group.canViewMembers ? (
          <Tabs.Panel id="members">
            <GroupMembers group={group} />
          </Tabs.Panel>
        ) : null}
        {group.canViewEvents ? (
          <Tabs.Panel id="events">
            <Events groupId={group.id} canCreate={group.role === "admin" && group.canInvite} />
          </Tabs.Panel>
        ) : null}
        {group.canViewRankings ? (
          <Tabs.Panel id="rankings" className="px-4 sm:px-5">
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
      {confirm && (confirm !== "delete" || group.canEdit) ? (
        <ContactConfirmDialog
          title={
            confirm === "delete"
              ? t`Delete group`
              : group.role === "accepted"
                ? t`Leave group`
                : t`Cancel membership`
          }
          description={
            confirm === "delete"
              ? t`Permanently delete this group and all its events, tables, registrations, votes, results and group rankings? Personal GLOBAL ratings remain unchanged. This cannot be undone.`
              : t`Active table registrations are removed. Historical results remain unchanged.`
          }
          busy={a.busy}
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
  );
}
