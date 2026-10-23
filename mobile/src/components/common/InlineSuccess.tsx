/**
 * MediTrack+ Reusable Inline Success Component
 * Visual Reference: PDF Page 6 (Inline Success Pattern)
 *
 * Compact horizontal success banner/toast style used across screens
 * after quick actions (save, update, remove, etc.).
 *
 * Variants shown on PDF Page 6:
 * - General success: "Saved successfully"
 * - After edit: "Medicine updated / Changes have been saved."
 * - Settings update: "Notification preferences updated"
 * - Account / caregiver action: "Caregiver removed successfully"
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

export type InlineSuccessVariant =
  | "saved"
  | "medicine_updated"
  | "preferences_updated"
  | "caregiver_removed"
  | "custom";

export interface InlineSuccessProps {
  /**
   * Pre-packaged variant matching PDF Page 6 specifications.
   */
  variant?: InlineSuccessVariant;
  /**
   * Primary title or message text.
   */
  title?: string;
  /**
   * Optional secondary subtitle (e.g. "Changes have been saved.").
   */
  subtitle?: string;
  /**
   * Callback invoked when user taps the dismiss (X) button.
   */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const InlineSuccess: React.FC<InlineSuccessProps> = ({
  variant = "saved",
  title,
  subtitle,
  onDismiss,
  style,
}) => {
  let resolvedTitle = title || "Saved successfully";
  let resolvedSubtitle = subtitle;

  switch (variant) {
    case "medicine_updated":
      resolvedTitle = title || "Medicine updated";
      resolvedSubtitle = subtitle || "Changes have been saved.";
      break;
    case "preferences_updated":
      resolvedTitle = title || "Notification preferences updated";
      break;
    case "caregiver_removed":
      resolvedTitle = title || "Caregiver removed successfully";
      break;
    case "saved":
      resolvedTitle = title || "Saved successfully";
      break;
    case "custom":
    default:
      if (title) resolvedTitle = title;
      if (subtitle) resolvedSubtitle = subtitle;
      break;
  }

  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      {/* Green circular icon container (22x22px with white checkmark) */}
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      </View>

      {/* Message Text Column */}
      <View style={styles.textColumn}>
        <Text style={styles.titleText}>{resolvedTitle}</Text>
        {resolvedSubtitle ? (
          <Text style={styles.subtitleText}>{resolvedSubtitle}</Text>
        ) : null}
      </View>

      {/* Dismiss Button (min 44px touch target) */}
      {onDismiss ? (
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
        >
          <Ionicons name="close" size={18} color="#059669" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
    width: "100%",
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  textColumn: {
    flex: 1,
    justifyContent: "center",
  },
  titleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    lineHeight: 18,
  },
  subtitleText: {
    fontSize: 12,
    color: "#047857",
    marginTop: 2,
    lineHeight: 16,
  },
  dismissButton: {
    padding: 6,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
