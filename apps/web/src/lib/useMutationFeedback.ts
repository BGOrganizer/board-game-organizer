"use client";

import {
  communityFeedbackMessages,
  type MutationFeedback,
  type MutationFeedbackAction,
} from "@board-game-organizer/shared";
import { toast } from "@heroui/react/toast";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, CircleX } from "lucide-react";
import { createElement, useMemo } from "react";

export function useMutationFeedback(): MutationFeedback {
  const { t, i18n } = useLingui();

  return useMemo(() => {
    const messages: Record<MutationFeedbackAction, { success: string; error: string }> = {
      ...communityFeedbackMessages((id, message) => i18n._({ id, message })),
      follow: { success: t`User followed`, error: t`Could not follow user` },
      unfollow: { success: t`User unfollowed`, error: t`Could not unfollow user` },
      unfriend: { success: t`Friend removed`, error: t`Could not remove friend` },
      friend_request: { success: t`Friend request sent`, error: t`Could not send friend request` },
      cancel_friend_request: {
        success: t`Friend request cancelled`,
        error: t`Could not cancel friend request`,
      },
      accept_friend_request: {
        success: t`Friend request accepted`,
        error: t`Could not accept friend request`,
      },
      reject_friend_request: {
        success: t`Friend request rejected`,
        error: t`Could not reject friend request`,
      },
      block: { success: t`User blocked`, error: t`Could not block user` },
      unblock: { success: t`User unblocked`, error: t`Could not unblock user` },
      sync_contacts: {
        success: t`Contacts synchronized`,
        error: t`Could not synchronize contacts`,
      },
      disconnect_bgg: {
        success: t`BoardGameGeek disconnected`,
        error: t`Could not disconnect BoardGameGeek`,
      },
      create_invite: { success: t`Invite link created`, error: t`Could not create invite link` },
      add_favorite_location: {
        success: t`Location added to favorites`,
        error: t`Could not add location to favorites`,
      },
      remove_favorite_location: {
        success: t`Location removed from favorites`,
        error: t`Could not remove location from favorites`,
      },
      create_match: { success: t`Match created`, error: t`Could not create match` },
      update_match: { success: t`Match updated`, error: t`Could not update match` },
      set_match_choice: { success: t`Choice saved`, error: t`Could not save choice` },
      create_match_status: { success: t`Match confirmed`, error: t`Could not confirm match` },
      replan_match: { success: t`Match back in planning`, error: t`Could not reopen match` },
      register_match_results: { success: t`Match registered`, error: t`Could not register match` },
      delete_match: { success: t`Match deleted`, error: t`Could not delete match` },
      leave_match: { success: t`You left the match`, error: t`Could not leave match` },
      request_match_join: {
        success: t`Join request sent`,
        error: t`Could not request to join match`,
      },
      approve_match_join: {
        success: t`Join request approved`,
        error: t`Could not approve join request`,
      },
      remove_match_player: {
        success: t`Player removed from match`,
        error: t`Could not remove player from match`,
      },
      accept_match_invitation: {
        success: t`Match invitation accepted`,
        error: t`Could not accept match invitation`,
      },
      decline_match_invitation: {
        success: t`Match invitation declined`,
        error: t`Could not decline match invitation`,
      },
      create_group: { success: t`Group created`, error: t`Could not create group` },
      update_group: { success: t`Group updated`, error: t`Could not update group` },
      delete_group: { success: t`Group deleted`, error: t`Could not delete group` },
      leave_group: { success: t`Left group`, error: t`Could not leave group` },
      remove_group_invitation: {
        success: t`Person removed from group`,
        error: t`Could not remove person from group`,
      },
      accept_group_invitation: {
        success: t`Group invitation accepted`,
        error: t`Could not accept group invitation`,
      },
      decline_group_invitation: {
        success: t`Group invitation declined`,
        error: t`Could not decline group invitation`,
      },
      delete_notification: {
        success: t`Notification deleted`,
        error: t`Could not delete notification`,
      },
    };

    return {
      onOptimisticUpdate: (action) =>
        toast(messages[action].success, {
          indicator: createElement(CircleCheck, { className: "h-5 w-5 text-success" }),
        }),
      onError: (_error, action) =>
        toast.danger(messages[action].error, {
          indicator: createElement(CircleX, { className: "h-5 w-5" }),
        }),
    };
  }, [t, i18n]);
}
