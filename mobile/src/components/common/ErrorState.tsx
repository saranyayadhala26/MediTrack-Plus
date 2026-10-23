/**
 * MediTrack+ Reusable Error State Component System
 * Visual Reference: PDF Page 7 (Error State Component System)
 *
 * Supports:
 * - A. Page / Data Load Error (cloud-offline icon)
 * - B. Network Error (wifi-offline icon + optional Check Connection)
 * - C. Action / Submission Error (alert icon or banner mode)
 * - D. Empty State with Error (document/list error icon)
 * - Mode: "fullscreen" | "section" | "banner"
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

export type ErrorStateVariant =
  | "data_load"
  | "network"
  | "action"
  | "empty_with_error"
  | "custom";

export interface ErrorStateProps {
  /**
   * Pre-packaged variant matching PDF Page 7 specifications.
   */
  variant?: ErrorStateVariant;
  /**
   * Layout display mode:
   * - "section": Standard centered error block with circular icon (default)
   * - "banner": Compact top banner card for form/action submission errors
   */
  mode?: "section" | "banner";
  /**
   * Primary error title.
   */
  title?: string;
  /**
   * Detailed explanation or error message.
   */
  message?: string;
  /**
   * Retry callback invoked on primary CTA press.
   */
  onRetry?: () => void;
  /**
   * Retry button label. Defaults to "Try Again".
   */
  retryTitle?: string;
  /**
   * Optional secondary action callback (e.g. "Check Connection").
   */
  onSecondaryAction?: () => void;
  /**
   * Secondary action button label.
   */
  secondaryActionTitle?: string;
  /**
   * Custom icon override.
   */
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  variant = "data_load",
  mode = "section",
  title,
  message,
  onRetry,
  retryTitle = "Try Again",
  onSecondaryAction,
  secondaryActionTitle,
  iconName,
  style,
}) => {
  // Resolve defaults based on variant
  let resolvedIcon: keyof typeof Ionicons.glyphMap = "cloud-offline-outline";
  let resolvedTitle = title || "Something went wrong";
  let resolvedMessage =
    message || "An unexpected error occurred. Please try again.";
  let resolvedSecondaryTitle = secondaryActionTitle;

  switch (variant) {
    case "network":
      resolvedIcon = "wifi-outline";
      resolvedTitle = title || "You're offline";
      resolvedMessage =
        message || "Check your internet connection and try again.";
      if (!resolvedSecondaryTitle && onSecondaryAction) {
        resolvedSecondaryTitle = "Check Connection";
      }
      break;

    case "action":
      resolvedIcon = "alert-circle-outline";
      resolvedTitle = title || "Couldn't save medicine";
      resolvedMessage = message || "Something went wrong. Please try again.";
      break;

    case "empty_with_error":
      resolvedIcon = "document-text-outline";
      resolvedTitle = title || "Couldn't load activity";
      resolvedMessage =
        message ||
        "We couldn't retrieve your medication activity right now. Please try again.";
      break;

    case "data_load":
    default:
      resolvedIcon = "cloud-offline-outline";
      resolvedTitle = title || "Couldn't load your data";
      resolvedMessage =
        message ||
        "We couldn't retrieve the information right now. Please try again.";
      break;
  }

  if (iconName) {
    resolvedIcon = iconName;
  }

  // =========================================================
  // Banner Mode (PDF Page 7: Action / Submission Error banner)
  // =========================================================
  if (mode === "banner") {
    return (
      <View style={[styles.bannerContainer, style]} accessibilityRole="alert">
        <View style={styles.bannerIconBadge}>
          <Text style={styles.bannerExclamationText}>!</Text>
        </View>
        <View style={styles.bannerTextCol}>
          <Text style={styles.bannerTitle}>{resolvedTitle}</Text>
          <Text style={styles.bannerSubtitle}>{resolvedMessage}</Text>
        </View>
        {onRetry ? (
          <TouchableOpacity
            style={styles.bannerRetryBtn}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryTitle}
          >
            <Ionicons name="refresh-outline" size={16} color="#0D9488" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // =========================================================
  // Standard Section Mode (PDF Page 7 Anatomy)
  // =========================================================
  return (
    <View style={[styles.container, style]}>
      {/* 64x64px Soft Red Icon Circle (PDF Page 7 Anatomy) */}
      <View style={styles.iconContainer}>
        <Ionicons name={resolvedIcon} size={32} color="#DC2626" />
      </View>

      {/* Title Text (20px, Bold, #0F172A) */}
      <Text style={styles.titleText}>{resolvedTitle}</Text>

      {/* Description Text (14px, #64748B, maxWidth 280) */}
      <Text style={styles.descriptionText}>{resolvedMessage}</Text>

      {/* Primary Action Button (48px height, 12px radius, #0D9488, with Retry icon) */}
      {onRetry ? (
        <TouchableOpacity
          style={styles.primaryRetryBtn}
          onPress={onRetry}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={retryTitle}
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryRetryText}>{retryTitle}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Optional Secondary Action (e.g. Check Connection) */}
      {resolvedSecondaryTitle && onSecondaryAction ? (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onSecondaryAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={resolvedSecondaryTitle}
        >
          <Ionicons
            name="wifi-outline"
            size={16}
            color="#0D9488"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.secondaryBtnText}>
            {resolvedSecondaryTitle}
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
  /* 64x64px Soft Red Circular Container */
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  /* Title Text (20px, Bold, #0F172A) */
  titleText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  /* Description Text (14px, #64748B) */
  descriptionText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 20,
  },
  /* Primary Action Button (Height: 48px, 12px radius, Background: #0D9488) */
  primaryRetryBtn: {
    height: 48,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 150,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryRetryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  /* Secondary Action Button */
  secondaryBtn: {
    height: 44,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    minWidth: 150,
  },
  secondaryBtnText: {
    color: "#0D9488",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Banner Mode */
  bannerContainer: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },
  bannerIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  bannerExclamationText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
    lineHeight: 17,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  bannerSubtitle: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 2,
  },
  bannerRetryBtn: {
    padding: 8,
    marginLeft: 6,
  },
});
