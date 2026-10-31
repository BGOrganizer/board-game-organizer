import type { Notification, NotificationKind } from "@board-game-organizer/schemas";
import { communityNotificationCopy } from "./community-notifications";

export function notificationCopy(
  kind: NotificationKind,
  locale: "en" | "it",
  actorName: string,
  matchName?: string,
): { title: string; description: string; href: string } {
  const community = communityNotificationCopy(kind, locale, actorName, matchName);
  if (community) return community;
  if (locale === "it") {
    switch (kind) {
      case "friend_request":
        return {
          title: "Nuova richiesta di amicizia",
          description: `${actorName} ti ha inviato una richiesta di amicizia.`,
          href: "/contacts",
        };
      case "friend_request_accepted":
        return {
          title: "Richiesta di amicizia accettata",
          description: `${actorName} ha accettato la tua richiesta di amicizia.`,
          href: "/contacts",
        };
      case "group_invitation":
        return {
          title: "Nuovo invito a un gruppo",
          description: `${actorName} ti ha invitato al gruppo “${matchName}”.`,
          href: "/groups",
        };
      case "group_invitation_accepted":
        return {
          title: "Invito al gruppo accettato",
          description: `${actorName} ha accettato l'invito al gruppo “${matchName}”.`,
          href: "/groups",
        };
      case "match_invitation":
        return {
          title: "Nuovo invito a una partita",
          description: `${actorName} ti ha invitato alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_invitation_accepted":
        return {
          title: "Invito alla partita accettato",
          description: `${actorName} ha accettato l'invito alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_invitation_declined":
        return {
          title: "Invito alla partita rifiutato",
          description: `${actorName} ha rifiutato l'invito alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_created":
        return {
          title: "Partita confermata",
          description: `La partita “${matchName}” è stata confermata.`,
          href: "/matches",
        };
      case "match_replanning":
        return {
          title: "Partita di nuovo in pianificazione",
          description: `La partita “${matchName}” è tornata in pianificazione.`,
          href: "/matches",
        };
      case "match_terminated":
        return {
          title: "Partita terminata",
          description: `La partita “${matchName}” è terminata.`,
          href: "/matches",
        };
      case "match_updated":
        return {
          title: "Partita aggiornata",
          description: `La partita “${matchName}” è stata aggiornata.`,
          href: "/matches",
        };
    }
  }

  switch (kind) {
    case "friend_request":
      return {
        title: "New friend request",
        description: `${actorName} sent you a friend request.`,
        href: "/contacts",
      };
    case "friend_request_accepted":
      return {
        title: "Friend request accepted",
        description: `${actorName} accepted your friend request.`,
        href: "/contacts",
      };
    case "group_invitation":
      return {
        title: "New group invitation",
        description: `${actorName} invited you to the group “${matchName}”.`,
        href: "/groups",
      };
    case "group_invitation_accepted":
      return {
        title: "Group invitation accepted",
        description: `${actorName} accepted the invitation to the group “${matchName}”.`,
        href: "/groups",
      };
    case "match_invitation":
      return {
        title: "New match invitation",
        description: `${actorName} invited you to “${matchName}”.`,
        href: "/matches",
      };
    case "match_invitation_accepted":
      return {
        title: "Match invitation accepted",
        description: `${actorName} accepted the invitation to “${matchName}”.`,
        href: "/matches",
      };
    case "match_invitation_declined":
      return {
        title: "Match invitation declined",
        description: `${actorName} declined the invitation to “${matchName}”.`,
        href: "/matches",
      };
    case "match_created":
      return {
        title: "Match confirmed",
        description: `“${matchName}” was confirmed.`,
        href: "/matches",
      };
    case "match_replanning":
      return {
        title: "Match back in planning",
        description: `“${matchName}” is back in planning.`,
        href: "/matches",
      };
    case "match_terminated":
      return {
        title: "Match finished",
        description: `“${matchName}” has finished.`,
        href: "/matches",
      };
    case "match_updated":
      return {
        title: "Match updated",
        description: `“${matchName}” was updated.`,
        href: "/matches",
      };
  }
  throw new Error("Unsupported notification kind");
}

/** Keep historical text intact when formatting inputs are unavailable. Never reinterpret links. */
export function localizedNotificationText(
  notification: Pick<Notification, "kind" | "title" | "description" | "copy">,
  locale?: "en" | "it",
) {
  if (!locale || !notification.copy)
    return { title: notification.title, description: notification.description };
  const { title, description } = notificationCopy(
    notification.kind,
    locale,
    notification.copy.actorName,
    notification.copy.resourceName,
  );
  return { title, description };
}
