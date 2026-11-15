"use client";
import { RECORD_USER_ROLES, type RecordUserRole } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { recordUserRoleIcons } from "@/lib/recordUserRoleIcons";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { IconBadge } from "./IconBadge";

const colors = {
  warning: "text-warning-soft-foreground",
  accent: "text-accent-soft-foreground",
  success: "text-success-soft-foreground",
};

/** One compact primary badge; the complete independent facts remain reachable without wrapping. */
export function UserRoleBadge({ roles }: { roles: readonly RecordUserRole[] }) {
  const { t, i18n } = useLingui();
  const first = roles[0];
  if (!first) return null;
  const primary = RECORD_USER_ROLES[first];
  const labels = roles.map((role) => i18n._(recordUserRoleMessages[role]));
  return (
    <IconBadge
      label={labels.join(" · ")}
      title={t`Roles and participation`}
      icon={recordUserRoleIcons[primary.icon]}
      color={primary.tone}
      multiple={roles.length > 1}
    >
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
        {roles.map((role, index) => {
          const item = RECORD_USER_ROLES[role],
            Icon = recordUserRoleIcons[item.icon];
          return (
            <li key={role} className="flex items-center gap-2">
              <Icon aria-hidden className={`size-4 shrink-0 ${colors[item.tone]}`} />
              <span>{labels[index]}</span>
            </li>
          );
        })}
      </ul>
    </IconBadge>
  );
}
