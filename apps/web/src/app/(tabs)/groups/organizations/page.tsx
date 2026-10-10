import { CommunitySection } from "@/components/community/CommunitySection";
import { Organizations } from "@/components/organizations/Organizations";
export default function OrganizationsPage() {
  return (
    <CommunitySection selected="organizations">
      <Organizations />
    </CommunitySection>
  );
}
