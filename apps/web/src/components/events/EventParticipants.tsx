"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventUserRoles,
  formatUsername,
  useEventParticipantManagement,
  useEventParticipants,
  type useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundMinus } from "lucide-react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { WindowedList } from "@/components/common/ui/WindowedList";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventParticipants({
  event,
  actions,
  disabled = false,
}: {
  event: PlannedEventResponse;
  actions: ReturnType<typeof useEventRecordActions>;
  disabled?: boolean;
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    q = useEventParticipants(
      o,
      event.id,
      event.canManage ? { mode: "review", groupId: event.groupId } : { mode: "member" },
    );
  const m = useEventParticipantManagement(o, event, q.items, actions, disabled);
  const stale = t`Event details changed. Close and reopen this action.`;
  return (
    <section aria-label={t`Participants`} className="space-y-3">
      {q.items.length ? (
        <WindowedList
          key={event.id}
          items={q.items}
          itemKey={(person) => person.userId}
          label={t`Participants`}
          estimatedRowHeight={76}
          onBeginScroll={q.beginScroll}
          onEndReached={q.endReached}
          renderItem={(person) => {
            const name = formatUsername(person.username, person.name || t`Username unavailable`);
            const roles = eventUserRoles(person);
            const primary = roles[0];
            const items = [
              ...(m.canAct(person, "remove")
                ? [
                    {
                      action: "remove" as const,
                      label: t`Remove from event`,
                      icon: <UserRoundMinus className="size-5" aria-hidden />,
                    },
                  ]
                : []),
            ];
            return (
              <GroupedList>
                <GroupedRow>
                  <UserIdentity
                    name={name}
                    avatarUrl={person.avatarUrl}
                    secondary={primary ? i18n._(recordUserRoleMessages[primary]) : undefined}
                    badge={<UserRoleBadge roles={roles} />}
                  />
                  <MemberActions
                    title={`${t`Manage participant`}: ${name}`}
                    busy={m.isBusy(person)}
                    items={items}
                    onAction={(action) => m.open(person, action)}
                  />
                </GroupedRow>
              </GroupedList>
            );
          }}
        />
      ) : null}
      {q.isPending || q.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
      {!q.isPending && !q.isError && !q.items.length && !q.hasMore ? (
        <p role="status" className="text-muted">{t`No participants yet`}</p>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load participants`}</p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {q.hasMore ? (
        <Button
          variant="secondary"
          isDisabled={!q.cachedMore && (q.isFetching || q.isError)}
          onPress={q.loadMore}
        >{t`Load more`}</Button>
      ) : null}
      {m.managed?.action === "remove" ? (
        <ContactConfirmDialog
          title={t`Remove from event`}
          description={t`All active registrations for this person in this event will be removed. Group membership stays unchanged.`}
          onCancel={m.close}
          actions={
            m.stale
              ? []
              : [
                  {
                    label: t`Remove from event`,
                    variant: "danger",
                    icon: <UserRoundMinus className="size-4" aria-hidden />,
                    onPress: () => m.confirm(),
                  },
                ]
          }
        >
          {m.stale ? (
            <p role="alert" className="text-danger">
              {stale}
            </p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </section>
  );
}
