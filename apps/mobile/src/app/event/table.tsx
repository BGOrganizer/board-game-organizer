import { useLocalSearchParams } from "expo-router";
import { EventTableDetail } from "@/components/events/EventTableDetail";
export default function TableScreen() {
  const { eventId, tableId } = useLocalSearchParams<{ eventId: string; tableId: string }>();
  return <EventTableDetail eventId={eventId} tableId={tableId} />;
}
