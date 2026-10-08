import type { NotificationKind } from "@board-game-organizer/schemas";
import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  type LucideIcon,
  Trophy,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";

const icons: Record<NotificationKind, LucideIcon> = {
  organization_invitation: UsersRound,
  organization_join_requested: UserRoundPlus,
  organization_membership_changed: UserRoundCheck,
  organization_review_requested: UsersRound,
  organization_reviewed: UsersRound,
  event_published: CalendarPlus,
  event_updated: CalendarClock,
  event_cancelled: CalendarX,
  event_booking_requested: UserRoundPlus,
  event_booking_confirmed: CalendarCheck,
  event_booking_removed: CalendarX,
  event_table_created: CalendarCheck,
  event_table_cancelled: CalendarX,
  event_demonstrator: UsersRound,
  friend_request: UserRoundPlus,
  friend_request_accepted: UserRoundCheck,
  group_invitation: UsersRound,
  group_invitation_accepted: UsersRound,
  match_invitation: CalendarPlus,
  match_invitation_accepted: CalendarCheck,
  match_invitation_declined: CalendarX,
  match_updated: CalendarClock,
  match_created: CalendarCheck,
  match_replanning: CalendarClock,
  match_terminated: Trophy,
};

export function NotificationKindIcon({
  kind,
  size = 20,
}: {
  kind: NotificationKind;
  size?: number;
}) {
  const Icon = icons[kind];
  return <Icon size={size} color="#737373" accessible={false} />;
}
