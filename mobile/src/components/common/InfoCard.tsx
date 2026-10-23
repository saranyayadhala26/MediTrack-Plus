/**
 * Reusable MediTrack+ InfoCard / Notice Banner Component
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, borderRadius, spacing } from "../../constants/theme";

export type InfoCardVariant = "info" | "warning" | "error" | "success" | "neutral";

export interface InfoCardProps {
  title?: string;
  message: string;
  variant?: InfoCardVariant;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export const InfoCard: React.FC<InfoCardProps> = ({
  title,
  message,
  variant = "info",
  iconName,
  style,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "warning":
        return {
          container: styles.warningContainer,
          border: styles.warningBorder,
          title: styles.warningTitle,
          icon: "alert-circle" as const,
          iconColor: colors.warningDark,
        };
      case "error":
        return {
          container: styles.errorContainer,
          border: styles.errorBorder,
          title: styles.errorTitle,
          icon: "alert-circle" as const,
          iconColor: colors.error,
        };
      case "success":
        return {
          container: styles.successContainer,
          border: styles.successBorder,
          title: styles.successTitle,
          icon: "checkmark-circle" as const,
          iconColor: colors.success,
        };
      case "neutral":
        return {
          container: styles.neutralContainer,
          border: styles.neutralBorder,
          title: styles.neutralTitle,
          icon: "information-circle" as const,
          iconColor: colors.textSecondary,
        };
      case "info":
      default:
        return {
          container: styles.infoContainer,
          border: styles.infoBorder,
          title: styles.infoTitle,
          icon: "information-circle" as const,
          iconColor: colors.primary,
        };
    }
  };

  const v = getVariantStyles();
  const effectiveIcon = iconName || v.icon;

  return (
    <View style={[styles.baseContainer, v.container, v.border, style]}>
      <View style={styles.headerRow}>
        <Ionicons name={effectiveIcon} size={18} color={v.iconColor} style={styles.icon} />
        {title ? <Text style={[styles.title, v.title]}>{title}</Text> : null}
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  icon: {
    marginRight: spacing.xs,
  },
  title: {
    ...typography.caption,
    fontWeight: "700",
  },
  message: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  infoContainer: {
    backgroundColor: colors.primarySubtle,
  },
  infoBorder: {
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    color: colors.primaryDark,
  },
  warningContainer: {
    backgroundColor: colors.warningLight,
  },
  warningBorder: {
    borderLeftColor: colors.warning,
  },
  warningTitle: {
    color: colors.warningDark,
  },
  errorContainer: {
    backgroundColor: colors.dangerLight,
  },
  errorBorder: {
    borderLeftColor: colors.error,
  },
  errorTitle: {
    color: colors.error,
  },
  successContainer: {
    backgroundColor: colors.successLight,
  },
  successBorder: {
    borderLeftColor: colors.success,
  },
  successTitle: {
    color: colors.success,
  },
  neutralContainer: {
    backgroundColor: colors.surfaceSubtle,
  },
  neutralBorder: {
    borderLeftColor: colors.borderStrong,
  },
  neutralTitle: {
    color: colors.textPrimary,
  },
});
