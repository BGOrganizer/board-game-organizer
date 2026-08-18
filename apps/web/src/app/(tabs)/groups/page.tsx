import { Trans } from "@lingui/react/macro";
import { initServerI18n } from "@/lib/i18n";

export default async function Groups() {
  await initServerI18n();
  return (
    <div className="flex justify-center">
      <h1 className="text-xl font-semibold">
        <Trans>Groups</Trans>
      </h1>
    </div>
  );
}
