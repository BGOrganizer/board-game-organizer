import { initServerI18n } from "@/lib/i18n";

export default async function Groups() {
  await initServerI18n();
  return (
    <div className="flex justify-center">
      <p className="text-sm text-default-500">Groups — coming soon</p>
    </div>
  );
}
