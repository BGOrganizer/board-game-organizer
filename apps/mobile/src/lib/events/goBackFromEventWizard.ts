import type { useRouter } from "expo-router";

export function goBackFromEventWizard(
  router: Pick<ReturnType<typeof useRouter>, "canGoBack" | "back" | "replace">,
  eventId?: string,
  organizationId?: string,
) {
  if (router.canGoBack()) router.back();
  else if (eventId) router.replace({ pathname: "/event/[eventId]", params: { eventId } });
  else if (organizationId)
    router.replace({
      pathname: "/organization/[organizationId]",
      params: { organizationId, tab: "events" },
    });
  else router.replace("/(tabs)/events");
}
