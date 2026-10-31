import { EventWizard } from "@/components/events/EventWizard";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ fromGroup?: string | string[] }>;
}) {
  const [{ eventId }, search] = await Promise.all([params, searchParams]);
  return (
    <EventWizard
      eventId={eventId}
      fromGroup={typeof search?.fromGroup === "string" ? search.fromGroup : undefined}
    />
  );
}
