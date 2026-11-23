import { ContactResults } from "./ContactResults";
import { ChangeResults, InboxResults } from "./InboxResults";
import {
  ActivityResults,
  ProfileGameHistory,
  ProfileGameResults,
  ProfileResults,
} from "./ProfileResults";
import { RosterResults } from "./RosterResults";
import type { PeopleResultProps } from "./usePeoplePages";

const peopleResults = new Map<string, React.ComponentType<PeopleResultProps>>([
  ["search_users", ContactResults],
  ["list_user_suggestions", ContactResults],
  ["list_relationships", ContactResults],
  ["list_follows", ContactResults],
  ["list_blocked_users", ContactResults],
  ["list_friends", ContactResults],
  ["list_friend_requests", ContactResults],
  ["get_my_profile", ProfileResults],
  ["get_user_profile", ProfileResults],
  ["list_profile_activity", ActivityResults],
  ["list_community_activity", ActivityResults],
  ["list_profile_games", ProfileGameResults],
  ["get_profile_game_history", ProfileGameHistory],
  ["list_notifications", InboxResults],
  ["list_notification_changes", ChangeResults],
  ["list_group_members", RosterResults],
  ["list_event_participants", RosterResults],
  ["list_table_seats", RosterResults],
  ["list_group_invitees", RosterResults],
  ["list_table_invitees", RosterResults],
]);

export function supportsPeopleResult(operation: string) {
  return peopleResults.has(operation);
}

export function PeopleResults(props: PeopleResultProps) {
  const View = peopleResults.get(props.operation);
  return View ? <View {...props} /> : null;
}
