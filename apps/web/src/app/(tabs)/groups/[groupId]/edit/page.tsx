import { GroupWizard } from "@/components/groups/GroupWizard";
export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupWizard groupId={groupId} />;
}
