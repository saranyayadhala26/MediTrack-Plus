/**
 * Reusable MediTrack+ Status Pill Component
 * Standardized status indicators across medicine cards, schedules, and adherence logs.
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { colors, borderRadius, spacing } from "../../constants/theme";

export type StatusPillType =
  | "Upcoming"
  | "Pending"
  | "Taken"
  | "Skipped"
  | "Snoozed"
  | "Low stock"
  | "Out of stock"
  | "Active"
  | "Completed";

export interface StatusPillProps {
  status: StatusPillType | string;
  style?: StyleProp<ViewStyle>;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, style }) => {
  const getPillStyles = () => {
    switch (status) {
      case "Upcoming":
        return {
          container: styles.upcomingContainer,
          text: styles.upcomingText,
        };
      case "Pending":
      case "Low stock":
        return {
          container: styles.warningContainer,
          text: styles.warningText,
        };
      case "Taken":
      case "Completed":
        return {
          container: styles.successContainer,
          text: styles.successText,
        };
      case "Skipped":
      case "Out of stock":
        return {
          container: styles.criticalContainer,
          text: styles.criticalText,
        };
      case "Snoozed":
        return {
          container: styles.snoozedContainer,
          text: styles.snoozedText,
        };
      case "Active":
      default:
        return {
          container: styles.activeContainer,
          text: styles.activeText,
        };
    }
  };

  const pillStyles = getPillStyles();

  return (
    <View style={[styles.baseContainer, pillStyles.container, style]}>
      <Text style={[styles.baseText, pillStyles.text]}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
  },
  baseText: {
    fontSize: 11,
    fontWeight: "700",
  },
  upcomingContainer: {
    backgroundColor: colors.secondaryLight,
  },
  upcomingText: {
    color: colors.secondary,
  },
  warningContainer: {
    backgroundColor: colors.warningLight,
  },
  warningText: {
    color: colors.warningDark,
  },
  successContainer: {
    backgroundColor: colors.successLight,
  },
  successText: {
    color: colors.success,
  },
  criticalContainer: {
    backgroundColor: colors.dangerLight,
  },
  criticalText: {
    color: colors.danger,
  },
  snoozedContainer: {
    backgroundColor: colors.warningLight,
  },
  snoozedText: {
    color: colors.warningDark,
  },
  activeContainer: {
    backgroundColor: colors.primarySubtle,
  },
  activeText: {
    color: colors.primary,
  },
});
