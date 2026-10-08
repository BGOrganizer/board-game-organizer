import { useLocalSearchParams } from "expo-router";
import { OrganizationFriendPicker } from "@/components/OrganizationWizard";
export default function InviteScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  return <OrganizationFriendPicker organizationId={organizationId} />;
}
