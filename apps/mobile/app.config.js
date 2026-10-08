module.exports = {
  expo: {
    name: "Board Game Organizer",
    slug: "board-game-organizer",
    version: "1.3.2",
    orientation: "portrait",
    scheme: "bgo",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    newArchEnabled: true,
    locales: { en: "./assets/locales/en.json", it: "./assets/locales/it.json" },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.bgo.mobile",
    },
    android: {
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
      icon: "./assets/icon.png",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-foreground.png",
        backgroundImage: "./assets/adaptive-icon-background.png",
        monochromeImage: "./assets/adaptive-icon-monochrome.png",
        backgroundColor: "#4c2482",
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
      [
        "expo-splash-screen",
        {
          image: "./assets/icon.png",
          imageWidth: 200,
          backgroundColor: "#ffffff",
        },
      ],
      "@clerk/expo",
      "expo-secure-store",
      "@sentry/react-native",
      "expo-font",
      "expo-contacts",
      [
        "expo-image-picker",
        {
          photosPermission: "Choose an organization logo from your photo library.",
          cameraPermission: "Take a photo for your organization logo.",
          microphonePermission: false,
        },
      ],
      [
        "expo-location",
        { locationWhenInUsePermission: "Show your position on the match location map." },
      ],
      "@maplibre/maplibre-react-native",
      ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#006fee" }],
      "@react-native-community/datetimepicker",
    ],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      maptilerApiKey: process.env.EXPO_PUBLIC_MAPTILER_API_KEY,
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      router: {},
      eas: {
        projectId: "f19004af-2669-49ca-8c46-2697b66841b6",
      },
    },
    owner: "bgo-org",
  },
};
