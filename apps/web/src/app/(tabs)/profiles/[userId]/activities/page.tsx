import { ProfileActivities } from "@/components/profile/ProfileActivities";
export default async function UserActivitiesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <ProfileActivities userId={userId} />;
}
