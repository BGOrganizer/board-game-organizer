import { EventDetail } from "@/components/events/EventDetail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ fromGroup?: string | string[] }>;
}) {
  const [{ eventId }, search] = await Promise.all([params, searchParams]);
  return (
    <EventDetail
      eventId={eventId}
      fromGroup={typeof search?.fromGroup === "string" ? search.fromGroup : undefined}
    />
  );
}
