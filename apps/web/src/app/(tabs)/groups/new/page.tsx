import { GroupWizard } from "@/components/groups/GroupWizard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { draftId } = await searchParams;
  return <GroupWizard draftId={draftId} />;
}
