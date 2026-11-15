"use client";
import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { ContactAction } from "../../contacts/hooks/contactOptimistic";
import { type ContactUser, useContacts } from "../../contacts/hooks/useContacts";
import type { CommunityApiOptions } from "../communityApi";

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
export function usePeopleSocialActions<Person extends SocialPerson>(options: CommunityApiOptions) {
  const busy = useOptimisticBusy(["contacts", options.apiUrl, options.userId]);
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
    busy: busy(),
    isBusy: (userId: string) => busy(["contacts", options.apiUrl, options.userId, userId]),
    async run(person: Person, action: ContactAction) {
      if (!person.social || person.userId === options.userId || contacts.isBusy(person.userId))
        return;
      // One Contacts operation owns both social lists and every authorized Group row.
      mutations[action].mutate({
        targetUserId: person.userId,
        targetUser: communityPersonContact(person),
      });
    },
  };
}
