/**
 * Root Application Navigator
 * Seamlessly toggles between Authenticated and Unauthenticated state
 * based on hardware-backed SecureStore session status.
 */

import React, { useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { LoadingState } from "../components/common/LoadingState";
import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { MainAppNavigator } from "./MainAppNavigator";

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <LoadingState message="Securing session from Keystore..." />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        {authMode === "login" ? (
          <LoginScreen onNavigateToRegister={() => setAuthMode("register")} />
        ) : (
          <RegisterScreen onNavigateToLogin={() => setAuthMode("login")} />
        )}
      </View>
    );
  }

  return <MainAppNavigator />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
