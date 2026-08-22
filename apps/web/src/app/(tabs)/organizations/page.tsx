import { initServerI18n } from "@/lib/i18n";

export default async function Organizations() {
  await initServerI18n();
  return (
    <div className="flex justify-center">
      <p className="text-sm text-default-500">Organizations — coming soon</p>
    </div>
  );
}
