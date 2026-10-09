"use client";
import type {
  OrganizationMemberResponse,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import {
  type ContactAction,
  communityAccessDenied,
  organizationMemberActions,
  organizationMemberContact,
  useOrganizationActions,
  useOrganizationPeople,
  useOrganizationSocialActions,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Ban,
  Check,
  CircleX,
  Clock3,
  Crown,
  RotateCcw,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserMenu } from "@/components/contacts/UserMenu";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

function SocialControls({
  person,
  busy,
  onAction,
}: {
  person: OrganizationMemberResponse;
  busy: boolean;
  onAction: (action: ContactAction) => void;
}) {
  const { t } = useLingui();
  const [friendConfirm, setFriendConfirm] = useState(false);
  const user = organizationMemberContact(person);
  const pending = person.social?.friendRequest;
  const disabled = busy || !person.social;
  const friendLabel = user.isFriend
    ? t`Friends`
    : pending === "incoming"
      ? t`Respond to friend request`
      : pending === "outgoing"
        ? t`Cancel friend request`
        : t`Send friend request`;
  const followLabel = user.isFollowing ? t`Unfollow` : t`Follow`;
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant={user.isFollowing ? "secondary" : "ghost"}
        isDisabled={disabled || user.blockedByMe || (user.blockedMe && !user.isFollowing)}
        aria-label={`${followLabel}: ${user.name}`}
        onPress={() => onAction(user.isFollowing ? "unfollow" : "follow")}
      >
        <UserRoundPlus className="size-4" />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant={user.isFriend ? "primary" : "ghost"}
        isDisabled={disabled || user.isFriend || user.blockedByMe || user.blockedMe}
        aria-label={`${friendLabel}: ${user.name}`}
        onPress={() => setFriendConfirm(true)}
      >
        {user.isFriend ? (
          <UserRoundCheck className="size-4" />
        ) : pending ? (
          <Clock3 className="size-4" />
        ) : (
          <UsersRound className="size-4" />
        )}
      </Button>
      <UserMenu
        user={user}
        busy={disabled}
        blockLabel={t`Block user globally`}
        friendRequest={pending}
        canSendFriendRequest={!user.isFriend && !pending && !user.blockedByMe && !user.blockedMe}
        onAction={(action) => {
          if (action !== "profile") onAction(action);
        }}
      />
      {friendConfirm ? (
        <ContactConfirmDialog
          title={friendLabel}
          description={
            pending === "incoming"
              ? t`Accept or decline this friend request.`
              : pending === "outgoing"
                ? t`The sent friend request will be removed.`
                : t`They can accept or decline your request.`
          }
          busy={busy}
          onCancel={() => setFriendConfirm(false)}
          actions={
            pending === "incoming"
              ? [
                  {
                    label: t`Decline`,
                    variant: "danger",
                    onPress: () => {
                      onAction("reject_friend_request");
                      setFriendConfirm(false);
                    },
                  },
                  {
                    label: t`Accept`,
                    variant: "primary",
                    onPress: () => {
                      onAction("accept_friend_request");
                      setFriendConfirm(false);
                    },
                  },
                ]
              : [
                  {
                    label: pending ? t`Cancel request` : t`Send request`,
                    variant: pending ? "danger" : "primary",
                    onPress: () => {
                      onAction(pending ? "cancel_friend_request" : "friend_request");
                      setFriendConfirm(false);
                    },
                  },
                ]
          }
        />
      ) : null}
    </>
  );
}

