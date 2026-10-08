import { EventTableDetail } from "@/components/events/EventTableDetail";
export default async function TablePage({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const { eventId, tableId } = await params;
  return <EventTableDetail eventId={eventId} tableId={tableId} />;
}
