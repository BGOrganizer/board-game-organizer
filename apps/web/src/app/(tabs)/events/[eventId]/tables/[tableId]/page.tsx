import { EventTable } from "@/components/events/EventTable";
export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const p = await params;
  return <EventTable {...p} />;
}
