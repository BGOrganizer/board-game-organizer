"use client";
import {
  communityAccessDenied,
  ownGroupActions,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { Events } from "@/components/events/Events";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
import { GroupLeaderboard } from "./GroupLeaderboard";
import { GroupMembers } from "./GroupMembers";
export function GroupDetail({ groupId }: { groupId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useGroupRecord(o, groupId),
    a = useGroupRecordActions(o),
    [tab, setTab] = useState("info"),
    [confirm, setConfirm] = useState<"decline" | "cancel" | null>(null),
    [error, setError] = useState(false);
  const group = communityAccessDenied(q.error) ? undefined : q.data;
  if (!group)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load group details`}</p>
        <Button variant="outline" onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
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
    <div className="space-y-5">
      <Link href="/groups" className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" />
        {t`Back`}
      </Link>
      {group.role === "invited" || group.role === "requested" ? (
        <p>{t`Membership pending. Events, rankings and group social actions are unavailable until acceptance.`}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {ownGroupActions(group).map((action) => (
          <Button
            key={action}
            isDisabled={a.busy}
            variant={action === "cancel" || action === "decline" ? "danger-soft" : "primary"}
            onPress={() =>
              action === "cancel" || action === "decline" ? setConfirm(action) : void run(action)
            }
          >
            {action === "request"
              ? t`Request membership`
              : action === "accept"
                ? t`Accept invitation`
                : action === "decline"
                  ? t`Decline invitation`
                  : group.role === "accepted"
                    ? t`Leave group`
                    : t`Cancel request`}
          </Button>
        ))}
        {group.canEdit ? (
          <Link
            href={`/groups/${group.id}/edit`}
            className="inline-flex items-center gap-2 text-accent"
          >
            <Pencil className="size-4" />
            {t`Edit group`}
          </Link>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-danger">{t`Could not update group membership`}</p>
      ) : null}
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t`Group sections`}>
            <Tabs.Tab id="info">{t`Overview`}</Tabs.Tab>
            {group.canViewMembers ? <Tabs.Tab id="members">{t`Members`}</Tabs.Tab> : null}
            {group.canViewEvents ? <Tabs.Tab id="events">{t`Events`}</Tabs.Tab> : null}
            {group.canViewRankings ? <Tabs.Tab id="rankings">{t`Rankings`}</Tabs.Tab> : null}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="info">
          <GroupDetailsCard group={group} />
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
          <Tabs.Panel id="rankings">
            <GroupLeaderboard groupId={group.id} />
          </Tabs.Panel>
        ) : null}
      </Tabs>
      {confirm ? (
        <ContactConfirmDialog
          title={group.role === "accepted" ? t`Leave group` : t`Cancel membership`}
          description={t`Active table registrations are removed. Historical results remain unchanged.`}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t`Confirm`, variant: "danger", onPress: () => void run(confirm) }]}
        >
          {error ? (
            <p role="alert" className="text-danger">{t`Could not update group membership`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </div>
  );
}
