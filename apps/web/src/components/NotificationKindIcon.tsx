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
} from "lucide-react";

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
  className = "size-5 shrink-0",
}: {
  kind: NotificationKind;
  className?: string;
}) {
  const Icon = icons[kind];
  return <Icon className={className} aria-hidden="true" />;
}
