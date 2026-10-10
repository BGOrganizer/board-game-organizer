import { EventTable } from "@/components/events/EventTable";
export default async function TablePage({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const { eventId, tableId } = await params;
  return <EventTable eventId={eventId} tableId={tableId} />;
}
