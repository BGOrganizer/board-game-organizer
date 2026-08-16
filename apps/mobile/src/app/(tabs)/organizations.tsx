import { Text } from "heroui-native/text";

import { TabScreen } from "@/components/TabScreen";

export default function OrganizationsScreen() {
  return (
    <TabScreen title="Organizations" centered>
      <Text className="text-muted">Tab [Organizations]</Text>
    </TabScreen>
  );
}
