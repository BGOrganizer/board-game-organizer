import { Text, View } from "react-native";

type Props = {
  message?: string;
  componentStack?: string;
};

/**
 * Crash fallback rendered by the Sentry ErrorBoundary. It must NOT use
 * heroui-native components: the boundary replaces the whole provider tree,
 * so component-context (TextComponentProvider) is unavailable here.
 * Uses plain react-native with explicit theme-agnostic colors.
 */
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
      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#111" }}>Errore imprevisto</Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: "#555", textAlign: "center" }}>
        L&apos;errore è stato segnalato. Riavvia l&apos;app.
      </Text>
      {message ? (
        <Text
          style={{
            marginTop: 16,
            fontSize: 14,
            color: "#111",
            textAlign: "center",
            fontWeight: "600",
          }}
        >
          {message}
        </Text>
      ) : null}
      {componentStack ? (
        <Text
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "#333",
            fontFamily: "monospace",
          }}
          numberOfLines={30}
        >
          {componentStack.slice(0, 1500)}
        </Text>
      ) : null}
    </View>
  );
}
