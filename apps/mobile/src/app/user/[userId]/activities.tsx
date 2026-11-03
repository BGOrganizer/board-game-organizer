import { useLocalSearchParams } from "expo-router";
import { ProfileAccess } from "@/components/profile/ProfileAccess";
import { ProfileActivities } from "@/components/profile/ProfileActivities";
export default function UserActivitiesScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return (
    <ProfileAccess>
      <ProfileActivities key={userId} userId={userId} />
    </ProfileAccess>
  );
}
