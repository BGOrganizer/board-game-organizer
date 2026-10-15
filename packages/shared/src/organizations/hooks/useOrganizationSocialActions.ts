"use client";

import type {
  CommunityPageResponse,
  OrganizationMemberResponse,
} from "@board-game-organizer/schemas";
import { type InfiniteData, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import { type ContactAction, optimisticContactUser } from "../../contacts/hooks/contactOptimistic";
import { type ContactUser, useContacts } from "../../contacts/hooks/useContacts";
import { organizationKeys, patchOrganizationMemberData } from "./useOrganizations";

export function organizationMemberContact(person: OrganizationMemberResponse): ContactUser {
  return {
    id: person.userId,
    name: person.name ?? person.username ?? person.userId,
    username: person.username,
    avatarUrl: person.avatarUrl,
    email: null,
    presence: { online: false, lastActiveAt: "" },
    ...person.social,
  };
}

export function useOrganizationSocialActions(options: CommunityApiOptions) {
  const client = useQueryClient();
  const active = useRef(false);
  const [starting, setStarting] = useState(false);
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
  const key = [...organizationKeys.root(options), "members"];
  return {
    busy: starting || busy,
    async run(person: OrganizationMemberResponse, action: ContactAction) {
      if (active.current || client.isMutating(socialMutations)) return;
      active.current = true;
      setStarting(true);
      const snapshots: Array<
        [
          readonly unknown[],
          InfiniteData<CommunityPageResponse<OrganizationMemberResponse>> | undefined,
        ]
      > = [];
      try {
        await client.cancelQueries({ queryKey: key });
        snapshots.push(
          ...client.getQueriesData<InfiniteData<CommunityPageResponse<OrganizationMemberResponse>>>(
            { queryKey: key },
          ),
        );
        for (const [queryKey, data] of snapshots)
          client.setQueryData(
            queryKey,
            patchOrganizationMemberData(data, (row) => {
              if (row.userId !== person.userId || !row.social) return row;
              const updated = optimisticContactUser(organizationMemberContact(row), action);
              return {
                ...row,
                social: {
                  ...row.social,
                  isFollowing: Boolean(updated.isFollowing),
                  isFollower: Boolean(updated.isFollower),
                  isFriend: Boolean(updated.isFriend),
                  blockedByMe: Boolean(updated.blockedByMe),
                  friendRequest:
                    action === "friend_request"
                      ? "outgoing"
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
            }),
          );
        await mutations[action].mutateAsync({
          targetUserId: person.userId,
          targetUser: organizationMemberContact(person),
        });
      } catch (error) {
        for (const [queryKey, data] of snapshots) {
          const before = data?.pages
            .flatMap((page) => page.items)
            .find((row) => row.userId === person.userId);
          client.setQueryData(queryKey, (current: unknown) =>
            patchOrganizationMemberData(current, (row) =>
              before && row.userId === before.userId ? { ...row, social: before.social } : row,
            ),
          );
        }
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
