"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  useEventParticipantManagement,
  useEventParticipants,
  type useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Table } from "@heroui/react";
import { TableLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { Ban, UserRoundMinus } from "lucide-react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupBanDialog } from "@/components/common/ui/GroupBanDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { useCommunityApi } from "@/lib/useCommunityApi";

const layoutOptions = { estimatedRowHeight: 76, headingHeight: 1, gap: 8 };
export function EventParticipants({
  event,
  actions,
  disabled = false,
}: {
  event: PlannedEventResponse;
  actions: ReturnType<typeof useEventRecordActions>;
  disabled?: boolean;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventParticipants(o, event.id);
  const m = useEventParticipantManagement(o, event, q.items, actions, disabled);
  const stale = t`Event details changed. Close and reopen this action.`;
  return (
    <section aria-label={t`Participants`} className="space-y-3">
      {q.items.length ? (
        <Virtualizer layout={TableLayout} layoutOptions={layoutOptions} shouldObserveItemSize>
          <Table>
            <Table.ScrollContainer
              onWheelCapture={q.beginScroll}
              onTouchStartCapture={q.beginScroll}
              onKeyDownCapture={(e) => {
                if (["ArrowDown", "PageDown", "End"].includes(e.key)) q.beginScroll();
              }}
            >
              <Table.Content
                aria-label={t`Participants`}
                selectionMode="none"
                className="h-[60vh] min-h-64 w-full overflow-auto"
                onScroll={(e) => {
                  const n = e.currentTarget;
                  if (n.scrollTop + n.clientHeight >= n.scrollHeight - 200) q.endReached();
                }}
              >
                <Table.Header className="sr-only">
                  <Table.Column id="participant" isRowHeader>{t`Participants`}</Table.Column>
                </Table.Header>
                <Table.Body items={q.items}>
                  {(person) => {
                    const name = person.username || person.name || t`Username unavailable`;
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
                      ...(m.canAct(person, "ban")
                        ? [
                            {
                              action: "ban" as const,
                              label: t`Ban from group`,
                              icon: <Ban className="size-5" aria-hidden />,
                            },
                          ]
                        : []),
                    ];
                    return (
                      <Table.Row id={person.userId} textValue={name}>
                        <Table.Cell className="p-0">
                          <GroupedList>
                            <GroupedRow>
                              <UserIdentity
                                name={name}
                                avatarUrl={person.avatarUrl}
                                secondary={person.position === "WAITING" ? t`Waiting list` : null}
                              />
                              <MemberActions
                                title={`${t`Manage participant`}: ${name}`}
                                busy={m.isBusy(person)}
                                items={items}
                                onAction={(action) => m.open(person, action)}
                              />
                            </GroupedRow>
                          </GroupedList>
                        </Table.Cell>
                      </Table.Row>
                    );
                  }}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Virtualizer>
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
          description={t`All active registrations for this person in this event will be removed. Group membership stays unchanged and they can join again.`}
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
      {m.managed?.action === "ban" && m.stale ? (
        <ContactConfirmDialog
          title={t`Ban from group`}
          description={stale}
          onCancel={m.close}
          actions={[]}
        />
      ) : m.managed?.action === "ban" ? (
        <GroupBanDialog
          name={m.managed.person.username || m.managed.person.name || t`Username unavailable`}
          timeZone={event.timeZone}
          busy={false}
          onCancel={m.close}
          onConfirm={m.confirm}
        />
      ) : null}
    </section>
  );
}
