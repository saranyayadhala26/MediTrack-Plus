import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { colors } from "./src/constants/theme";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <RootNavigator />
    </AuthProvider>
  );
}

