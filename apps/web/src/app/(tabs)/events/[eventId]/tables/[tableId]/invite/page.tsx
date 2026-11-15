import { EventInvitationPicker } from "@/components/events/EventInvitationPicker";
export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string; tableId: string }>;
}) {
  const p = await params;
  return <EventInvitationPicker {...p} />;
}
