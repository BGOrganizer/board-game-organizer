import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { View } from "react-native";

export function SectionHeaderCard({
  title,
  leading,
  description,
  action,
}: {
  title: string;
  leading: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Card.Title accessible role="heading">
          {title}
        </Card.Title>
        {description ? <Card.Description>{description}</Card.Description> : null}
      </View>
      {action}
    </Card>
  );
}
