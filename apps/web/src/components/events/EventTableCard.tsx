"use client";

import type { ComponentProps } from "react";
import { renderWebCardNavigation } from "@/components/common/ui/LinkedListCard";
import { EventTableCardIndicators } from "./EventTableCardIndicators";
import { EventTableCardView } from "./EventTableCardView";

export function EventTableCard(
  props: Omit<ComponentProps<typeof EventTableCardView>, "renderNavigation" | "indicators">,
) {
  return (
    <EventTableCardView
      {...props}
      renderNavigation={renderWebCardNavigation}
      indicators={<EventTableCardIndicators table={props.table} />}
    />
  );
}
