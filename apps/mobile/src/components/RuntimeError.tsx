import { Text, View } from "react-native";

export function RuntimeError() {
    return (
        <View
            style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                padding: 24,
            }}
        >
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
                Errore imprevisto
            </Text>
            <Text style={{ color: "#666", textAlign: "center" }}>
                L&apos;errore è stato segnalato. Riavvia l&apos;app.
            </Text>
        </View>
    );
}