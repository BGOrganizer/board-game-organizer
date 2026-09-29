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
