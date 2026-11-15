import { useLocalSearchParams } from "expo-router";
import { EventTable } from "@/components/events/EventTable";
export default function Screen() {
  const p = useLocalSearchParams<{ eventId: string; tableId: string; fromEvent?: string }>();
  return (
    <EventTable
      eventId={p.eventId ?? ""}
      tableId={p.tableId ?? ""}
      context={p.fromEvent === p.eventId ? "event" : "personal"}
    />
  );
}
