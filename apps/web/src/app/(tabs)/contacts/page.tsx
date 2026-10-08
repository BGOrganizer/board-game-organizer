import { Contacts } from "@/components/contacts/Contacts";
import { initServerI18n } from "@/lib/i18n";

export default async function ContactsPage() {
  await initServerI18n();
  return <Contacts />;
}
