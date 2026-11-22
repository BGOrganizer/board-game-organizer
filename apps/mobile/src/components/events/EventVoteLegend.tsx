import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { EventVoteLegendContent } from "./EventVoteLegendContent";
export function EventVoteLegend({
  label,
  scope = "event",
}: {
  label: string;
  scope?: "event" | "table";
}) {
  const t = useT();
  return (
    <HelpPopover label={`${label}: ${t("Voting legend")}`} title={label} width={300}>
      <EventVoteLegendContent scope={scope} />
    </HelpPopover>
  );
}
