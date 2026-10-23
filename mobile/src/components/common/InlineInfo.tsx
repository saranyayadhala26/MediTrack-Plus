/**
 * MediTrack+ Reusable Inline Info & Warning Component
 * Visual Reference: PDF Page 6 & 7 (Inline Feedback Systems)
 *
 * Supports compact horizontal info (teal/blue) and warning (amber) messages.
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

export interface InlineInfoProps {
  /**
   * Mode: "info" (teal/blue) | "warning" (amber)
   */
  mode?: "info" | "warning";
  /**
   * Primary title or message.
   */
  title: string;
  /**
   * Optional secondary subtitle.
   */
  subtitle?: string;
  /**
   * Callback invoked when user taps the dismiss button.
   */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const InlineInfo: React.FC<InlineInfoProps> = ({
  mode = "info",
  title,
  subtitle,
  onDismiss,
  style,
}) => {
  const isWarning = mode === "warning";

  return (
    <View
      style={[
        styles.container,
        isWarning ? styles.warningContainer : styles.infoContainer,
        style,
      ]}
      accessibilityRole="alert"
    >
      {/* Icon Badge */}
      <View
        style={[
          styles.iconCircle,
          isWarning ? styles.warningIconCircle : styles.infoIconCircle,
        ]}
      >
        <Ionicons
          name={isWarning ? "warning-outline" : "information"}
          size={14}
          color="#FFFFFF"
        />
      </View>

      {/* Message Text Column */}
      <View style={styles.textColumn}>
        <Text style={styles.titleText}>{title}</Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitleText,
              isWarning ? styles.warningSubtitle : styles.infoSubtitle,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Optional Dismiss Button */}
      {onDismiss ? (
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.actionBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
        >
          <Ionicons
            name="close"
            size={18}
            color={isWarning ? "#D97706" : "#0D9488"}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
    width: "100%",
  },
  infoContainer: {
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
  },
  warningContainer: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  infoIconCircle: {
    backgroundColor: "#0D9488",
  },
  warningIconCircle: {
    backgroundColor: "#D97706",
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
    marginTop: 2,
    lineHeight: 16,
  },
  infoSubtitle: {
    color: "#0F766E",
  },
  warningSubtitle: {
    color: "#B45309",
  },
  actionBtn: {
    padding: 6,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
