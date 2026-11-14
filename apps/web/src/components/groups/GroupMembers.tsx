"use client";
import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  notificationItemId,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatUsername,
  groupPersonActions,
  groupPersonContact,
  groupUserRoles,
  isGroupManagerRole,
  isGroupModerator,
  useGroupMemberManagement,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Ban,
  Check,
  ClipboardCheck,
  Clock3,
  Crown,
  RotateCcw,
  ShieldCheck,
  UserRoundMinus,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupBanDialog } from "@/components/common/ui/GroupBanDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { UserMenu } from "@/components/contacts/UserMenu";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupMemberActions } from "./GroupMemberActions";
export function GroupMembers({ group }: { group: GroupRecordResponse }) {
  const { t, i18n } = useLingui(),
    router = useRouter(),
    options = useCommunityApi();
  const workflow = useGroupMemberManagement(options, group),
    { list, busy } = workflow;
  const denied = communityAccessDenied(list.error),
    managed = denied ? null : workflow.managed;
  const end = useInfiniteScroll({
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: () => list.fetchNextPage() ?? Promise.resolve(),
  });
  const name = (person: GroupPersonResponse) =>
    formatUsername(person.username, person.name ?? t`Username unavailable`);
  const failure = workflow.error
    ? workflow.error.message === "BAN_FROZEN_PARTICIPATION"
      ? t`This user is involved in a frozen public event and cannot be excluded.`
      : t`Could not update group member. Try again or refresh the list.`
    : undefined;
  const roleChange = managed?.action === "promote" || managed?.action === "demote";
  const roleLabel = managed?.action === "promote" ? t`Make moderator` : t`Demote to member`;
  return (
    <NotificationAttentionScope
      options={options}
      targets={(denied ? [] : list.items)
        .filter((person) => person.membership?.status === "ACCEPTED")
        .map((person) => ({
          kind: "item" as const,
          id: notificationItemId(group.id, "member", person.userId),
        }))}
    >
      <section className="space-y-4" aria-label={t`Members`}>
        {isGroupManagerRole(group.role) ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                isDisabled={!group.canInvite || workflow.blocking || denied}
                onPress={() => router.push(`/groups/${group.id}/invite`)}
              >
                <UserRoundPlus className="size-4" aria-hidden />
                {t`Invite friends`}
              </Button>
              {!group.canInvite ? (
                <HelpPopover
                  label={t`Invitations unavailable`}
                >{t`Invitations require an approved group.`}</HelpPopover>
              ) : null}
            </div>
          </div>
        ) : null}
        <GroupedList>
          {(denied ? [] : list.items).map((person) => {
            const allowed = groupPersonActions(group, person);
            const roles = groupUserRoles(person);
            const primary = roles[0];
            const badge = person.optimisticInvited
              ? { Icon: Clock3, label: t`Sending invitation`, color: "text-warning" }
              : person.isAdmin
                ? { Icon: Crown, label: t`Group admin`, color: "text-warning" }
                : person.ban
                  ? { Icon: Ban, label: t`Excluded from group`, color: "text-danger" }
                  : person.membership?.status === "PENDING"
                    ? {
                        Icon: person.membership.kind === "REQUEST" ? UserRoundPlus : Clock3,
                        label:
                          person.membership.kind === "REQUEST"
                            ? t`Membership requested`
                            : t`Invited`,
                        color: "text-warning",
                      }
                    : isGroupModerator(person.membership)
                      ? { Icon: ShieldCheck, label: t`Group moderator`, color: "text-accent" }
                      : null;
            const membershipLabel = person.optimisticInvited
              ? t`Sending invitation`
              : person.ban
                ? t`Excluded from group`
                : primary
                  ? i18n._(recordUserRoleMessages[primary])
                  : null;
            return (
              <GroupedRow key={person.userId}>
                <UserAvatar
                  name={name(person)}
                  avatarUrl={person.avatarUrl}
                  size="md"
                  badge={
                    !person.optimisticInvited && !person.ban ? (
                      <UserRoleBadge roles={roles} />
                    ) : badge ? (
                      <IconBadge
                        icon={badge.Icon}
                        label={badge.label}
                        title={badge.label}
                        color={person.ban ? "danger" : "warning"}
                      >
                        <p>{badge.label}</p>
                      </IconBadge>
                    ) : undefined
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-medium">{name(person)}</span>
                    {person.membership?.status === "ACCEPTED" ? (
                      <NotificationItem
                        itemId={notificationItemId(group.id, "member", person.userId)}
                      />
                    ) : null}
                  </span>
                  {membershipLabel ? (
                    <span className="block truncate text-xs text-muted">{membershipLabel}</span>
                  ) : null}
                  {person.ban ? (
                    <span className="block text-xs text-danger">
                      {person.ban.until
                        ? t`Excluded until ${new Date(person.ban.until).toLocaleString(i18n.locale)}`
                        : t`Permanent exclusion`}
                    </span>
                  ) : null}
                </span>
                <span className="flex max-w-36 shrink-0 flex-wrap justify-end gap-1 sm:max-w-none">
                  {allowed.includes("approve") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      aria-label={`${t`Respond to membership request`}: ${name(person)}`}
                      isDisabled={workflow.isBusy(person.userId)}
                      onPress={() => workflow.open(person, "approve")}
                    >
                      <ClipboardCheck className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                  <GroupMemberActions
                    group={group}
                    person={person}
                    busy={workflow.isBusy(person.userId)}
                    onAction={(action) => workflow.open(person, action)}
                  />
                  {allowed.includes("revoke") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      aria-label={`${t`Revoke group exclusion`}: ${name(person)}`}
                      isDisabled={workflow.isBusy(person.userId)}
                      onPress={() => workflow.open(person, "revoke")}
                    >
                      <RotateCcw className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                  {group.canSocialInteract && person.social && person.userId !== options.userId ? (
                    <UserMenu
                      user={groupPersonContact(person)}
                      busy={workflow.isBusy(person.userId)}
                      blockLabel={t`Block user globally`}
                      friendRequest={person.social.friendRequest}
                      canSendFriendRequest={
                        !person.social.isFriend &&
                        !person.social.friendRequest &&
                        !person.social.blockedByMe
                      }
                      onAction={(action) => {
                        if (action !== "profile")
                          void workflow.runSocial(person, action).catch(() => {});
                      }}
                    />
                  ) : null}
                </span>
              </GroupedRow>
            );
          })}
        </GroupedList>
        {list.isPending ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
        {list.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-danger">{t`Could not load group members`}</p>
            <Button variant="outline" onPress={list.refetch}>{t`Try again`}</Button>
          </div>
        ) : null}
        {!list.isPending && !list.isError && !list.items.length ? (
          <p className="text-sm text-muted">{t`No members found`}</p>
        ) : null}
        <div ref={end} />
        {list.isFetchingNextPage ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : list.hasNextPage ? (
          <Button variant="outline" onPress={() => void list.fetchNextPage()}>
            {list.isFetchNextPageError ? t`Could not load more members. Retry` : t`Load more`}
          </Button>
        ) : null}
        {managed?.action === "ban" ? (
          <GroupBanDialog
            key={managed.person.userId}
            name={name(managed.person)}
            timeZone={group.location?.timeZone}
            busy={busy}
            failure={failure}
            onCancel={workflow.close}
            onConfirm={(until) => void workflow.confirm("ban", until)}
          />
        ) : managed ? (
          <ContactConfirmDialog
            title={`${roleChange ? roleLabel : managed.action === "approve" ? t`Respond to membership request` : managed.action === "revoke" ? t`Revoke group exclusion` : t`Remove member`}: ${name(managed.person)}`}
            description={
              roleChange
                ? managed.action === "promote"
                  ? t`Grant group and event management permissions? Only the creator can change moderator roles. Moderators cannot delete the group or remove or ban its creator or other moderators.`
                  : t`Remove moderator permissions? Group membership and event participation remain unchanged.`
                : managed.action === "revoke"
                  ? t`Revoking an exclusion does not restore membership or registrations. A new invitation or request is required.`
                  : t`This affects group membership only. Historical results remain unchanged.`
            }
            busy={busy}
            onCancel={workflow.close}
            actions={
              managed.action === "approve"
                ? [
                    {
                      label: t`Approve`,
                      variant: "primary",
                      icon: <Check className="size-4" aria-hidden />,
                      onPress: () => void workflow.confirm("approve"),
                    },
                    {
                      label: t`Reject`,
                      variant: "danger",
                      icon: <X className="size-4" aria-hidden />,
                      onPress: () => void workflow.confirm("reject"),
                    },
                  ]
                : [
                    {
                      label: roleChange
                        ? roleLabel
                        : managed.action === "revoke"
                          ? t`Revoke group exclusion`
                          : t`Remove member`,
                      variant:
                        managed.action === "revoke" || managed.action === "promote"
                          ? "primary"
                          : "danger",
                      icon:
                        managed.action === "revoke" ? (
                          <RotateCcw className="size-4" aria-hidden />
                        ) : roleChange ? (
                          <ShieldCheck className="size-4" aria-hidden />
                        ) : (
                          <UserRoundMinus className="size-4" aria-hidden />
                        ),
                      onPress: () => void workflow.confirm(),
                    },
                  ]
            }
          >
            {failure ? (
              <p role="alert" className="text-danger">
                {failure}
              </p>
            ) : null}
          </ContactConfirmDialog>
        ) : null}
      </section>
    </NotificationAttentionScope>
  );
}
