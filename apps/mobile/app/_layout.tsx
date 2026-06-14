import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      {/* @ts-expect-error — Expo uses React 18, monorepo has React 19 types; safe at runtime */}
      <Stack>
        <Stack.Screen name="index" options={{ title: "Board Game Organizer" }} />
      </Stack>
    </>
  );
}
