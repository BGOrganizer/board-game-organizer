import { useLocalSearchParams } from "expo-router";
import { Profile } from "@/components/profile/Profile";
import { ProfileAccess } from "@/components/profile/ProfileAccess";
export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return (
    <ProfileAccess>
      <Profile key={userId} userId={userId} />
    </ProfileAccess>
  );
}
