"use client";
import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  groupPersonActions,
  groupPersonContact,
  useGroupMemberManagement,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Ban,
  ClipboardCheck,
  Clock3,
  Crown,
  RotateCcw,
  UserRoundMinus,
  UserRoundPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { UserMenu } from "@/components/contacts/UserMenu";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupBanDialog } from "./GroupBanDialog";
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
    person.name ?? person.username ?? t`Username unavailable`;
  const failure = workflow.error
    ? workflow.error.message === "BAN_FROZEN_PARTICIPATION"
      ? t`This user is involved in a frozen public event and cannot be excluded.`
      : t`Could not update group member. Try again or refresh the list.`
    : undefined;
  return (
    <section className="space-y-4" aria-label={t`Members`}>
      {group.role === "admin" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              isDisabled={!group.canInvite || busy || denied}
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
          const badge = person.isAdmin
            ? { Icon: Crown, label: t`Group admin`, color: "text-warning" }
            : person.ban
              ? { Icon: Ban, label: t`Excluded from group`, color: "text-danger" }
              : person.membership?.status === "PENDING"
                ? {
                    Icon: Clock3,
                    label:
                      person.membership.kind === "REQUEST" ? t`Membership requested` : t`Invited`,
                    color: "text-warning",
                  }
                : null;
          return (
            <GroupedRow key={person.userId}>
              <span className="relative shrink-0">
                <Avatar size="md">
                  <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                  <Avatar.Fallback>{name(person).charAt(0)}</Avatar.Fallback>
                </Avatar>
                {badge ? (
                  <span
                    role="img"
                    aria-label={badge.label}
                    className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5"
                  >
                    <badge.Icon className={`size-4 ${badge.color}`} aria-hidden />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name(person)}</span>
                {person.username && person.username !== name(person) ? (
                  <span className="block truncate text-xs text-default-500">{person.username}</span>
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
                    isDisabled={busy}
                    onPress={() => workflow.open(person, "approve")}
                  >
                    <ClipboardCheck className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {allowed.includes("remove") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    aria-label={`${t`Remove member`}: ${name(person)}`}
                    isDisabled={busy}
                    onPress={() => workflow.open(person, "remove")}
                  >
                    <UserRoundMinus className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {allowed.includes("ban") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    aria-label={`${t`Ban from group`}: ${name(person)}`}
                    isDisabled={busy}
                    onPress={() => workflow.open(person, "ban")}
                  >
                    <Ban className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {allowed.includes("revoke") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="primary"
                    aria-label={`${t`Revoke group exclusion`}: ${name(person)}`}
                    isDisabled={busy}
                    onPress={() => workflow.open(person, "revoke")}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {group.canSocialInteract && person.social && person.userId !== options.userId ? (
                  <UserMenu
                    user={groupPersonContact(person)}
                    busy={busy}
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
        <p className="text-sm text-default-500">{t`No members found`}</p>
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
          title={`${managed.action === "approve" ? t`Respond to membership request` : managed.action === "revoke" ? t`Revoke group exclusion` : t`Remove member`}: ${name(managed.person)}`}
          description={
            managed.action === "revoke"
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
                    onPress: () => void workflow.confirm("approve"),
                  },
                  {
                    label: t`Reject`,
                    variant: "danger",
                    onPress: () => void workflow.confirm("reject"),
                  },
                ]
              : [
                  {
                    label:
                      managed.action === "revoke" ? t`Revoke group exclusion` : t`Remove member`,
                    variant: managed.action === "revoke" ? "primary" : "danger",
                    icon:
                      managed.action === "revoke" ? (
                        <RotateCcw className="size-4" aria-hidden />
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
  );
}
