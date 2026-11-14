import { useThemeColor } from "heroui-native/hooks";
import { Text, View } from "react-native";

type Props = {
  message?: string;
  componentStack?: string;
};

/**
 * Crash fallback rendered by the Sentry ErrorBoundary. It must NOT use
 * heroui-native components: the boundary replaces the whole provider tree,
 * so component-context (TextComponentProvider) is unavailable here.
 * Plain RN hosts and the provider-independent token hook remain safe outside that tree.
 */
export function RuntimeError({ message, componentStack }: Props) {
  const [background, foreground, muted] = useThemeColor(["background", "foreground", "muted"]);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        backgroundColor: background,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "bold", color: foreground }}>Errore imprevisto</Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: muted, textAlign: "center" }}>
        L&apos;errore è stato segnalato. Riavvia l&apos;app.
      </Text>
      {message ? (
        <Text
          style={{
            marginTop: 16,
            fontSize: 14,
            color: foreground,
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
            color: muted,
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
