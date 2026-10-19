import { EventWizard } from "@/components/events/EventWizard";
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventWizard eventId={eventId} />;
}
