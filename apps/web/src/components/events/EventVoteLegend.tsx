"use client";
import { useLingui } from "@lingui/react/macro";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { EventVoteLegendContent } from "./EventVoteLegendContent";
export function EventVoteLegend({
  label,
  scope = "event",
}: {
  label: string;
  scope?: "event" | "table";
}) {
  const { t } = useLingui();
  return (
    <HelpPopover label={`${label}: ${t`Voting legend`}`} title={label}>
      <EventVoteLegendContent scope={scope} />
    </HelpPopover>
  );
}
