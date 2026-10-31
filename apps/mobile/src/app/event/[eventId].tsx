import { useLocalSearchParams } from "expo-router";
import { EventDetail } from "@/components/events/EventDetail";
export default function Screen() {
  const p = useLocalSearchParams<{ eventId: string; fromGroup?: string }>();
  return <EventDetail eventId={p.eventId ?? ""} fromGroup={p.fromGroup} />;
}
