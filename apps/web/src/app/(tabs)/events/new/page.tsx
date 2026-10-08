import { EventWizard } from "@/components/events/EventWizard";
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { organizationId } = await searchParams;
  return <EventWizard organizationId={organizationId} />;
}
