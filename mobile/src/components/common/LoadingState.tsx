/**
 * Reusable Loading State Indicator
 */

import React from "react";
import { View, Text, ActivityIndicator, StyleSheet, ViewStyle } from "react-native";
import { colors, typography, spacing } from "../../constants/theme";

interface LoadingStateProps {
  message?: string;
  style?: ViewStyle;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading medication details...",
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
