import type { OrganizationMemberResponse } from "@board-game-organizer/schemas";
import { OrganizationMemberPicker } from "@/components/organizations/OrganizationMemberPicker";
import { useT } from "@/lib/i18n";

export function EventDemonstratorPicker(props: {
  organizationId: string;
  onSelect: (member: OrganizationMemberResponse) => void;
  onClose: () => void;
}) {
  const t = useT();
  return <OrganizationMemberPicker {...props} title={t("Choose demonstrator")} />;
}
