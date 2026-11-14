import { GroupDetail } from "@/components/groups/GroupDetail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { groupId } = await params,
    tab = (await searchParams)?.tab;
  const initialTab = tab === "events" || tab === "members" ? tab : "info";
  return <GroupDetail key={`${groupId}:${initialTab}`} groupId={groupId} initialTab={initialTab} />;
}
