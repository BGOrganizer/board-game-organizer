import { EventWizard } from "@/components/events/EventWizard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { groupId } = await searchParams;
  return <EventWizard groupId={groupId} />;
}
