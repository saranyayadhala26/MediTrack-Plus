/**
 * Edit Medication Schedule Screen (Phase 5).
 * Prepopulated form enabling patients to adjust intake times, days of week,
 * schedule duration, and active/paused reminder status.
 */

import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { updateSchedule } from "../../api/schedules";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { MedicationSchedule, ScheduleFrequency } from "../../types";

interface EditScheduleScreenProps {
  schedule: MedicationSchedule;
  onBack: () => void;
  onSuccess: (updatedSchedule: MedicationSchedule) => void;
}

const TIME_PRESETS = [
  { label: "Morning (08:00)", time: "08:00" },
  { label: "Noon (12:30)", time: "12:30" },
  { label: "Evening (18:00)", time: "18:00" },
  { label: "Bedtime (21:00)", time: "21:00" },
];

const WEEKDAYS = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

export const EditScheduleScreen: React.FC<EditScheduleScreenProps> = ({
  schedule,
  onBack,
  onSuccess,
}) => {
  const [time, setTime] = useState<string>(schedule.time);
  const [frequencyType, setFrequencyType] = useState<ScheduleFrequency>(schedule.frequencyType);
  const [selectedDays, setSelectedDays] = useState<number[]>(schedule.daysOfWeek || []);
  const [customDates, setCustomDates] = useState<string>(
    schedule.dates ? schedule.dates.join(", ") : ""
  );
  const [startDate, setStartDate] = useState<string>(schedule.startDate || "");
  const [endDate, setEndDate] = useState<string>(schedule.endDate || "");
  const [enabled, setEnabled] = useState<boolean>(schedule.enabled);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
    if (errors.days) setErrors({ ...errors, days: "" });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!time.trim() || !timeRegex.test(time.trim())) {
      errs.time = "Time must be in 24-hour HH:MM format (00:00 to 23:59).";
    }

    if (frequencyType === "weekly") {
      if (!selectedDays || selectedDays.length === 0) {
        errs.days = "Please select at least one day of the week.";
      }
    }

    if (frequencyType === "custom") {
      const datesList = customDates
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      if (datesList.length === 0) {
        errs.customDates = "Please enter at least one date (YYYY-MM-DD).";
      } else {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        for (const d of datesList) {
          if (!dateRegex.test(d)) {
            errs.customDates = `Date '${d}' is not in valid YYYY-MM-DD format.`;
            break;
          }
        }
      }
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate.trim() && !dateRegex.test(startDate.trim())) {
      errs.startDate = "Start date must be in YYYY-MM-DD format.";
    }
    if (endDate.trim() && !dateRegex.test(endDate.trim())) {
      errs.endDate = "End date must be in YYYY-MM-DD format.";
    }
    if (
      startDate.trim() &&
      endDate.trim() &&
      dateRegex.test(startDate.trim()) &&
      dateRegex.test(endDate.trim()) &&
      endDate.trim() < startDate.trim()
    ) {
      errs.endDate = "End date cannot be earlier than start date.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setServerError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const parsedDates =
        frequencyType === "custom"
          ? customDates
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : undefined;

      const payload = {
        time: time.trim(),
        frequencyType,
        daysOfWeek: frequencyType === "weekly" ? selectedDays : undefined,
        dates: parsedDates,
        startDate: startDate.trim() ? startDate.trim() : undefined,
        endDate: endDate.trim() ? endDate.trim() : undefined,
        enabled,
      };

      const updated = await updateSchedule(schedule.id, payload);
      Alert.alert("Schedule Updated", `Reminder updated to ${updated.time}.`, [
        {
          text: "OK",
          onPress: () => onSuccess(updated),
        },
      ]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to update schedule. Please check the entered times.";
      setServerError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel schedule editing"
        >
          <Text style={styles.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Schedule</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Medical Safety Notice */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
          <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
        </View>

        {serverError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{serverError}</Text>
          </View>
        )}

        <Card style={styles.formCard}>
          {/* Medicine Info */}
          <Text style={styles.fieldLabel}>Medication</Text>
          <View style={styles.selectedMedBox}>
            <Text style={styles.selectedMedName}>
              {schedule.medicineName || "Prescribed Medicine"}
            </Text>
            {schedule.dosage && (
              <Text style={styles.selectedMedDetails}>
                {schedule.dosage} {schedule.dosageUnit || ""}
              </Text>
            )}
          </View>

          {/* Time Picker & Presets */}
          <Text style={styles.fieldLabel}>Scheduled Time (24-Hour HH:MM) *</Text>
          <View style={styles.chipsRow}>
            {TIME_PRESETS.map((p) => {
              const isSelected = time === p.time;
              return (
                <TouchableOpacity
                  key={p.time}
                  onPress={() => {
                    setTime(p.time);
                    if (errors.time) setErrors({ ...errors, time: "" });
                  }}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input
            label="Exact Time"
            placeholder="e.g., 08:30"
            value={time}
            onChangeText={(t) => {
              setTime(t);
              if (errors.time) setErrors({ ...errors, time: "" });
            }}
            error={errors.time}
          />

          {/* Frequency Type Selector */}
          <Text style={styles.fieldLabel}>Schedule Frequency *</Text>
          <View style={styles.freqTabsRow}>
            {(["daily", "weekly", "custom"] as ScheduleFrequency[]).map((f) => {
              const isSelected = frequencyType === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFrequencyType(f)}
                  style={[styles.freqTab, isSelected && styles.freqTabSelected]}
                >
                  <Text
                    style={[styles.freqTabText, isSelected && styles.freqTabTextSelected]}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Weekly Days Selector */}
          {frequencyType === "weekly" && (
            <View style={styles.weeklySection}>
              <Text style={styles.fieldLabel}>Select Intake Days *</Text>
              <View style={styles.daysRow}>
                {WEEKDAYS.map(({ day, label }) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      onPress={() => toggleDay(day)}
                      style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}
                    >
                      <Text
                        style={[
                          styles.dayCircleText,
                          isSelected && styles.dayCircleTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.days && <Text style={styles.errorText}>{errors.days}</Text>}
            </View>
          )}

          {/* Custom Dates Input */}
          {frequencyType === "custom" && (
            <View style={styles.customSection}>
              <Input
                label="Custom Dates (Comma-separated YYYY-MM-DD) *"
                placeholder="e.g., 2026-09-10, 2026-09-15"
                value={customDates}
                onChangeText={(t) => {
                  setCustomDates(t);
                  if (errors.customDates) setErrors({ ...errors, customDates: "" });
                }}
                error={errors.customDates}
              />
            </View>
          )}

          {/* Start & End Dates */}
          <View style={styles.dateRow}>
            <View style={styles.halfInput}>
              <Input
                label="Schedule Start"
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={(t) => {
                  setStartDate(t);
                  if (errors.startDate) setErrors({ ...errors, startDate: "" });
                }}
                error={errors.startDate}
              />
            </View>
            <View style={styles.halfInput}>
              <Input
                label="Schedule End"
                placeholder="YYYY-MM-DD"
                value={endDate}
                onChangeText={(t) => {
                  setEndDate(t);
                  if (errors.endDate) setErrors({ ...errors, endDate: "" });
                }}
                error={errors.endDate}
              />
            </View>
          </View>

          {/* Active Status Toggle */}
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Active Schedule</Text>
              <Text style={styles.toggleSubLabel}>
                {enabled ? "Schedule is active." : "Schedule is paused."}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={enabled ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Save Changes Button */}
          <Button
            title={isSubmitting ? "Updating..." : "Save Changes"}
            onPress={handleSubmit}
            loading={isSubmitting}
            variant="primary"
            style={styles.submitButton}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  backText: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 60,
  },
  scrollContent: {
    padding: spacing.md,
  },
  disclaimerBox: {
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.error,
    marginBottom: 2,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: colors.skippedLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.skipped,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.skipped,
    fontWeight: "600",
  },
  formCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  fieldLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  selectedMedBox: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  selectedMedName: {
    ...typography.h3,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  selectedMedDetails: {
    ...typography.caption,
    color: colors.primaryDark,
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.secondaryLight,
    borderColor: colors.secondary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.secondaryDark,
    fontWeight: "700",
  },
  freqTabsRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  freqTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  freqTabSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  freqTabText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  freqTabTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  weeklySection: {
    marginBottom: spacing.md,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  dayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  dayCircleText: {
    ...typography.small,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  dayCircleTextSelected: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  customSection: {
    marginBottom: spacing.md,
  },
  dateRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
  },
  toggleLabel: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  toggleSubLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
});
