import { OrganizationDetail } from "@/components/OrganizationDetail";
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return <OrganizationDetail organizationId={(await params).organizationId} />;
}
