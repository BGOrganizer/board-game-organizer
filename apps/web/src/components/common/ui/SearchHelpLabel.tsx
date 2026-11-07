import { Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { HelpPopover } from "./HelpPopover";

export function SearchHelpLabel({
  label,
  help,
  helpTitle,
  htmlFor,
  required = false,
}: {
  label: string;
  help: string;
  helpTitle?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="font-bold">
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </Label>
      <HelpPopover
        label={`${label}: ${helpTitle ?? t`Search help`}`}
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {help}
      </HelpPopover>
    </div>
  );
}
