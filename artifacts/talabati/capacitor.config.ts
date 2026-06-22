import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mizu.app",
  appName: "Mizu",
  webDir: "dist/public",
  android: {
    buildOptions: {
      releaseType: "APK",
    },
  },
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
