"use client";

import { type ComponentProps, memo } from "react";
import { renderWebCardNavigation } from "@/components/common/ui/LinkedListCard";
import { EventCardView } from "./EventCardView";

export const EventCard = memo(function EventCard(
  props: Omit<ComponentProps<typeof EventCardView>, "renderNavigation">,
) {
  return <EventCardView {...props} renderNavigation={renderWebCardNavigation} />;
});
