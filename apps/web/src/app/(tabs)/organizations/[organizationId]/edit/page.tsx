import { OrganizationWizard } from "@/components/organizations/OrganizationWizard";
export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationWizard organizationId={organizationId} />;
}
