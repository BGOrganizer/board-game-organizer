import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${encodeURIComponent(eventId)}`);
}
