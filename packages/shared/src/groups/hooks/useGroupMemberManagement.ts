"use client";
import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { useRef, useState } from "react";
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
  const submitted = useRef<typeof managed>(null);
  const isBusy = (userId: string) =>
    actions.isPersonBusy(group.id, userId) || social.isBusy(userId);
  const busy = Boolean(managed && isBusy(managed.person.userId));
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
    setManaged(null);
    setError(null);
  };
  const confirm = (
    action: GroupPersonAction = managed?.action ?? "remove",
    until: string | null = null,
  ) => {
    if (!managed || submitted.current === managed || !allowed(managed.person, action)) return;
    if (action !== "ban" && action !== "revoke" && !managed.person.membership) return;
    submitted.current = managed;
    setError(null);
    if (action === "ban")
      actions.ban.mutate({ id: group.id, input: { userId: managed.person.userId, until } });
    else if (action === "revoke")
      actions.revoke.mutate({ id: group.id, userId: managed.person.userId });
    else if (managed.person.membership)
      actions.membership.mutate({
        id: group.id,
        userId: managed.person.userId,
        input: { action, version: managed.person.membership.version },
      });
    setManaged(null);
  };
  const runSocial = async (person: GroupPersonResponse, action: ContactAction) => {
    if (!group.canSocialInteract || communityAccessDenied(list.error) || isBusy(person.userId))
      return;
    await social.run(person, action);
  };
  return {
    list,
    busy,
    blocking: actions.blocking,
    isBusy,
    managed,
    error,
    open,
    close,
    confirm,
    runSocial,
  };
}
