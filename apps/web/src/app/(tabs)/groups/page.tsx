import { CommunitySection } from "@/components/community/CommunitySection";
import { Groups } from "@/components/groups/Groups";

export default function GroupsPage() {
  return (
    <CommunitySection selected="groups">
      <Groups />
    </CommunitySection>
  );
}
