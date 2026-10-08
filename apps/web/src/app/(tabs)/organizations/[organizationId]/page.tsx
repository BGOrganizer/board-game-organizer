import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return <OrganizationDetail organizationId={(await params).organizationId} />;
}
