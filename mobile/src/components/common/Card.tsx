/**
 * Reusable MediTrack+ Card Component
 * Crisp white background, subtle border, very subtle shadow, 12px corner radius.
 */

import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { colors, borderRadius, spacing, shadows } from "../../constants/theme";

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "outlined" | "flat" | "elevated";
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
        (variant === "default" || variant === "elevated") && styles.defaultCard,
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
    borderRadius: borderRadius.lg, // 12px
    padding: spacing.lg, // 16px
    marginBottom: spacing.md, // 12px
    borderWidth: 1,
    borderColor: colors.border,
  },
  defaultCard: {
    ...shadows.card,
  },
  outlined: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  flat: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});
