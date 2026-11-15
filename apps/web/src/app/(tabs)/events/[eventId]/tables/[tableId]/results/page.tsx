import { EventResults } from "@/components/events/EventResults";
export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const { eventId, tableId } = await params;
  return <EventResults eventId={eventId} tableId={tableId} />;
}
