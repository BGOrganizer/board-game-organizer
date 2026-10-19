"use client";
import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type ContactAction, optimisticContactUser } from "../../contacts/hooks/contactOptimistic";
import { type ContactUser, useContacts } from "../../contacts/hooks/useContacts";
import type { CommunityApiOptions } from "../communityApi";
import { mapCommunityCache, restoreCommunityFields } from "../queryCache";

type SocialPerson = Pick<GroupPersonResponse, "userId" | "social"> &
  Partial<Pick<GroupPersonResponse, "name" | "username" | "avatarUrl">>;
export function communityPersonContact(person: SocialPerson): ContactUser {
  return {
    id: person.userId,
    name: person.name ?? person.username ?? person.userId,
    username: person.username,
    avatarUrl: person.avatarUrl ?? null,
    email: null,
    // Legacy action input requires presence; group rows never render this as a presence indicator.
    presence: { online: false, lastActiveAt: "" },
    isFollowing: Boolean(person.social?.isFollowing),
    isFollower: Boolean(person.social?.isFollower),
    isFriend: Boolean(person.social?.isFriend),
    blockedByMe: Boolean(person.social?.blockedByMe),
    blockedMe: false,
  };
}
export function usePeopleSocialActions<Person extends SocialPerson>(
  options: CommunityApiOptions,
  key: readonly unknown[],
) {
  const client = useQueryClient(),
    active = useRef(false),
    [starting, setStarting] = useState(false);
  const socialMutations = {
    predicate: (mutation: { options: { scope?: { id: string } } }) =>
      mutation.options.scope?.id === "contacts",
  };
  const busy = useIsMutating(socialMutations) > 0;
  const contacts = useContacts(
    options.apiUrl,
    null,
    options.getToken,
    options.protectionBypass,
    options.userId,
    options.feedback,
  );
  const mutations = {
    follow: contacts.follow,
    unfollow: contacts.unfollow,
    unfriend: contacts.unfriend,
    friend_request: contacts.friendRequest,
    cancel_friend_request: contacts.cancelFriendRequest,
    accept_friend_request: contacts.acceptFriendRequest,
    reject_friend_request: contacts.rejectFriendRequest,
    block: contacts.block,
    unblock: contacts.unblock,
  };
  return {
    busy: starting || busy,
    async run(person: Person, action: ContactAction) {
      if (
        active.current ||
        !person.social ||
        person.userId === options.userId ||
        client.isMutating(socialMutations)
      )
        return;
      active.current = true;
      setStarting(true);
      const rollback: Array<() => void> = [];
      try {
        await client.cancelQueries({ queryKey: key });
        for (const [queryKey, data] of client.getQueriesData({ queryKey: key }))
          client.setQueryData(
            queryKey,
            mapCommunityCache<Person>(data, (row) => {
              if (row.userId !== person.userId || !row.social) return row;
              const user = optimisticContactUser(communityPersonContact(row), action);
              const optimistic = {
                ...row,
                social: {
                  ...row.social,
                  isFollowing: Boolean(user.isFollowing),
                  isFollower: Boolean(user.isFollower),
                  isFriend: Boolean(user.isFriend),
                  blockedByMe: Boolean(user.blockedByMe),
                  friendRequest:
                    action === "friend_request"
                      ? ("outgoing" as const)
                      : [
                            "cancel_friend_request",
                            "reject_friend_request",
                            "accept_friend_request",
                            "block",
                          ].includes(action)
                        ? undefined
                        : row.social.friendRequest,
                },
              };
              rollback.push(() =>
                client.setQueryData(queryKey, (current: unknown) =>
                  mapCommunityCache<Person>(current, (value) =>
                    value.userId === person.userId
                      ? restoreCommunityFields(value, row, optimistic)
                      : value,
                  ),
                ),
              );
              return optimistic;
            }),
          );
        await mutations[action].mutateAsync({
          targetUserId: person.userId,
          targetUser: communityPersonContact(person),
        });
      } catch (error) {
        for (const restore of rollback) restore();
        // Contacts owns its action-specific failure toast and selective rollback.
        throw error;
      } finally {
        try {
          await client.invalidateQueries({ queryKey: key });
        } finally {
          active.current = false;
          setStarting(false);
        }
      }
    },
  };
}
