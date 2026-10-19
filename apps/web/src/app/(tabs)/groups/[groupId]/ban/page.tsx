import { GroupPeoplePicker } from "@/components/groups/GroupPeoplePicker";
export default async function GroupBanPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupPeoplePicker groupId={groupId} mode="ban" />;
}
