import { EventWizard } from "@/components/events/EventWizard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; draftId?: string }>;
}) {
  const { groupId, draftId } = await searchParams;
  return <EventWizard groupId={groupId} draftId={draftId} />;
}
