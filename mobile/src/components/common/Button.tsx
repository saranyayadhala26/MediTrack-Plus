/**
 * Reusable MediTrack+ Button Component
 * Primary teal, white text, rounded corners, minimum 44px touch target.
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import { colors, typography, borderRadius, accessibility, spacing } from "../../constants/theme";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "text";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
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
  accessibilityLabel,
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
      accessibilityLabel={accessibilityLabel || title}
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

export const PrimaryButton: React.FC<Omit<ButtonProps, "variant">> = (props) => (
  <Button variant="primary" {...props} />
);

export const SecondaryButton: React.FC<Omit<ButtonProps, "variant">> = (props) => (
  <Button variant="outline" {...props} />
);

const styles = StyleSheet.create({
  baseContainer: {
    minHeight: accessibility.minTouchTarget, // 44px
    borderRadius: borderRadius.md, // 10px
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  primaryContainer: {
    backgroundColor: colors.primary,
  },
  secondaryContainer: {
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  outlineContainer: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dangerContainer: {
    backgroundColor: colors.danger,
  },
  textContainer: {
    backgroundColor: "transparent",
    paddingHorizontal: spacing.sm,
    minHeight: accessibility.minTouchTarget,
  },
  disabledContainer: {
    backgroundColor: colors.border,
    borderColor: colors.border,
    opacity: 0.6,
  },
  primaryText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textInverse,
    textAlign: "center",
  },
  secondaryText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryDark,
    textAlign: "center",
  },
  outlineText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
  },
  dangerText: {
    ...typography.body,
    fontWeight: "700",
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
