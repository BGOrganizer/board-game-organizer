import type { MutationFeedback, MutationFeedbackAction } from "@board-game-organizer/shared";
import { useToast } from "heroui-native/toast";
import { CircleCheck, CircleX } from "lucide-react-native";
import { createElement, useMemo } from "react";
import { useT } from "@/lib/i18n";

export function useMutationFeedback(): MutationFeedback {
  const t = useT();
  const { toast } = useToast();

  return useMemo(() => {
    const messages: Record<MutationFeedbackAction, { success: string; error: string }> = {
      follow: { success: t("User followed"), error: t("Could not follow user") },
      unfollow: { success: t("User unfollowed"), error: t("Could not unfollow user") },
      unfriend: { success: t("Friend removed"), error: t("Could not remove friend") },
      friend_request: {
        success: t("Friend request sent"),
        error: t("Could not send friend request"),
      },
      cancel_friend_request: {
        success: t("Friend request cancelled"),
        error: t("Could not cancel friend request"),
      },
      accept_friend_request: {
        success: t("Friend request accepted"),
        error: t("Could not accept friend request"),
      },
      reject_friend_request: {
        success: t("Friend request rejected"),
        error: t("Could not reject friend request"),
      },
      block: { success: t("User blocked"), error: t("Could not block user") },
      unblock: { success: t("User unblocked"), error: t("Could not unblock user") },
      sync_contacts: {
        success: t("Contacts synchronized"),
        error: t("Could not synchronize contacts"),
      },
      create_invite: {
        success: t("Invite link created"),
        error: t("Could not create invite link"),
      },
      create_match: { success: t("Match created"), error: t("Could not create match") },
      update_match: { success: t("Match updated"), error: t("Could not update match") },
      set_match_choice: { success: t("Choice saved"), error: t("Could not save choice") },
      create_match_status: { success: t("Match confirmed"), error: t("Could not confirm match") },
      replan_match: { success: t("Match back in planning"), error: t("Could not reopen match") },
      delete_match: { success: t("Match deleted"), error: t("Could not delete match") },
      leave_match: { success: t("You left the match"), error: t("Could not leave match") },
      accept_match_invitation: {
        success: t("Match invitation accepted"),
        error: t("Could not accept match invitation"),
      },
      decline_match_invitation: {
        success: t("Match invitation declined"),
        error: t("Could not decline match invitation"),
      },
    };

    return {
      onOptimisticUpdate: (action) =>
        toast.show({
          label: messages[action].success,
          icon: createElement(CircleCheck, { size: 18, color: "#17c964" }),
        }),
      onError: (_error, action) =>
        toast.show({
          label: messages[action].error,
          variant: "danger",
          icon: createElement(CircleX, { size: 18, color: "#f31260" }),
        }),
    };
  }, [t, toast]);
}
