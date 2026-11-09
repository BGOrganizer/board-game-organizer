"use client";
import { RECORD_USER_ROLES, type RecordUserRole } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import {
  Clock3,
  Crown,
  ListOrdered,
  Mail,
  Plus,
  Presentation,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { HelpPopover } from "./HelpPopover";

const icons = {
  admin: Crown,
  moderator: ShieldCheck,
  demonstrator: Presentation,
  invitation: Mail,
  request: Clock3,
  waiting: ListOrdered,
  accepted: UserRoundCheck,
};
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
    <span className="absolute -right-[1.375rem] -bottom-[1.375rem]">
      <HelpPopover
        size="compact"
        label={labels.join(" · ")}
        title={t`Roles and participation`}
        className="max-w-[calc(100vw-2rem)]"
        icon={icons[primary.icon]}
        tone={primary.tone}
        triggerClassName="bg-background"
        indicator={
          roles.length > 1 ? (
            <Plus
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-background text-foreground"
            />
          ) : undefined
        }
      >
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
          {roles.map((role, index) => {
            const item = RECORD_USER_ROLES[role],
              Icon = icons[item.icon];
            return (
              <li key={role} className="flex items-center gap-2">
                <Icon aria-hidden className={`size-4 shrink-0 ${colors[item.tone]}`} />
                <span>{labels[index]}</span>
              </li>
            );
          })}
        </ul>
      </HelpPopover>
    </span>
  );
}
