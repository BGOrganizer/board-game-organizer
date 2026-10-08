import { Events } from "@/components/Events";
export default async function OrganizationEventsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <Events organizationId={organizationId} />;
}
