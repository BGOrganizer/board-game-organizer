import { Text } from "heroui-native/text";
import { View } from "react-native";

type Props = {
  message?: string;
  componentStack?: string;
};

export function RuntimeError({ message, componentStack }: Props) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <Text className="text-lg font-bold">Errore imprevisto</Text>
      <Text className="mt-2 text-center text-muted">
        L&apos;errore è stato segnalato. Riavvia l&apos;app.
      </Text>
      {message ? (
        <Text className="mt-4 text-center font-semibold">{message}</Text>
      ) : null}
      {componentStack ? (
        <Text className="mt-2 text-xs text-muted" numberOfLines={30}>
          {componentStack.slice(0, 1500)}
        </Text>
      ) : null}
    </View>
  );
}
