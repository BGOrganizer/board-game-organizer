import { CommunityDiscovery } from "@/components/community/CommunityDiscovery";
import { CommunitySection } from "@/components/community/CommunitySection";
export default function SearchPage() {
  return (
    <CommunitySection selected="search">
      <CommunityDiscovery />
    </CommunitySection>
  );
}
