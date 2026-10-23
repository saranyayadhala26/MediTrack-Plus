/**
 * Reusable MediTrack+ Filter Tabs Component
 * Standardized horizontal segmented filter controls.
 */

import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { colors, borderRadius, spacing } from "../../constants/theme";

export interface FilterTabsProps<T extends string = string> {
  tabs: T[];
  selectedTab: T;
  onSelectTab: (tab: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function FilterTabs<T extends string = string>({
  tabs,
  selectedTab,
  onSelectTab,
  style,
}: FilterTabsProps<T>) {
  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                isSelected ? styles.tabSelected : styles.tabUnselected,
              ]}
              onPress={() => onSelectTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${tab} filter`}
            >
              <Text
                style={[
                  styles.tabText,
                  isSelected ? styles.tabTextSelected : styles.tabTextUnselected,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    flexDirection: "row",
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 3,
    borderRadius: borderRadius.full,
    minHeight: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  tabSelected: {
    backgroundColor: colors.primary,
  },
  tabUnselected: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextSelected: {
    color: colors.textInverse,
  },
  tabTextUnselected: {
    color: colors.textSecondary,
  },
});
