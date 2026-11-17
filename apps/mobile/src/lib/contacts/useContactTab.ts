import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { type ContactTab, contactTab } from "./contacts";

/** Consume a deep-link selection once; ordinary tab presses do not update the navigator. */
export function useContactTab() {
  const router = useRouter();
  const { tab: parameter } = useLocalSearchParams<{ tab?: string | string[] }>();
  const requested = parameter === undefined ? undefined : contactTab(parameter);
  const [tab, setTab] = useState<ContactTab>(requested ?? "connections");
  useEffect(() => {
    if (requested === undefined) return;
    setTab(requested);
    // Clearing the consumed parameter also makes the same link usable again after a local change.
    router.setParams({ tab: undefined });
  }, [requested, router]);
  return { tab, setTab };
}
