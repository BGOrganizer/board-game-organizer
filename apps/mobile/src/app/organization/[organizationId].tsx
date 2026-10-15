import { useLocalSearchParams } from "expo-router";
import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";
export default function OrganizationDetailScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string | string[] }>();
  return (
    <OrganizationDetail
      organizationId={Array.isArray(organizationId) ? organizationId[0] : organizationId}
    />
  );
}
