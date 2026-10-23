/**
 * MediTrack+ Reusable Inline Error Component
 * Visual Reference: PDF Page 7 (Error State Component System)
 *
 * Compact horizontal error banner/alert used across screens for inline feedback.
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

export interface InlineErrorProps {
  /**
   * Primary error title or message.
   */
  title?: string;
  /**
   * Optional secondary subtitle / detail message.
   */
  subtitle?: string;
  /**
   * Callback invoked when user taps the dismiss button.
   */
  onDismiss?: () => void;
  /**
   * Optional retry callback.
   */
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  title = "Something went wrong",
  subtitle,
  onDismiss,
  onRetry,
  style,
}) => {
  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      {/* Red circular icon badge (22x22px with white exclamation) */}
      <View style={styles.iconCircle}>
        <Text style={styles.exclamationText}>!</Text>
      </View>

      {/* Message Text Column */}
      <View style={styles.textColumn}>
        <Text style={styles.titleText}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitleText}>{subtitle}</Text>
        ) : null}
      </View>

      {/* Optional Retry Button */}
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Ionicons name="refresh-outline" size={16} color="#DC2626" />
        </TouchableOpacity>
      ) : null}

      {/* Optional Dismiss Button */}
      {onDismiss ? (
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.actionBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        >
          <Ionicons name="close" size={18} color="#DC2626" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
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
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  exclamationText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 15,
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
    color: "#DC2626",
    marginTop: 2,
    lineHeight: 16,
  },
  actionBtn: {
    padding: 6,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
