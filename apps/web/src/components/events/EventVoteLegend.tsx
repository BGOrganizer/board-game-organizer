"use client";
import { useLingui } from "@lingui/react/macro";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { EventVoteLegendContent } from "./EventVoteLegendContent";
export function EventVoteLegend({
  label,
  scope = "event",
  singleOption = false,
}: {
  label: string;
  scope?: "event" | "table";
  singleOption?: boolean;
}) {
  const { t } = useLingui();
  return (
    <HelpPopover label={`${label}: ${t`Voting legend`}`} title={label}>
      <EventVoteLegendContent scope={scope} singleOption={singleOption ? "only" : undefined} />
    </HelpPopover>
  );
}
