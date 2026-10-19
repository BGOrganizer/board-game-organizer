import { EventDetail } from "@/components/events/EventDetail";
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventDetail eventId={eventId} />;
}
