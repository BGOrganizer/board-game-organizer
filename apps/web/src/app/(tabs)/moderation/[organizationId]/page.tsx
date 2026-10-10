import { OrganizationReview } from "@/components/organizations/OrganizationReview";
export default async function OrganizationReviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return <OrganizationReview organizationId={(await params).organizationId} />;
}
