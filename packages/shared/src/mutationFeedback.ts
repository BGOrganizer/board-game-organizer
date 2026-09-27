export type MutationFeedbackAction =
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "cancel_friend_request"
  | "accept_friend_request"
  | "reject_friend_request"
  | "block"
  | "unblock"
  | "sync_contacts"
  | "create_invite"
  | "create_match"
  | "update_match"
  | "set_match_choice"
  | "create_match_status"
  | "replan_match"
  | "register_match_results"
  | "delete_match"
  | "leave_match"
  | "remove_match_player"
  | "accept_match_invitation"
  | "decline_match_invitation";

export interface MutationFeedback {
  onOptimisticUpdate?: (action: MutationFeedbackAction) => void;
  onError?: (error: Error, action: MutationFeedbackAction) => void;
}
