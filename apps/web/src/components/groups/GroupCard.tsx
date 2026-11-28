"use client";

import { type ComponentProps, memo } from "react";
import { renderWebCardNavigation } from "@/components/common/ui/LinkedListCard";
import { GroupCardView } from "./GroupCardView";

export const GroupCard = memo(function GroupCard(
  props: Omit<ComponentProps<typeof GroupCardView>, "renderNavigation">,
) {
  return <GroupCardView {...props} renderNavigation={renderWebCardNavigation} />;
});
