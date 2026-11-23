import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
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
  const t = useT();
  return (
    <HelpPopover label={`${label}: ${t("Voting legend")}`} title={label} width={300}>
      <EventVoteLegendContent scope={scope} singleOption={singleOption ? "only" : undefined} />
    </HelpPopover>
  );
}
