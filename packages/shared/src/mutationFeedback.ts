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
  | "delete_match"
  | "leave_match"
  | "accept_match_invitation"
  | "decline_match_invitation";

export interface MutationFeedback {
  onOptimisticUpdate?: (action: MutationFeedbackAction) => void;
  onError?: (error: Error, action: MutationFeedbackAction) => void;
}
