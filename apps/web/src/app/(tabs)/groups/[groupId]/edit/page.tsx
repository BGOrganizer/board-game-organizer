import { Groups } from "@/components/Groups";

export default async function EditGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <Groups mode="edit" groupId={groupId} />;
}
