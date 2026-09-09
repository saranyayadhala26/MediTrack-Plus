/**
 * Accessible, High-Contrast Reusable Button Component
 * Adheres to WCAG minimum 48px touch targets for elderly users.
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { colors, typography, borderRadius, accessibility, spacing } from "../../constants/theme";

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "text";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}) => {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case "secondary":
        return styles.secondaryContainer;
      case "outline":
        return styles.outlineContainer;
      case "danger":
        return styles.dangerContainer;
      case "text":
        return styles.textContainer;
      default:
        return styles.primaryContainer;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case "secondary":
        return styles.secondaryText;
      case "outline":
        return styles.outlineText;
      case "danger":
        return styles.dangerText;
      case "text":
        return styles.textVariantText;
      default:
        return styles.primaryText;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.baseContainer,
        getContainerStyle(),
        disabled && styles.disabledContainer,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" || variant === "text" ? colors.primary : colors.textInverse}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), textStyle, icon ? { marginLeft: spacing.sm } : null]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    minHeight: accessibility.minTouchTarget,
    borderRadius: borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  primaryContainer: {
    backgroundColor: colors.primary,
  },
  secondaryContainer: {
    backgroundColor: colors.secondary,
  },
  outlineContainer: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dangerContainer: {
    backgroundColor: colors.danger,
  },
  textContainer: {
    backgroundColor: "transparent",
    minHeight: accessibility.minTouchTarget - 8,
    paddingHorizontal: spacing.sm,
  },
  disabledContainer: {
    opacity: 0.5,
  },
  primaryText: {
    ...typography.h3,
    color: colors.textInverse,
    textAlign: "center",
  },
  secondaryText: {
    ...typography.h3,
    color: colors.textInverse,
    textAlign: "center",
  },
  outlineText: {
    ...typography.h3,
    color: colors.primary,
    textAlign: "center",
  },
  dangerText: {
    ...typography.h3,
    color: colors.textInverse,
    textAlign: "center",
  },
  textVariantText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primary,
    textAlign: "center",
  },
});
