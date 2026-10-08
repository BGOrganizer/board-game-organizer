import { CommunitySection } from "@/components/CommunitySection";
import { Organizations } from "@/components/Organizations";
export default function OrganizationsPage() {
  return (
    <CommunitySection selected="organizations">
      <Organizations />
    </CommunitySection>
  );
}
