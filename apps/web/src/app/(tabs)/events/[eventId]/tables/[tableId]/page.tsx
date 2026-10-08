import { EventTableDetail } from "@/components/Events";
export default async function TablePage({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const { eventId, tableId } = await params;
  return <EventTableDetail eventId={eventId} tableId={tableId} />;
}
