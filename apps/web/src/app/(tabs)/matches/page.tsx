import { Matches } from "@/components/Matches";
import { initServerI18n } from "@/lib/i18n";

export default async function MatchesPage() {
  await initServerI18n();
  return <Matches />;
}
