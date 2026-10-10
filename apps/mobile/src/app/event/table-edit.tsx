import { useLocalSearchParams } from "expo-router";
import { EventTableEdit } from "@/components/events/EventTableEdit";

export default function EventTableEditScreen() {
  const { eventId, tableId } = useLocalSearchParams<{ eventId: string; tableId: string }>();
  return <EventTableEdit eventId={eventId} tableId={tableId} />;
}
