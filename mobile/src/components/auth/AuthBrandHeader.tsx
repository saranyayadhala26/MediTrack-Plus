/**
 * Reusable Auth Brand Header Component
 * Matches PDF Pages 1-5 MediTrack+ branding:
 * - Optional top-left back arrow
 * - Canonical capsule pill + plus emblem
 * - MediTrack+ typography
 * - Title & descriptive subtitle
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

export interface AuthBrandHeaderProps {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const AuthBrandHeader: React.FC<AuthBrandHeaderProps> = ({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel = "Go back",
  style,
}) => {
  return (
    <View style={[styles.header, style]}>
      {/* Top Navigation Row */}
      {onBack ? (
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Brand Emblem Row */}
      <View style={styles.brandRow}>
        <View style={styles.brandIconWrapper}>
          <View style={styles.capsulePill}>
            <View style={styles.capsuleLeft} />
            <View style={styles.capsuleRight} />
          </View>
          <View style={styles.capsulePlusBadge}>
            <Text style={styles.capsulePlusText}>+</Text>
          </View>
        </View>
        <Text style={styles.brandName}>
          MediTrack<Text style={styles.brandPlus}>+</Text>
        </Text>
      </View>

      {/* Title & Subtitle */}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
    zIndex: 1,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  brandIconWrapper: {
    position: "relative",
    marginRight: 10,
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePill: {
    width: 26,
    height: 14,
    borderRadius: 7,
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "#0D9488",
    overflow: "hidden",
    transform: [{ rotate: "-35deg" }],
  },
  capsuleLeft: {
    flex: 1,
    backgroundColor: "#0D9488",
  },
  capsuleRight: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  capsulePlusBadge: {
    position: "absolute",
    right: -4,
    bottom: -2,
    backgroundColor: "#0D9488",
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePlusText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
  brandName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  brandPlus: {
    color: "#0D9488",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
  },
});
