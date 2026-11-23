"use client";

import type { ComponentProps } from "react";
import { renderWebCardNavigation } from "@/components/common/ui/LinkedListCard";
import { EventCardView } from "./EventCardView";

export function EventCard(props: Omit<ComponentProps<typeof EventCardView>, "renderNavigation">) {
  return <EventCardView {...props} renderNavigation={renderWebCardNavigation} />;
}
