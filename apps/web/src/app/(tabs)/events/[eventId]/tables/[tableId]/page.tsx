import { EventTable } from "@/components/events/EventTable";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
  searchParams?: Promise<{ fromEvent?: string | string[] }>;
}) {
  const [p, search] = await Promise.all([params, searchParams]);
  return <EventTable {...p} context={search?.fromEvent === p.eventId ? "event" : "personal"} />;
}
