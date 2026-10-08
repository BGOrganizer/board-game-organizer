import { OrganizationFriendPicker } from "@/components/organizations/OrganizationFriendPicker";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationFriendPicker organizationId={organizationId} />;
}
