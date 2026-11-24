# Notifications

The global bell opens the inbox on Web and Mobile. The tables below list the notification types
produced by the current features, the Lucide icon shown in the inbox, and where a tap goes. Push
delivery follows the account's device/browser settings; the inbox remains available without push.

## Social and Groups

| Kind | Title in English / Italian | Trigger and recipient | Icon | Global bell destination |
| --- | --- | --- | --- | --- |
| `follow` | New follower / Nuovo follower | A user starts following someone. The followed user receives the notice. | `UserRoundPlus` | Contacts → Connections. |
| `friend_request` | New friend request / Nuova richiesta di amicizia | A user sends a request. The recipient receives the notice. | `UserRoundPlus` | Contacts → Requests on Mobile; Contacts on Web. |
| `friend_request_accepted` | Friend request accepted / Richiesta di amicizia accettata | The requester receives the acceptance. A Table invite claim that creates a friendship also notifies its sender. | `UserRoundCheck` | Contacts → Connections. |
| `group_invitation` | New group invitation / Nuovo invito a un gruppo | A manager invites a user. The invitee receives the notice. | `UsersRound` | Group detail and its invitation action. |
| `group_membership_requested` | Group membership requested / Richiesta di iscrizione al gruppo | Someone requests to join. Group managers receive the notice. | `UserRoundPlus` | Group detail. |
| `group_membership_updated` | Group membership updated / Iscrizione al gruppo aggiornata | A membership decision or role change informs the affected member, managers, or both according to who performed the action. | `UserRoundCheck` | Group detail. An accepted membership with a member change point opens Members. |
| `group_review_requested` | Group review requested / Gruppo da verificare | A public Group is submitted for moderation. Platform reviewers receive the notice. | `UsersRound` | Group moderation detail. |
| `group_reviewed` | Group review completed / Verifica del gruppo completata | A platform reviewer approves or rejects a revision. Group managers receive the notice. | `UserRoundCheck` | Group detail. |
| `group_banned` | Group exclusion / Esclusione dal gruppo | A manager excludes someone. The affected user receives the notice. | `CalendarX` | Group detail, subject to access. |
| `group_ban_revoked` | Group exclusion revoked / Esclusione dal gruppo revocata | A manager revokes an exclusion. The affected user receives the notice. | `UserRoundCheck` | Group detail, subject to access. |

The three Social messages name the actor and say they started following you, sent a friend request,
or accepted your request. The Group invitation says who invited you and names the Group. Group and
Event notices in the second catalog use the localized title and the message format `{actor}: {resource}`.
The [social and group invitation copy](../apps/api/src/app/lib/notifications/notification-copy.ts) and
the [group/event copy](../apps/api/src/app/lib/notifications/community-notifications.ts) contain the exact EN/IT strings.

## Events and Tables

| Kind | Title in English / Italian | Trigger and recipient | Icon | Global bell destination |
| --- | --- | --- | --- | --- |
| `event_agreement_ready` | Event agreement reached / Accordo raggiunto per l'evento | The planning state becomes confirmable. Event managers receive the notice. | `CalendarCheck` | Event detail. |
| `event_agreement_blocked` | Event planning needs attention / Pianificazione dell'evento da verificare | A distinct planning state blocks agreement. Event managers receive the notice. | `CalendarClock` | Event detail. |
| `event_updated` | Event updated / Evento aggiornato | A manager changes the event or removes a table. The affected registered users receive the notice. | `CalendarClock` | Event detail or the Table that owns the first unread change point. |
| `event_proposal_created` | New participant proposal / Nuova proposta di un partecipante | A participant proposes a date, place or game. Event managers receive the notice. | `CalendarPlus` | Event detail for dates and places; Table detail for games. |
| `event_proposal_accepted` | Participant proposal accepted / Proposta del partecipante accettata | A manager accepts a proposal. Authors of the reviewed proposals receive the notice. | `CalendarCheck` | Event detail for dates and places; Table detail for games. |
| `event_proposal_rejected` | Participant proposal rejected / Proposta del partecipante rifiutata | A manager rejects a proposal. Authors of the reviewed proposals receive the notice. | `CalendarX` | Event detail for dates and places; Table detail for games. |
| `table_invitation` | Table invitation / Invito a un tavolo | A manager invites a player. The invitee receives the notice. | `CalendarPlus` | Table → Participants, at the associated invitation. |
| `event_booking_confirmed` | Table booking confirmed / Prenotazione del tavolo confermata | The manager receives a voluntary join notice. The affected player receives it when a manager confirms their registration. | `CalendarCheck` | Table → Participants on Web; Table detail on Mobile when the notice carries no item target. |
| `event_booking_removed` | Table booking cancelled / Prenotazione del tavolo annullata | Managers are notified when someone leaves. Players affected by a manager removal or a loss of access receive notice. | `CalendarX` | Table destination as above for table-scoped notices; Event detail for event-scoped notices. |
| `event_replanning` | Event back in planning / Evento tornato in pianificazione | A manager reopens planning. Remaining accepted participants receive the notice. | `CalendarClock` | Event detail. |
| `event_confirmed` | Event confirmed / Evento confermato | A manager confirms the event. Participants included in the agreement receive the notice. | `CalendarCheck` | Event detail. |
| `event_terminated` | Event results registered / Risultati dell'evento registrati | A manager finalizes the event. Registered players in the frozen rosters receive the notice. | `Trophy` | Event detail. |

## Dots, Alerts and reading

- The bell shows the inbox record. Dots also surface unread sources on the applicable main tab,
  detail tab, and affected card or list row. For social notices, follows and accepted friendships
  belong to Connections; incoming requests belong to Requests.
- The detail-card bell opens Alerts for that group, event or table. An alert mirrors its inbox copy.
  When multiple notices represent the same current alert, the detail uses the latest relevant one.
  The inbox keeps the individual records. Older superseded duplicates are marked read according to their source.
- A notice may point to several changes. The bell opens its first unread authorized change, with a
  tab or item target where supported. A single point can clear its dot while other points stay unread.
  Pending invitation decisions remain actionable until the recipient responds.

See the [attention contract](groups-events-tables.md#notification-attention), the [target resolver](../packages/shared/src/notifications/notificationDestination.ts), and the icon maps for [Web](../apps/web/src/components/notifications/NotificationKindIcon.tsx) and [Mobile](../apps/mobile/src/components/notifications/NotificationKindIcon.tsx).
