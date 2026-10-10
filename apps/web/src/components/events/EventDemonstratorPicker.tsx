"use client";
import type { OrganizationMemberResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { OrganizationMemberPicker } from "@/components/organizations/OrganizationMemberPicker";

export function EventDemonstratorPicker(props: {
  organizationId: string;
  onSelect: (member: OrganizationMemberResponse) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return <OrganizationMemberPicker {...props} title={t`Choose demonstrator`} />;
}
