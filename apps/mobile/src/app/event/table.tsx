import { useLocalSearchParams } from "expo-router";
import { EventTable } from "@/components/events/EventTable";
export default function TableScreen() {
  const { eventId, tableId } = useLocalSearchParams<{ eventId: string; tableId: string }>();
  return <EventTable eventId={eventId} tableId={tableId} />;
}
