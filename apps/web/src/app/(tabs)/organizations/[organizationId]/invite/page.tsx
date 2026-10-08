import { OrganizationFriendPicker } from "@/components/OrganizationWizard";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationFriendPicker organizationId={organizationId} />;
}
