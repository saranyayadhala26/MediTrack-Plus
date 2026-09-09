/**
 * Reusable Schedule Card Component (Phase 5).
 * Displays scheduled intake time, frequency type, active/inactive toggle,
 * and quick action buttons with senior-friendly high-contrast accessibility.
 */

import React from "react";
import {
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { MedicationSchedule } from "../../types";
import { Card } from "../common/Card";

interface ScheduleCardProps {
  schedule: MedicationSchedule;
  onToggleEnabled: (schedule: MedicationSchedule) => void;
  onEdit?: (schedule: MedicationSchedule) => void;
  onDelete?: (schedule: MedicationSchedule) => void;
  showMedicineName?: boolean;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  schedule,
  onToggleEnabled,
  onEdit,
  onDelete,
  showMedicineName = true,
}) => {
  const getFrequencyLabel = () => {
    if (schedule.frequencyType === "daily") {
      return "Daily reminder";
    }
    if (schedule.frequencyType === "weekly") {
      if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
        return "Weekly";
      }
      const days = schedule.daysOfWeek
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d] || `Day ${d}`)
        .join(", ");
      return `Weekly: ${days}`;
    }
    if (schedule.frequencyType === "custom") {
      if (schedule.dates && schedule.dates.length > 0) {
        return `Custom (${schedule.dates.length} scheduled dates)`;
      }
      return "Custom schedule";
    }
    return schedule.frequencyType;
  };

  return (
    <Card style={[styles.card, !schedule.enabled && styles.cardDisabled]}>
      {/* Card Header: Medicine Name & Active Toggle */}
      <View style={styles.cardHeader}>
        <View style={styles.titleArea}>
          {showMedicineName && schedule.medicineName ? (
            <Text style={styles.medicineName} numberOfLines={1}>
              {schedule.medicineName}{" "}
              {schedule.dosage && (
                <Text style={styles.dosageText}>
                  ({schedule.dosage} {schedule.dosageUnit || ""})
                </Text>
              )}
            </Text>
          ) : null}
          <Text style={[styles.timeText, !schedule.enabled && styles.timeTextDisabled]}>
            ⏰ {schedule.time}
          </Text>
        </View>

        {/* Enable / Disable Toggle */}
        <View style={styles.toggleContainer}>
          <Text
            style={[
              styles.statusText,
              schedule.enabled ? styles.statusActive : styles.statusInactive,
            ]}
          >
            {schedule.enabled ? "Active" : "Paused"}
          </Text>
          <Switch
            value={schedule.enabled}
            onValueChange={() => onToggleEnabled(schedule)}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={schedule.enabled ? colors.primary : colors.textMuted}
            accessibilityLabel={`Toggle schedule ${schedule.time}`}
          />
        </View>
      </View>

      {/* Frequency & Details */}
      <View style={styles.detailsRow}>
        <View
          style={[
            styles.frequencyBadge,
            schedule.enabled ? styles.frequencyBadgeActive : styles.frequencyBadgeDisabled,
          ]}
        >
          <Text
            style={[
              styles.frequencyText,
              schedule.enabled ? styles.frequencyTextActive : styles.frequencyTextDisabled,
            ]}
          >
            {getFrequencyLabel()}
          </Text>
        </View>

        {schedule.startDate && (
          <Text style={styles.durationText}>
            {schedule.startDate}
            {schedule.endDate ? ` → ${schedule.endDate}` : " onwards"}
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        {onEdit && (
          <TouchableOpacity
            onPress={() => onEdit(schedule)}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Edit schedule ${schedule.time}`}
          >
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
        )}

        {onDelete && (
          <TouchableOpacity
            onPress={() => onDelete(schedule)}
            style={[styles.actionButton, styles.deleteButton]}
            accessibilityRole="button"
            accessibilityLabel={`Delete schedule ${schedule.time}`}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  cardDisabled: {
    backgroundColor: colors.surfaceSubtle,
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleArea: {
    flex: 1,
  },
  medicineName: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 2,
  },
  dosageText: {
    fontWeight: "400",
    color: colors.textSecondary,
  },
  timeText: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: "800",
  },
  timeTextDisabled: {
    color: colors.textMuted,
  },
  toggleContainer: {
    alignItems: "center",
    marginLeft: spacing.md,
  },
  statusText: {
    ...typography.small,
    fontWeight: "700",
    marginBottom: 2,
  },
  statusActive: {
    color: colors.taken,
  },
  statusInactive: {
    color: colors.textMuted,
  },
  detailsRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  frequencyBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  frequencyBadgeActive: {
    backgroundColor: colors.primaryLight,
  },
  frequencyBadgeDisabled: {
    backgroundColor: colors.borderLight,
  },
  frequencyText: {
    ...typography.caption,
    fontWeight: "600",
  },
  frequencyTextActive: {
    color: colors.primaryDark,
  },
  frequencyTextDisabled: {
    color: colors.textMuted,
  },
  durationText: {
    ...typography.small,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 36,
    justifyContent: "center",
  },
  actionButtonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: colors.skippedLight,
  },
  deleteButtonText: {
    ...typography.caption,
    color: colors.skipped,
    fontWeight: "600",
  },
});
