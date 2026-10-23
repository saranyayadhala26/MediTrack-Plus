/**
 * MediTrack+ Reusable Loading State System
 * Visual Reference: PDF Page 8 (Loading State System)
 *
 * Supports:
 * - Pattern 4: Full-Screen Initial Load (Brand Logo, Spinner, Title, Subtitle)
 * - Pattern 1 & 2: Skeleton Placeholder Loading (via skeleton prop)
 * - Standard Inline / Section Loading
 */

import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { colors, spacing, typography } from "../../constants/theme";
import { SkeletonList } from "./Skeleton";

export interface LoadingStateProps {
  /**
   * Primary loading text. Defaults to "Loading...".
   */
  message?: string;
  /**
   * Secondary description. Defaults to "Please wait a moment." for full-screen mode.
   */
  subtitle?: string;
  /**
   * When true, displays the Pattern 4 Full-Screen Initial Load layout
   * with MediTrack+ brand emblem, spinner, title, and subtitle.
   */
  fullScreen?: boolean;
  /**
   * When true, displays skeleton cards/rows instead of a spinner.
   */
  skeleton?: boolean;
  /**
   * Skeleton layout variant: "cards" (e.g. Medicines) or "rows" (e.g. Activity).
   */
  skeletonVariant?: "cards" | "rows";
  /**
   * Number of skeleton items to show when skeleton=true. Defaults to 4.
   */
  skeletonCount?: number;
  style?: StyleProp<ViewStyle>;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading...",
  subtitle = "Please wait a moment.",
  fullScreen = false,
  skeleton = false,
  skeletonVariant = "cards",
  skeletonCount = 4,
  style,
}) => {
  // If skeleton mode requested, render skeleton list
  if (skeleton) {
    return (
      <View style={[styles.skeletonContainer, style]}>
        <SkeletonList variant={skeletonVariant} count={skeletonCount} />
      </View>
    );
  }

  // Full-Screen Initial Load Layout (PDF Page 8, Pattern 4)
  if (fullScreen) {
    return (
      <View style={[styles.fullScreenContainer, style]}>
        {/* Canonical MediTrack+ Brand Logo */}
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

        {/* Teal Spinner (32px) */}
        <ActivityIndicator
          size="large"
          color="#0D9488"
          style={styles.spinner}
        />

        {/* Title & Subtitle */}
        <Text style={styles.fullScreenTitle}>{message}</Text>
        <Text style={styles.fullScreenSubtitle}>{subtitle}</Text>
      </View>
    );
  }

  // Section / Standard Loading
  return (
    <View style={[styles.standardContainer, style]}>
      <ActivityIndicator size="large" color="#0D9488" />
      <Text style={styles.standardText}>{message}</Text>
      {subtitle && subtitle !== "Please wait a moment." ? (
        <Text style={styles.standardSubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  /* Full-Screen Pattern */
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 36,
  },
  brandIconWrapper: {
    position: "relative",
    marginRight: 10,
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePill: {
    width: 28,
    height: 15,
    borderRadius: 8,
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
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePlusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  brandName: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  brandPlus: {
    color: "#0D9488",
  },
  spinner: {
    marginBottom: 20,
    transform: [{ scale: 1.1 }],
  },
  fullScreenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
    textAlign: "center",
  },
  fullScreenSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },

  /* Standard Inline Container */
  standardContainer: {
    padding: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  standardText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
    marginTop: spacing.md,
    textAlign: "center",
  },
  standardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },

  /* Skeleton Container */
  skeletonContainer: {
    flex: 1,
    paddingTop: spacing.sm,
  },
});
