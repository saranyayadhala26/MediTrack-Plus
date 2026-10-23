/**
 * Reusable MediTrack+ App Header Component
 * Provides consistent top branding, title, optional back button, and optional right actions.
 */

import React from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, spacing, borderRadius } from "../../constants/theme";

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBrand = true,
  onBack,
  rightAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Top Bar Row */}
      <View style={styles.topRow}>
        <View style={styles.leftContainer}>
          {onBack ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : showBrand ? (
            <View style={styles.brandContainer}>
              <Text style={styles.brandTitle}>
                <Text style={styles.brandTeal}>MediTrack</Text>
                <Text style={styles.brandPlus}>+</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {rightAction ? <View style={styles.rightContainer}>{rightAction}</View> : null}
      </View>

      {/* Screen Title & Subtitle */}
      {title ? (
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>{title}</Text>
          {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + spacing.sm : spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leftContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: spacing.sm,
    padding: spacing.xs,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  brandTeal: {
    color: colors.primary,
  },
  brandPlus: {
    color: colors.primary,
  },
  titleContainer: {
    marginTop: spacing.sm,
  },
  titleText: {
    ...typography.screenTitle,
  },
  subtitleText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
