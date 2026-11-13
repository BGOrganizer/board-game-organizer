"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Ban, UserRoundCheck, UserRoundPlus, UsersRound } from "lucide-react";
import { IconBadge } from "./IconBadge";

export function UserRelationshipBadge({
  user,
}: {
  user: Pick<ContactUser, "id" | "blockedByMe" | "isFriend" | "isFollowing" | "isFollower">;
}) {
  const { t } = useLingui();
  const facts = [
    user.blockedByMe && {
      icon: Ban,
      color: "danger" as const,
      label: t`Blocked`,
      description: t`People you have blocked.`,
    },
    user.isFriend && {
      icon: UsersRound,
      color: "accent" as const,
      label: t`Friends`,
      description: t`Friendship accepted.`,
    },
    user.isFollowing && {
      icon: UserRoundPlus,
      color: "warning" as const,
      label: t`Following`,
      description: t`People you follow.`,
    },
    user.isFollower && {
      icon: UserRoundCheck,
      color: "success" as const,
      label: t`Followers`,
      description: t`People who follow you.`,
    },
  ].filter((fact) => fact !== false && fact !== undefined);
  const first = facts[0];
  if (!first) return null;
  return (
    <IconBadge
      icon={first.icon}
      color={first.color}
      label={facts.map((fact) => fact.label).join(" · ")}
      title={t`Connections`}
      multiple={facts.length > 1}
    >
      <ul className="space-y-2">
        {facts.map((fact) => (
          <li key={fact.label}>
            <p className="font-medium">{fact.label}</p>
            <p>{fact.description}</p>
          </li>
        ))}
      </ul>
    </IconBadge>
  );
}
