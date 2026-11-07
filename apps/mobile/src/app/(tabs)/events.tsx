import { useLocalSearchParams } from "expo-router";
import { Events } from "@/components/events/Events";
export default function Screen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <Events key={section} initialSection={section === "available" ? "available" : "mine"} />;
}
