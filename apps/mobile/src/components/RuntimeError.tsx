import { Text, View } from "react-native";

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
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
        Errore imprevisto
      </Text>
      <Text style={{ color: "#666", textAlign: "center" }}>
        L&apos;errore è stato segnalato. Riavvia l&apos;app.
      </Text>
      {message ? (
        <Text
          style={{
            marginTop: 16,
            fontSize: 15,
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
          selectable
        >
          {componentStack.slice(0, 1500)}
        </Text>
      ) : null}
    </View>
  );
}
