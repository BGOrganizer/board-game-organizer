import { GroupReview } from "@/components/groups/GroupReview";
export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupReview groupId={groupId} />;
}
