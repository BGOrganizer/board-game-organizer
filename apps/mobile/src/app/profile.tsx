import { Profile } from "@/components/profile/Profile";
import { ProfileAccess } from "@/components/profile/ProfileAccess";
export default function ProfileScreen() {
  return (
    <ProfileAccess>
      <Profile />
    </ProfileAccess>
  );
}
