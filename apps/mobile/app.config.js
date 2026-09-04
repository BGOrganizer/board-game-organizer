module.exports = {
  expo: {
    name: "board-game-organizer",
    slug: "board-game-organizer",
    version: "1.3.1",
    orientation: "portrait",
    scheme: "bgo",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.bgo.mobile",
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#ffffff",
      },
      package: "com.bgo.mobile",
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "@clerk/expo",
      "expo-secure-store",
      "@sentry/react-native",
      "expo-font",
      "expo-contacts",
    ],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      router: {},
      eas: {
        projectId: "f19004af-2669-49ca-8c46-2697b66841b6",
      },
    },
    owner: "bgo-org",
  },
};
