"use client";

import type { ComponentProps } from "react";
import { renderWebCardNavigation } from "@/components/common/ui/LinkedListCard";
import { GroupCardView } from "./GroupCardView";

export function GroupCard(props: Omit<ComponentProps<typeof GroupCardView>, "renderNavigation">) {
  return <GroupCardView {...props} renderNavigation={renderWebCardNavigation} />;
}
