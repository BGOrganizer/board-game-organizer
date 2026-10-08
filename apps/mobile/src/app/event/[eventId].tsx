import { useLocalSearchParams } from "expo-router";
import { EventDetail } from "@/components/Events";
export default function EventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <EventDetail eventId={eventId} />;
}
