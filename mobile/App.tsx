import React from "react";
import { StatusBar } from "react-native";
import { colors } from "./src/constants/theme";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <RootNavigator />
    </AuthProvider>
  );
}
