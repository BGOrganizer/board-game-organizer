import { EventWizard } from "@/components/EventWizard";
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { organizationId } = await searchParams;
  return <EventWizard organizationId={organizationId} />;
}
