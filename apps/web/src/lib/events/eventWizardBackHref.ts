export function eventWizardBackHref(eventId?: string, organizationId?: string): string {
  if (eventId) return `/events/${encodeURIComponent(eventId)}`;
  if (organizationId) return `/organizations/${encodeURIComponent(organizationId)}?tab=events`;
  return "/events";
}
