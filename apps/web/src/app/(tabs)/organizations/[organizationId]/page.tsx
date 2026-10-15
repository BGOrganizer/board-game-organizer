import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";
export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <OrganizationDetail
      organizationId={(await params).organizationId}
      initialTab={(await searchParams).tab}
    />
  );
}
