import { useLocalSearchParams } from "expo-router";
import { OrganizationFriendPicker } from "@/components/organizations/OrganizationFriendPicker";
export default function InviteScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  return <OrganizationFriendPicker organizationId={organizationId} />;
}
