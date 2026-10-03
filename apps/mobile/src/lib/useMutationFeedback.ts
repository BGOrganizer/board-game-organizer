import type { MutationFeedback, MutationFeedbackAction } from "@board-game-organizer/shared";
import { Toast, useToast } from "heroui-native/toast";
import { CircleAlert, CircleCheck } from "lucide-react-native";
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
      disconnect_bgg: {
        success: t("BoardGameGeek disconnected"),
        error: t("Could not disconnect BoardGameGeek"),
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
      register_match_results: {
        success: t("Match registered"),
        error: t("Could not register match"),
      },
      delete_match: { success: t("Match deleted"), error: t("Could not delete match") },
      leave_match: { success: t("You left the match"), error: t("Could not leave match") },
      remove_match_player: {
        success: t("Player removed from match"),
        error: t("Could not remove player from match"),
      },
      accept_match_invitation: {
        success: t("Match invitation accepted"),
        error: t("Could not accept match invitation"),
      },
      decline_match_invitation: {
        success: t("Match invitation declined"),
        error: t("Could not decline match invitation"),
      },
      create_group: { success: t("Group created"), error: t("Could not create group") },
      update_group: { success: t("Group updated"), error: t("Could not update group") },
      delete_group: { success: t("Group deleted"), error: t("Could not delete group") },
      leave_group: { success: t("Left group"), error: t("Could not leave group") },
      remove_group_invitation: {
        success: t("Person removed from group"),
        error: t("Could not remove person from group"),
      },
      accept_group_invitation: {
        success: t("Group invitation accepted"),
        error: t("Could not accept group invitation"),
      },
      decline_group_invitation: {
        success: t("Group invitation declined"),
        error: t("Could not decline group invitation"),
      },
      delete_notification: {
        success: t("Notification deleted"),
        error: t("Could not delete notification"),
      },
    };

    const show = (message: string, variant: "success" | "danger") =>
      toast.show({
        component: (props) =>
          createElement(
            Toast,
            { ...props, variant, className: "flex-row items-center gap-3" },
            createElement(variant === "success" ? CircleCheck : CircleAlert, {
              size: 18,
              color: variant === "success" ? "#17c964" : "#f31260",
            }),
            createElement(Toast.Title, { className: "flex-1" }, message),
            createElement(Toast.Close, {
              accessibilityLabel: t("Dismiss notification"),
              testID: "dismiss-notification",
            }),
          ),
      });
    return {
      onOptimisticUpdate: (action) => show(messages[action].success, "success"),
      onError: (_error, action) => show(messages[action].error, "danger"),
    };
  }, [t, toast]);
}
