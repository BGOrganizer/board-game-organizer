import { Groups } from "@/components/Groups";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <Groups mode="detail" groupId={groupId} />;
}
