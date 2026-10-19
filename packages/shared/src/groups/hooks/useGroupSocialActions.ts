"use client";
import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import type { CommunityApiOptions } from "../../community/communityApi";
import { usePeopleSocialActions } from "../../community/hooks/usePeopleSocialActions";
import { groupRecordKeys } from "./useGroupRecords";

export { communityPersonContact as groupPersonContact } from "../../community/hooks/usePeopleSocialActions";
export function useGroupSocialActions(options: CommunityApiOptions) {
  return usePeopleSocialActions<GroupPersonResponse>(options, [
    ...groupRecordKeys.root(options),
    "people",
  ]);
}
