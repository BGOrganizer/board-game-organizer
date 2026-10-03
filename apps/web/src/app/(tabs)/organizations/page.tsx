import { Trans } from "@lingui/react/macro";
import { Building2 } from "lucide-react";
import { initServerI18n } from "@/lib/i18n";

export default async function Organizations() {
  await initServerI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-default-500">
      <Building2 className="size-12" aria-hidden="true" />
      <p className="text-sm">
        <Trans>Coming soon</Trans>
      </p>
    </div>
  );
}
