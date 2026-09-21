"use client";

import type { MutationFeedback, MutationFeedbackAction } from "@board-game-organizer/shared";
import { toast } from "@heroui/react/toast";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, CircleX } from "lucide-react";
import { createElement, useMemo } from "react";

export function useMutationFeedback(): MutationFeedback {
  const { t } = useLingui();

  return useMemo(() => {
    const messages: Record<MutationFeedbackAction, { success: string; error: string }> = {
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
      create_invite: { success: t`Invite link created`, error: t`Could not create invite link` },
      create_match: { success: t`Match created`, error: t`Could not create match` },
      update_match: { success: t`Match updated`, error: t`Could not update match` },
      delete_match: { success: t`Match deleted`, error: t`Could not delete match` },
      leave_match: { success: t`You left the match`, error: t`Could not leave match` },
      accept_match_invitation: {
        success: t`Match invitation accepted`,
        error: t`Could not accept match invitation`,
      },
      decline_match_invitation: {
        success: t`Match invitation declined`,
        error: t`Could not decline match invitation`,
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
  }, [t]);
}
