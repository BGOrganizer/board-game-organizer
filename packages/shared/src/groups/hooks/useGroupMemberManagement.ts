"use client";
import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import type { ContactAction } from "../../contacts/hooks/contactOptimistic";
import { type GroupPersonAction, groupPersonActions } from "../groupPolicy";
import { useGroupPeopleFeed } from "./useGroupPeopleFeed";
import { useGroupRecordActions } from "./useGroupRecords";
import { useGroupSocialActions } from "./useGroupSocialActions";
/** One workflow, platform-owned dialogs, navigation and virtualized rows. */
export function useGroupMemberManagement(options: CommunityApiOptions, group: GroupRecordResponse) {
  const list = useGroupPeopleFeed(options, group),
    actions = useGroupRecordActions(options, group.id),
    social = useGroupSocialActions(options);
  const [managed, setManaged] = useState<{
    person: GroupPersonResponse;
    action: GroupPersonAction;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isBusy = (userId: string) => actions.busy || social.isBusy(userId);
  const busy = actions.busy || Boolean(managed && social.isBusy(managed.person.userId));
  const allowed = (person: GroupPersonResponse, action: GroupPersonAction) =>
    !isBusy(person.userId) &&
    !communityAccessDenied(list.error) &&
    groupPersonActions(group, person).includes(action);
  const open = (person: GroupPersonResponse, action: GroupPersonAction) => {
    if (allowed(person, action)) {
      setError(null);
      setManaged({ person, action });
    }
  };
  const close = () => {
    if (!busy) {
      setManaged(null);
      setError(null);
    }
  };
  const confirm = async (
    action: GroupPersonAction = managed?.action ?? "remove",
    until: string | null = null,
  ) => {
    if (!managed || !allowed(managed.person, action)) return;
    setError(null);
    try {
      if (action === "ban")
        await actions.ban.mutateAsync({
          id: group.id,
          input: { userId: managed.person.userId, until },
        });
      else if (action === "revoke")
        await actions.revoke.mutateAsync({ id: group.id, userId: managed.person.userId });
      else if (managed.person.membership)
        await actions.membership.mutateAsync({
          id: group.id,
          userId: managed.person.userId,
          input: { action, version: managed.person.membership.version },
        });
      else return;
      setManaged(null);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("Group membership update failed"));
    }
  };
  const runSocial = async (person: GroupPersonResponse, action: ContactAction) => {
    if (!group.canSocialInteract || communityAccessDenied(list.error) || isBusy(person.userId))
      return;
    await social.run(person, action);
  };
  return { list, busy, isBusy, managed, error, open, close, confirm, runSocial };
}
