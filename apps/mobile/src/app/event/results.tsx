import { Redirect, useLocalSearchParams } from "expo-router";
import { EventResults } from "@/components/events/EventResults";
export default function Screen() {
  const p = useLocalSearchParams<{ eventId: string; tableId?: string }>();
  if (!p.tableId)
    return (
      <Redirect href={{ pathname: "/event/[eventId]", params: { eventId: p.eventId ?? "" } }} />
    );
  return <EventResults eventId={p.eventId ?? ""} tableId={p.tableId} />;
}
