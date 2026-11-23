import { formatUsername, hasContactRelationship } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRelationshipBadge } from "@/components/common/ui/UserRelationshipBadge";
import { type UserActionKey, UserMenuActions } from "@/components/contacts/UserMenuActions";
import { PeopleMoreButton } from "./PeopleMoreButton";
import { callTool, openWeb, record } from "./protocol";
import { type PeopleResultProps, usePeoplePages } from "./usePeoplePages";

const person = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  presence: z.object({ online: z.boolean() }).optional(),
  blockedByMe: z.boolean().optional(),
  blockedMe: z.boolean().optional(),
  isFriend: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
  isFollower: z.boolean().optional(),
});
const relationship = z.object({ profile: person.nullable() });
const contactPage = z.union([
  z.array(relationship).transform((rows) => ({ rows, nextCursor: null })),
  z.object({ rows: z.array(relationship), nextCursor: z.string().nullable() }),
  z
    .object({ users: z.array(person), nextCursor: z.string().nullable() })
    .transform(({ users, nextCursor }) => ({
      rows: users.map((profile) => ({ profile })),
      nextCursor,
    })),
]);

const contactOperations = new Map<
  Exclude<UserActionKey, "profile" | "accept_friend_request" | "reject_friend_request">,
  string
>([
  ["block", "block_user"],
  ["unblock", "unblock_user"],
  ["follow", "follow_user"],
  ["unfollow", "unfollow_user"],
  ["unfriend", "remove_friend"],
  ["friend_request", "send_friend_request"],
  ["cancel_friend_request", "cancel_friend_request"],
]);

export function ContactResults(props: PeopleResultProps) {
  const { t } = useLingui();
  const { pages, invalid } = usePeoplePages(props, contactPage);
  const query = record(record(props.input)?.query);
  const relationshipType = query?.type;
  const direction = query?.direction;
  const friendRequest =
    relationshipType === "pending" || direction === "incoming"
      ? "incoming"
      : relationshipType === "sent" || direction === "outgoing"
        ? "outgoing"
        : undefined;
  const mutation = useMutation({
    mutationFn: async ({
      action,
      targetUserId,
    }: {
      action: UserActionKey;
      targetUserId: string;
    }) => {
      if (action === "profile") {
        if (!(await openWeb(props.app, `/profiles/${encodeURIComponent(targetUserId)}`)))
          throw new Error("The host could not open the profile");
        return;
      }
      const params = { targetUserId };
      if (action === "accept_friend_request" || action === "reject_friend_request") {
        await callTool(props.app, "respond_to_friend_request", {
          params,
          body: { decision: action === "accept_friend_request" ? "accept" : "reject" },
        });
      } else {
        const tool = contactOperations.get(action);
        if (tool) await callTool(props.app, tool, { params });
      }
      await pages.refetch({ cancelRefetch: false });
    },
    retry: false,
  });
  const users = new Map(
    pages.data?.pages.flatMap(({ rows }) =>
      rows.flatMap(({ profile }) => (profile ? [[profile.id, profile] as const] : [])),
    ),
  );
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        leading={<UsersRound className="size-5 text-accent" aria-hidden />}
        title={t`Contacts`}
      />
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load users`}</p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-danger">{t`Could not complete the action. Try again.`}</p>
      ) : null}
      {!invalid && !pages.isError && !users.size ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No users found`}</EmptyList>
      ) : null}
      <GroupedList>
        {Array.from(users.values(), (user) => (
          <UserListRow
            key={user.id}
            name={user.name}
            avatarUrl={user.avatarUrl}
            online={user.presence?.online}
            secondary={formatUsername(user.username, "")}
            badge={hasContactRelationship(user) ? <UserRelationshipBadge user={user} /> : undefined}
            actions={
              <UserMenuActions
                user={user}
                busy={mutation.isPending || pages.isFetching}
                friendRequest={friendRequest}
                onProfile={() => mutation.mutate({ action: "profile", targetUserId: user.id })}
                onAction={(action) => mutation.mutate({ action, targetUserId: user.id })}
              />
            }
          />
        ))}
      </GroupedList>
      <PeopleMoreButton pages={pages} busy={mutation.isPending} />
    </section>
  );
}
