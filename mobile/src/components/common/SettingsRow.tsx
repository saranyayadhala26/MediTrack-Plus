/**
 * Reusable MediTrack+ Settings & Toggle Row Components
 */

import React from "react";
import {
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, spacing } from "../../constants/theme";

export interface ToggleRowProps {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  iconName,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {iconName ? (
        <View style={styles.iconContainer}>
          <Ionicons name={iconName} size={20} color={colors.primary} />
        </View>
      ) : null}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={value ? colors.primaryDark : colors.surfaceSubtle}
      />
    </View>
  );
};

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  title,
  subtitle,
  value,
  onPress,
  iconName,
  showChevron = true,
  style,
}) => {
  const content = (
    <View style={[styles.container, style]}>
      {iconName ? (
        <View style={styles.iconContainer}>
          <Ionicons name={iconName} size={20} color={colors.primary} />
        </View>
      ) : null}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.description}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightContainer}>
        {value ? <Text style={styles.valueText}>{value}</Text> : null}
        {showChevron && onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  valueText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    fontWeight: "500",
  },
});
