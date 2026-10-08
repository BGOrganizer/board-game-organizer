import { CommunitySection } from "@/components/CommunitySection";
import { Groups } from "@/components/Groups";

export default function GroupsPage() {
  return (
    <CommunitySection selected="groups">
      <Groups />
    </CommunitySection>
  );
}
