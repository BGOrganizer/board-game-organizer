import { EventResults } from "@/components/events/EventResults";
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventResults eventId={eventId} />;
}
