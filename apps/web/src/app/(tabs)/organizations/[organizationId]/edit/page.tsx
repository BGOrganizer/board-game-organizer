import { OrganizationWizard } from "@/components/OrganizationWizard";
export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationWizard organizationId={organizationId} />;
}
