import { useLocalSearchParams } from "expo-router";
import { OrganizationReview } from "@/components/organizations/OrganizationReview";
export default function OrganizationReviewScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string | string[] }>();
  return (
    <OrganizationReview
      organizationId={Array.isArray(organizationId) ? organizationId[0] : organizationId}
    />
  );
}
