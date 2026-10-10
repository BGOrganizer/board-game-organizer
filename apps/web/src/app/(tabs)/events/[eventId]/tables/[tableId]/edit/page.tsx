import { EventTableEdit } from "@/components/events/EventTableEdit";

export default async function EventTableEditPage({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const { eventId, tableId } = await params;
  return <EventTableEdit eventId={eventId} tableId={tableId} />;
}
