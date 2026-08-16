import { Counter } from "@/components/Counter";
import { TabScreen } from "@/components/TabScreen";

export default function MatchesScreen() {
  return (
    <TabScreen title="Matches" centered>
      <Counter />
    </TabScreen>
  );
}
