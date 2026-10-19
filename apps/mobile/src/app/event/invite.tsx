import { useLocalSearchParams } from "expo-router";
import { EventInvitationPicker } from "@/components/events/EventInvitationPicker";
export default function Screen() {
  const p = useLocalSearchParams<{ eventId: string; tableId: string }>();
  return <EventInvitationPicker eventId={p.eventId ?? ""} tableId={p.tableId ?? ""} />;
}
