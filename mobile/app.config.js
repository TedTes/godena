export default {
    expo: {
      name: "Godena",
      slug: "godena",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      assetBundlePatterns: [
        "**/*"
      ],
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.godena.app"
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#FFFFFF"
        },
        package: "com.godena.app"
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      plugins: [
        "expo-location",
        "expo-notifications",
        "expo-image-picker"
      ],
      extra: {
        eas: {
          projectId: "your-project-id-here"
        }
      }
    }
  };