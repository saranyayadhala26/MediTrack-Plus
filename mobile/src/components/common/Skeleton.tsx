/**
 * MediTrack+ Reusable Skeleton Loading Components
 * Visual Reference: PDF Page 8 (Loading State System)
 *
 * Provides soft, calm muted placeholder blocks for cards, lists, avatars,
 * and text rows while content is being fetched.
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { borderRadius, colors, spacing } from "../../constants/theme";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 16,
  borderRadius: radius = 8,
  style,
}) => {
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.skeletonBox,
        {
          width: width as any,
          height: height as any,
          borderRadius: radius,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
};

export interface SkeletonCardProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Standard Card Skeleton (PDF Page 8, Pattern 1 - Page Loading Skeleton)
 * Used in Medicines list, Caregivers list, etc.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ style }) => {
  return (
    <View style={[styles.card, style]}>
      {/* Icon Placeholder (48x48 rounded) */}
      <Skeleton width={48} height={48} borderRadius={12} style={styles.cardIcon} />

      {/* Text Rows */}
      <View style={styles.cardTextCol}>
        <Skeleton width="65%" height={16} borderRadius={6} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={12} borderRadius={4} />
      </View>

      {/* Right Action/Pill Placeholder */}
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
  );
};

export interface SkeletonRowProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Activity / History Row Skeleton (PDF Page 8, Pattern 2 - Content/List Loading)
 */
export const SkeletonRow: React.FC<SkeletonRowProps> = ({ style }) => {
  return (
    <View style={[styles.rowContainer, style]}>
      <Skeleton width={40} height={40} borderRadius={20} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="70%" height={15} borderRadius={6} style={{ marginBottom: 6 }} />
        <Skeleton width="45%" height={11} borderRadius={4} />
      </View>
      <Skeleton width={50} height={18} borderRadius={9} />
    </View>
  );
};

export interface SkeletonListProps {
  count?: number;
  variant?: "cards" | "rows";
  style?: StyleProp<ViewStyle>;
}

/**
 * Multi-item Skeleton Placeholder List
 */
export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 4,
  variant = "cards",
  style,
}) => {
  const items = Array.from({ length: count });

  return (
    <View style={[styles.listContainer, style]}>
      {items.map((_, index) =>
        variant === "cards" ? (
          <SkeletonCard key={index} style={{ marginBottom: spacing.md }} />
        ) : (
          <SkeletonRow key={index} style={{ marginBottom: spacing.md }} />
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonBox: {
    backgroundColor: "#E2E8F0",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    marginRight: 14,
  },
  cardTextCol: {
    flex: 1,
  },
  rowContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
