import { Text } from "heroui-native/text";

import { TabScreen } from "@/components/TabScreen";

export default function ContactsScreen() {
  return (
    <TabScreen title="Contacts" centered>
      <Text className="text-muted">Tab [Contacts]</Text>
    </TabScreen>
  );
}
