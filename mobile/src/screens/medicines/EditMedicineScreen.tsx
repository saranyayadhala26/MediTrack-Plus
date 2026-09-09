/**
 * Edit Medicine Screen (Phase 4).
 * Pre-populated form enabling patients to modify medicine details,
 * strength, units, schedules, and supply refill alerts.
 */

import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { updateMedicine } from "../../api/medicines";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { DosageUnit, Medicine } from "../../types";

interface EditMedicineScreenProps {
  medicine: Medicine;
  onBack: () => void;
  onSuccess: (updatedMedicine: Medicine) => void;
}

const DOSAGE_UNITS: DosageUnit[] = [
  "mg",
  "ml",
  "tablet",
  "capsule",
  "drop",
  "puff",
  "unit",
  "other",
];

const FREQUENCY_PRESETS = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Every 8 hours",
  "Every 12 hours",
  "As needed",
];

export const EditMedicineScreen: React.FC<EditMedicineScreenProps> = ({
  medicine,
  onBack,
  onSuccess,
}) => {
  const [name, setName] = useState<string>(medicine.name);
  const [dosage, setDosage] = useState<string>(medicine.dosage);
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>(medicine.dosageUnit);
  const [frequency, setFrequency] = useState<string>(medicine.frequency);
  const [instructions, setInstructions] = useState<string>(medicine.instructions || "");
  const [startDate, setStartDate] = useState<string>(medicine.startDate || "");
  const [endDate, setEndDate] = useState<string>(medicine.endDate || "");
  const [inventory, setInventory] = useState<string>(
    medicine.inventory !== undefined && medicine.inventory !== null
      ? String(medicine.inventory)
      : ""
  );
  const [refillThreshold, setRefillThreshold] = useState<string>(
    medicine.refillThreshold !== undefined && medicine.refillThreshold !== null
      ? String(medicine.refillThreshold)
      : ""
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = "Medicine name is required.";
    }

    if (!dosage.trim()) {
      errs.dosage = "Dosage amount is required (e.g., 500).";
    }

    if (!frequency.trim()) {
      errs.frequency = "Frequency is required.";
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

    if (inventory.trim()) {
      const invNum = parseInt(inventory.trim(), 10);
      if (isNaN(invNum) || invNum < 0) {
        errs.inventory = "Supply count must be a non-negative whole number.";
      }
    }

    if (refillThreshold.trim()) {
      const refNum = parseInt(refillThreshold.trim(), 10);
      if (isNaN(refNum) || refNum < 0) {
        errs.refillThreshold = "Refill alert threshold must be a non-negative whole number.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setServerError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        dosage: dosage.trim(),
        dosageUnit,
        frequency: frequency.trim(),
        instructions: instructions.trim() ? instructions.trim() : undefined,
        startDate: startDate.trim() ? startDate.trim() : undefined,
        endDate: endDate.trim() ? endDate.trim() : undefined,
        inventory: inventory.trim() ? parseInt(inventory.trim(), 10) : undefined,
        refillThreshold: refillThreshold.trim()
          ? parseInt(refillThreshold.trim(), 10)
          : undefined,
      };

      const updated = await updateMedicine(medicine.id, payload);
      Alert.alert("Success", `"${updated.name}" details updated successfully.`, [
        {
          text: "OK",
          onPress: () => onSuccess(updated),
        },
      ]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to update medicine. Please try again.";
      setServerError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel editing"
        >
          <Text style={styles.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Medicine</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Medical Safety Banner */}
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
          {/* Medicine Name */}
          <Input
            label="Medicine Name *"
            placeholder="e.g., Amoxicillin, Metformin"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) setErrors({ ...errors, name: "" });
            }}
            error={errors.name}
          />

          {/* Dosage */}
          <View style={styles.dosageContainer}>
            <View style={styles.dosageInputWrapper}>
              <Input
                label="Dosage Strength *"
                placeholder="e.g., 500, 10"
                value={dosage}
                onChangeText={(text) => {
                  setDosage(text);
                  if (errors.dosage) setErrors({ ...errors, dosage: "" });
                }}
                error={errors.dosage}
              />
            </View>
          </View>

          {/* Dosage Unit Selector */}
          <Text style={styles.fieldLabel}>Dosage Unit *</Text>
          <View style={styles.chipsRow}>
            {DOSAGE_UNITS.map((unit) => {
              const isSelected = dosageUnit === unit;
              return (
                <TouchableOpacity
                  key={unit}
                  onPress={() => setDosageUnit(unit)}
                  style={[styles.unitChip, isSelected && styles.unitChipSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select unit ${unit}`}
                >
                  <Text
                    style={[styles.unitChipText, isSelected && styles.unitChipTextSelected]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Frequency Presets */}
          <Text style={styles.fieldLabel}>Frequency *</Text>
          <View style={styles.chipsRow}>
            {FREQUENCY_PRESETS.map((preset) => {
              const isSelected = frequency === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => {
                    setFrequency(preset);
                    if (errors.frequency) setErrors({ ...errors, frequency: "" });
                  }}
                  style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select frequency ${preset}`}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      isSelected && styles.presetChipTextSelected,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input
            label="Custom Frequency"
            placeholder="Or enter custom schedule"
            value={frequency}
            onChangeText={(text) => {
              setFrequency(text);
              if (errors.frequency) setErrors({ ...errors, frequency: "" });
            }}
            error={errors.frequency}
          />

          {/* Instructions */}
          <Input
            label="Intake Instructions (Optional)"
            placeholder="e.g., Take after meals"
            value={instructions}
            onChangeText={setInstructions}
            multiline
            numberOfLines={2}
          />

          {/* Start & End Dates */}
          <View style={styles.dateRow}>
            <View style={styles.halfInput}>
              <Input
                label="Start Date"
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={(text) => {
                  setStartDate(text);
                  if (errors.startDate) setErrors({ ...errors, startDate: "" });
                }}
                error={errors.startDate}
              />
            </View>
            <View style={styles.halfInput}>
              <Input
                label="End Date"
                placeholder="YYYY-MM-DD"
                value={endDate}
                onChangeText={(text) => {
                  setEndDate(text);
                  if (errors.endDate) setErrors({ ...errors, endDate: "" });
                }}
                error={errors.endDate}
              />
            </View>
          </View>

          {/* Supply & Inventory Tracking */}
          <Text style={styles.sectionHeading}>Supply & Refill Tracking</Text>
          <View style={styles.dateRow}>
            <View style={styles.halfInput}>
              <Input
                label="Current Supply"
                placeholder="e.g., 30"
                value={inventory}
                onChangeText={(text) => {
                  setInventory(text);
                  if (errors.inventory) setErrors({ ...errors, inventory: "" });
                }}
                keyboardType="numeric"
                error={errors.inventory}
              />
            </View>
            <View style={styles.halfInput}>
              <Input
                label="Refill Alert At"
                placeholder="e.g., 5"
                value={refillThreshold}
                onChangeText={(text) => {
                  setRefillThreshold(text);
                  if (errors.refillThreshold) setErrors({ ...errors, refillThreshold: "" });
                }}
                keyboardType="numeric"
                error={errors.refillThreshold}
              />
            </View>
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
  dosageContainer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  dosageInputWrapper: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  unitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  unitChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unitChipTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipSelected: {
    backgroundColor: colors.secondaryLight,
    borderColor: colors.secondary,
  },
  presetChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  presetChipTextSelected: {
    color: colors.secondaryDark,
    fontWeight: "700",
  },
  dateRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
  sectionHeading: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.xl,
  },
});
