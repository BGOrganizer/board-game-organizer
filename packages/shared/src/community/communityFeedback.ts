export const COMMUNITY_FEEDBACK_MESSAGES = {
  upload_organization_logo: { success: "Logo upload started", error: "Could not upload logo" },
  create_event: { success: "Event saved", error: "Could not create event" },
  update_event: { success: "Event updated", error: "Could not update event" },
  cancel_event: { success: "Event cancelled", error: "Could not cancel event" },
  request_event_booking: { success: "Booking request sent", error: "Could not request a place" },
  invite_event_player: { success: "Table invitation sent", error: "Could not invite player" },
  accept_event_invitation: {
    success: "Table invitation accepted",
    error: "Could not accept table invitation",
  },
  decline_event_invitation: {
    success: "Table invitation declined",
    error: "Could not decline table invitation",
  },
  approve_event_booking: {
    success: "Booking request approved",
    error: "Could not approve booking",
  },
  reject_event_booking: { success: "Booking request rejected", error: "Could not reject booking" },
  cancel_event_booking: { success: "Booking cancelled", error: "Could not cancel booking" },
  remove_event_player: { success: "Player removed from table", error: "Could not remove player" },
  create_organization: {
    success: "Organization submitted for review",
    error: "Could not create organization",
  },
  update_organization: {
    success: "Organization changes submitted for review",
    error: "Could not update organization",
  },
  approve_organization: {
    success: "Organization approved",
    error: "Could not approve organization",
  },
  reject_organization: { success: "Organization rejected", error: "Could not reject organization" },
  request_organization_join: {
    success: "Organization join request sent",
    error: "Could not request organization membership",
  },
  invite_organization_member: {
    success: "Organization invitation sent",
    error: "Could not invite organization member",
  },
  accept_organization_invitation: {
    success: "Organization invitation accepted",
    error: "Could not accept organization invitation",
  },
  decline_organization_invitation: {
    success: "Organization invitation declined",
    error: "Could not decline organization invitation",
  },
  approve_organization_join: {
    success: "Organization join request approved",
    error: "Could not approve organization join request",
  },
  reject_organization_join: {
    success: "Organization join request rejected",
    error: "Could not reject organization join request",
  },
  leave_organization: {
    success: "Organization membership cancelled",
    error: "Could not cancel organization membership",
  },
  remove_organization_member: {
    success: "Organization member removed",
    error: "Could not remove organization member",
  },
  ban_organization_member: {
    success: "Organization member excluded",
    error: "Could not exclude organization member",
  },
  revoke_organization_exclusion: {
    success: "Organization exclusion revoked",
    error: "Could not revoke organization exclusion",
  },
} as const;
export type CommunityFeedbackAction = keyof typeof COMMUNITY_FEEDBACK_MESSAGES;
export function communityFeedbackMessages(
  translate: (id: string, message: string) => string,
): Record<CommunityFeedbackAction, { success: string; error: string }> {
  return Object.fromEntries(
    Object.entries(COMMUNITY_FEEDBACK_MESSAGES).map(([key, value]) => [
      key,
      {
        success: translate(`organization.feedback.${key}.success`, value.success),
        error: translate(`organization.feedback.${key}.error`, value.error),
      },
    ]),
  ) as Record<CommunityFeedbackAction, { success: string; error: string }>;
}
