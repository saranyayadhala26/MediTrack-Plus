/**
 * Reusable Card Component with Clean Elevation & Border
 */

import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { colors, borderRadius, spacing } from "../../constants/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "outlined" | "flat";
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = "default",
}) => {
  return (
    <View
      style={[
        styles.base,
        variant === "default" && styles.elevated,
        variant === "outlined" && styles.outlined,
        variant === "flat" && styles.flat,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  elevated: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  outlined: {
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  flat: {
    backgroundColor: colors.surfaceSubtle,
  },
});
