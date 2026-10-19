import { useLocalSearchParams } from "expo-router";
import { EventResults } from "@/components/events/EventResults";
export default function Screen() {
  const p = useLocalSearchParams<{ eventId: string }>();
  return <EventResults eventId={p.eventId ?? ""} />;
}
