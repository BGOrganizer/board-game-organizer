import { Trans } from "@lingui/react/macro";
import { initServerI18n } from "@/lib/i18n";

export default async function Contacts() {
  await initServerI18n();
  return (
    <div className="flex justify-center">
      <h1 className="text-xl font-semibold">
        <Trans>Contacts</Trans>
      </h1>
    </div>
  );
}
