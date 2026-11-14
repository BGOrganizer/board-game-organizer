import { Profile } from "@/components/profile/Profile";
export default async function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <Profile userId={userId} />;
}
