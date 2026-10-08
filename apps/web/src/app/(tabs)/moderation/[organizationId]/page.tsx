import { OrganizationReview } from "@/components/OrganizationModeration";
export default async function OrganizationReviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return <OrganizationReview organizationId={(await params).organizationId} />;
}
