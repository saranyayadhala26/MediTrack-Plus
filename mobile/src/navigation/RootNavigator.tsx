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
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";
import { VerifyEmailScreen } from "../screens/auth/VerifyEmailScreen";
import { MainAppNavigator } from "./MainAppNavigator";

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, setAuthSession } = useAuth();
  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot-password" | "reset-password" | "verify-email"
  >("login");
  const [recoveryEmail, setRecoveryEmail] = useState<string>("");
  const [verificationEmail, setVerificationEmail] = useState<string>("");

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
        {authMode === "login" && (
          <LoginScreen
            onNavigateToRegister={() => setAuthMode("register")}
            onNavigateToForgotPassword={() => setAuthMode("forgot-password")}
          />
        )}
        {authMode === "register" && (
          <RegisterScreen
            onNavigateToLogin={() => setAuthMode("login")}
            onNavigateToVerifyEmail={(email) => {
              setVerificationEmail(email);
              setAuthMode("verify-email");
            }}
          />
        )}
        {authMode === "verify-email" && (
          <VerifyEmailScreen
            email={verificationEmail}
            onVerificationSuccess={async (user, token) => {
              if (token && user) {
                await setAuthSession(token, user);
              } else {
                setAuthMode("login");
              }
            }}
            onNavigateToLogin={() => setAuthMode("login")}
          />
        )}
        {authMode === "forgot-password" && (
          <ForgotPasswordScreen
            onNavigateToLogin={() => setAuthMode("login")}
            onCodeSent={(email) => {
              setRecoveryEmail(email);
              setAuthMode("reset-password");
            }}
          />
        )}
        {authMode === "reset-password" && (
          <ResetPasswordScreen
            initialEmail={recoveryEmail}
            onNavigateToLogin={() => setAuthMode("login")}
            onNavigateToForgotPassword={() => setAuthMode("forgot-password")}
          />
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
