import { EventWizard } from "@/components/EventWizard";
export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventWizard eventId={eventId} />;
}
