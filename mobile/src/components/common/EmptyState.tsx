/**
 * MediTrack+ Reusable Empty State Component System
 * Visual Reference: PDF Page 9 (Empty State Component System)
 *
 * Provides calm, consistent, beautifully centered empty states across
 * Medicines, Activity, Calendar, Alerts, and custom application modules.
 */

import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "../../constants/theme";

export type EmptyStateVariant =
  | "medicines"
  | "activity"
  | "calendar"
  | "alerts"
  | "custom";

export interface EmptyStateProps {
  /**
   * Pre-packaged variant matching PDF Page 9 specifications.
   */
  variant?: EmptyStateVariant;
  /**
   * Custom title text. Overrides default variant title if provided.
   */
  title?: string;
  /**
   * Custom description text. Overrides default variant description if provided.
   */
  description?: string;
  /**
   * Custom Ionicons glyph name. Overrides variant default icon if provided.
   */
  iconName?: keyof typeof Ionicons.glyphMap;
  /**
   * Primary action button label (e.g., "+ Add Medicine").
   */
  actionTitle?: string;
  /**
   * Callback invoked on primary action press.
   */
  onActionPress?: () => void;
  /**
   * Optional secondary action button label (e.g., "Reset Filters").
   */
  secondaryActionTitle?: string;
  /**
   * Callback invoked on secondary action press.
   */
  onSecondaryActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = "custom",
  title,
  description,
  iconName,
  actionTitle,
  onActionPress,
  secondaryActionTitle,
  onSecondaryActionPress,
  style,
}) => {
  // Resolve defaults based on variant
  let resolvedIcon: keyof typeof Ionicons.glyphMap = "medkit-outline";
  let resolvedTitle = title || "No items found";
  let resolvedDescription =
    description || "There is no information to display at this time.";
  let resolvedActionTitle = actionTitle;

  switch (variant) {
    case "medicines":
      resolvedIcon = "medkit-outline";
      resolvedTitle = title || "No medicines yet";
      resolvedDescription =
        description ||
        "Add your first medicine to start managing your medication schedule.";
      resolvedActionTitle = actionTitle || "+ Add Medicine";
      break;

    case "activity":
      resolvedIcon = "reader-outline";
      resolvedTitle = title || "No medication activity";
      resolvedDescription =
        description ||
        "Your medication actions will appear here after taking, skipping, or snoozing doses.";
      break;

    case "calendar":
      resolvedIcon = "calendar-outline";
      resolvedTitle = title || "No medication activity";
      resolvedDescription =
        description ||
        "There is no medication activity recorded for this date.";
      break;

    case "alerts":
      resolvedIcon = "notifications-outline";
      resolvedTitle = title || "No alerts";
      resolvedDescription =
        description ||
        "There are no medication alerts that need your attention.";
      break;

    case "custom":
    default:
      if (iconName) resolvedIcon = iconName;
      if (title) resolvedTitle = title;
      if (description) resolvedDescription = description;
      break;
  }

  // Override with custom icon if explicitly passed
  if (iconName) {
    resolvedIcon = iconName;
  }

  return (
    <View style={[styles.container, style]}>
      {/* 64x64px Mint Icon Container (PDF Page 9 Anatomy) */}
      <View style={styles.iconContainer}>
        <Ionicons name={resolvedIcon} size={32} color="#0D9488" />
      </View>

      {/* Title Text (20px, Semibold, #0F172A) */}
      <Text style={styles.titleText}>{resolvedTitle}</Text>

      {/* Description Text (14px, Regular, #64748B) */}
      <Text style={styles.descriptionText}>{resolvedDescription}</Text>

      {/* Primary Action Button (48px height, 12px radius, #0D9488, White text) */}
      {resolvedActionTitle && onActionPress ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onActionPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={resolvedActionTitle}
        >
          <Text style={styles.primaryButtonText}>{resolvedActionTitle}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Optional Secondary Action Button */}
      {secondaryActionTitle && onSecondaryActionPress ? (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondaryActionPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={secondaryActionTitle}
        >
          <Text style={styles.secondaryButtonText}>
            {secondaryActionTitle}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  /* 64x64px Mint Circular Container */
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  /* Title Text (20px, Semibold, #0F172A) */
  titleText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  /* Description Text (14px, Regular, #64748B, 1-2 lines) */
  descriptionText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
    marginBottom: 20,
  },
  /* Primary Action Button (Height: 48px, 12px radius, Background: #0D9488) */
  primaryButton: {
    height: 48,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  /* Optional Secondary Button */
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#0D9488",
    fontSize: 14,
    fontWeight: "600",
  },
});
