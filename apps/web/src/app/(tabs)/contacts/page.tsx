import { Contacts } from "@/components/Contacts";
import { initServerI18n } from "@/lib/i18n";

export default async function ContactsPage() {
  await initServerI18n();
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md">
        <Contacts />
      </div>
    </div>
  );
}
