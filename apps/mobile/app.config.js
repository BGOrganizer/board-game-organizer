const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
// Generated from installed HeroUI tokens for native APIs that require hex colors.
const { nativeColors } = require("./assets/branding.json");
const locales = {
  en: require("./assets/locales/en.json"),
  it: require("./assets/locales/it.json"),
};
const variant = process.env.APP_VARIANT ?? "development";
if (variant !== "development" && variant !== "production")
  throw new Error("APP_VARIANT must be development or production");
const development = variant === "development";
const updateChannel = process.env.EXPO_UPDATE_CHANNEL ?? variant;
if (
  development
    ? !/^(development|(ci|development)-pr-[1-9][0-9]*)$/.test(updateChannel)
    : updateChannel !== "production"
)
  throw new Error("EXPO_UPDATE_CHANNEL must match APP_VARIANT and a supported channel");
const appNameKey = development ? "app_name_development" : "app_name";
const androidPackage = development
  ? "com.bgo.boardgameorganizer.dev"
  : "com.bgo.boardgameorganizer";
if (process.env.GOOGLE_SERVICES_JSON) {
  let clients;
  try {
    clients = JSON.parse(
      readFileSync(resolve(__dirname, process.env.GOOGLE_SERVICES_JSON), "utf8"),
    ).client;
  } catch {
    throw new Error("Cannot read GOOGLE_SERVICES_JSON as a Firebase app configuration");
  }
  if (
    !Array.isArray(clients) ||
    !clients.some(
      (client) => client?.client_info?.android_client_info?.package_name === androidPackage,
    )
  )
    throw new Error("GOOGLE_SERVICES_JSON does not match the selected Android app variant");
}

module.exports = {
  expo: {
    name: locales.en.android[appNameKey],
    slug: "board-game-organizer",
    version: "1.3.2",
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      url: "https://u.expo.dev/f19004af-2669-49ca-8c46-2697b66841b6",
      requestHeaders: { "expo-channel-name": updateChannel },
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    },
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    newArchEnabled: true,
    locales: Object.fromEntries(
      Object.entries(locales).map(([locale, strings]) => [
        locale,
        { ...strings, android: { app_name: strings.android[appNameKey] } },
      ]),
    ),
    ios: {
      scheme: "bgo",
      supportsTablet: true,
      bundleIdentifier: "com.bgo.mobile",
      infoPlist: { CFBundleDisplayName: locales.en.android.app_name },
    },
    android: {
      scheme: development ? "bgo-dev" : "bgo",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
      icon: "./assets/icon.png",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-foreground.png",
        backgroundImage: "./assets/adaptive-icon-background.png",
        monochromeImage: "./assets/adaptive-icon-monochrome.png",
        backgroundColor: nativeColors.lightBackground,
      },
      package: androidPackage,
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
          image: "./assets/splash.png",
          imageWidth: 280,
          // Android masks native artwork. Show only its background until the full-size animated overlay mounts.
          android: { image: "./assets/splash-android.png", imageWidth: 280 },
          resizeMode: "contain",
          backgroundColor: nativeColors.lightBackground,
          dark: { backgroundColor: nativeColors.darkBackground },
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
      [
        "expo-notifications",
        { icon: "./assets/notification-icon.png", color: nativeColors.notificationTint },
      ],
      "@react-native-community/datetimepicker",
    ],
    extra: {
      sentryEnvironment: variant,
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
