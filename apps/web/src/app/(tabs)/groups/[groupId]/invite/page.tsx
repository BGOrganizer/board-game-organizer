import { GroupPeoplePicker } from "@/components/groups/GroupPeoplePicker";
export default async function GroupInvitePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupPeoplePicker groupId={groupId} />;
}