export function OrganizationMembers({ organization }: { organization: OrganizationResponse }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const router = useRouter();
  const actions = useOrganizationActions(options);
  const social = useOrganizationSocialActions(options);
  const busy = actions.busy || social.busy;
  const list = useOrganizationPeople(options, organization);
  const [removing, setRemoving] = useState<OrganizationMemberResponse | null>(null);
  const sentinel = useInfiniteScroll({
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: () => list.fetchNextPage() ?? Promise.resolve(),
  });
  const run = (
    person: OrganizationMemberResponse,
    action: "remove" | "ban" | "revoke" | "approve" | "reject",
  ) => {
    if (busy) return;
    actions.membership.mutate(
      { id: organization.id, userId: person.userId, action },
      { onSuccess: () => setRemoving(null) },
    );
  };
  const people = communityAccessDenied(list.error) ? [] : list.items;
  return (
    <section className="space-y-4" aria-label={t`Members`}>
      <GroupedList>
        {organization.role === "admin" ? (
          <GroupedRow>
            <UserRoundPlus className="size-5 shrink-0 text-default-500" />
            <Button
              variant="ghost"
              className="min-h-11 min-w-0 flex-1 justify-start text-sm text-default-500"
              aria-label={t`Invite friends`}
              isDisabled={!organization.approved || busy || communityAccessDenied(list.error)}
              onPress={() => router.push(`/organizations/${organization.id}/invite`)}
            >
              <span className="min-w-0 text-left">
                <span className="block">{t`Select a friend`}</span>
                {!organization.approved ? (
                  <span className="block text-xs">{t`Invitations require an approved organization.`}</span>
                ) : null}
              </span>
            </Button>
          </GroupedRow>
        ) : null}
        {people.map((person) => {
          const name = person.name ?? person.username ?? t`Username unavailable`;
          const membershipActions = organizationMemberActions(organization, person);
          const badge = person.isAdmin
            ? { Icon: Crown, label: t`Organization admin`, color: "text-warning" }
            : person.membership?.status === "PENDING"
              ? {
                  Icon: Clock3,
                  label:
                    person.membership.kind === "REQUEST" ? t`Membership requested` : t`Invited`,
                  color: "text-warning",
                }
              : person.membership?.status === "EXCLUDED"
                ? { Icon: Ban, label: t`Excluded member`, color: "text-danger" }
                : null;
          return (
            <GroupedRow key={person.userId}>
              <span className="relative shrink-0">
                <Avatar size="md">
                  <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                  <Avatar.Fallback>{name.charAt(0)}</Avatar.Fallback>
                </Avatar>
                {badge ? (
                  <span
                    className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5"
                    role="img"
                    aria-label={badge.label}
                  >
                    <badge.Icon className={`size-4 ${badge.color}`} />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name}</span>
                {person.username && person.username !== name ? (
                  <span className="block truncate text-xs text-default-500">{person.username}</span>
                ) : null}
              </span>
              <span className="flex max-w-36 shrink-0 flex-wrap items-center justify-end gap-1 sm:max-w-none">
                {membershipActions.includes("approve") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="primary"
                    isDisabled={busy}
                    aria-label={`${t`Approve request`}: ${name}`}
                    onPress={() => run(person, "approve")}
                  >
                    <Check className="size-4" />
                  </Button>
                ) : null}
                {membershipActions.includes("reject") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    isDisabled={busy}
                    aria-label={`${t`Reject request`}: ${name}`}
                    onPress={() => run(person, "reject")}
                  >
                    <CircleX className="size-4" />
                  </Button>
                ) : null}
                {membershipActions.includes("remove") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    isDisabled={busy}
                    aria-label={`${t`Remove member`}: ${name}`}
                    onPress={() => setRemoving(person)}
                  >
                    <UserRoundMinus className="size-4" />
                  </Button>
                ) : null}
                {membershipActions.includes("revoke") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="primary"
                    isDisabled={busy}
                    aria-label={`${t`Revoke exclusion`}: ${name}`}
                    onPress={() => run(person, "revoke")}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                ) : null}
                {person.userId !== options.userId ? (
                  <SocialControls
                    person={person}
                    busy={busy}
                    onAction={(action) => void social.run(person, action).catch(() => {})}
                  />
                ) : null}
              </span>
            </GroupedRow>
          );
        })}
      </GroupedList>
      {list.isPending && !people.length ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {!list.isPending && !list.isError && !people.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No members found`}</EmptyList>
      ) : null}
      {list.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load organization members`}</p>
          <Button variant="outline" onPress={list.refetch}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage || (list.isPending && people.length > 0) ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load organization members. Retry` : t`Load more`}
        </Button>
      ) : null}
      {removing && organization.role === "admin" && !communityAccessDenied(list.error) ? (
        <ContactConfirmDialog
          title={t`Remove member`}
          description={t`Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain. Remove allows new requests and invitations; Remove and exclude blocks rejoining this organization until revoked. Global social blocking is separate.`}
          busy={busy}
          onCancel={() => {
            if (!busy) setRemoving(null);
          }}
          actions={[
            {
              label: t`Remove from organization`,
              variant: "danger",
              onPress: () => run(removing, "remove"),
            },
            {
              label: t`Remove and exclude`,
              variant: "danger",
              onPress: () => run(removing, "ban"),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
