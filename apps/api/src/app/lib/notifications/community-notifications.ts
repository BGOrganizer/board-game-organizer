import type { CommunityNotificationKind, NotificationKind } from "@board-game-organizer/schemas";

const titles: Record<CommunityNotificationKind, readonly [string, string]> = {
  group_membership_requested: ["Group membership requested", "Richiesta di iscrizione al gruppo"],
  group_membership_updated: ["Group membership updated", "Iscrizione al gruppo aggiornata"],
  group_review_requested: ["Group review requested", "Gruppo da verificare"],
  group_reviewed: ["Group review completed", "Verifica del gruppo completata"],
  group_banned: ["Group exclusion", "Esclusione dal gruppo"],
  group_ban_revoked: ["Group exclusion revoked", "Esclusione dal gruppo revocata"],
  table_invitation: ["Table invitation", "Invito a un tavolo"],
  event_agreement_ready: ["Event agreement reached", "Accordo raggiunto per l'evento"],
  event_agreement_blocked: [
    "Event planning needs attention",
    "Pianificazione dell'evento da verificare",
  ],
  event_confirmed: ["Event confirmed", "Evento confermato"],
  event_replanning: ["Event back in planning", "Evento tornato in pianificazione"],
  event_terminated: ["Event results registered", "Risultati dell'evento registrati"],
  organization_invitation: ["Organization invitation", "Invito all'organizzazione"],
  organization_join_requested: [
    "Organization membership requested",
    "Richiesta di adesione all'organizzazione",
  ],
  organization_membership_changed: [
    "Organization membership updated",
    "Adesione all'organizzazione aggiornata",
  ],
  organization_review_requested: ["Organization review requested", "Organizzazione da verificare"],
  organization_reviewed: [
    "Organization review completed",
    "Verifica dell'organizzazione completata",
  ],
  event_published: ["Event published", "Evento pubblicato"],
  event_updated: ["Event updated", "Evento aggiornato"],
  event_cancelled: ["Event cancelled", "Evento annullato"],
  event_booking_requested: ["Table booking requested", "Richiesta di prenotazione del tavolo"],
  event_booking_confirmed: ["Table booking confirmed", "Prenotazione del tavolo confermata"],
  event_booking_removed: ["Table booking cancelled", "Prenotazione del tavolo annullata"],
  event_table_cancelled: [
    "Table cancelled: minimum players not reached",
    "Tavolo annullato: partecipanti insufficienti",
  ],
  event_table_created: ["Table confirmed", "Tavolo confermato"],
  event_demonstrator: [
    "Demonstrator assignment updated",
    "Assegnazione del dimostratore aggiornata",
  ],
};
export function communityNotificationCopy(
  kind: NotificationKind,
  locale: "en" | "it",
  actor: string,
  resource?: string,
) {
  if (!(kind in titles)) return undefined;
  return {
    title: titles[kind as CommunityNotificationKind][locale === "it" ? 1 : 0],
    description: `${actor}: ${resource ?? ""}`,
    href: kind.startsWith("organization_") || kind.startsWith("group_") ? "/groups" : "/events",
  };
}
