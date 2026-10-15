import { Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { HelpPopover } from "./HelpPopover";

export function SearchHelpLabel({
  label,
  help,
  helpTitle,
  htmlFor,
}: {
  label: string;
  help: string;
  helpTitle?: string;
  htmlFor?: string;
}) {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <HelpPopover
        label={`${label}: ${helpTitle ?? t`Search help`}`}
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {help}
      </HelpPopover>
    </div>
  );
}
