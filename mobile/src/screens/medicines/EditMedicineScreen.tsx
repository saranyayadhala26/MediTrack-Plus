/**
 * Edit Medicine Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 30 of ui.pdf).
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { deleteMedicine, updateMedicine } from "../../api/medicines";
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  updateSchedule,
} from "../../api/schedules";
import { ConfirmationModal } from "../../components/common/ConfirmationModal";
import { InlineError } from "../../components/common";
import { colors, spacing } from "../../constants/theme";
import { notificationService } from "../../services/notificationService";
import { DosageUnit, MedicationSchedule, Medicine } from "../../types";

interface EditMedicineScreenProps {
  medicine: Medicine;
  onBack: () => void;
  onSuccess: (updatedMedicine: Medicine) => void;
  onDeleted?: () => void;
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

const MEDICINE_TYPES = [
  "Tablet",
  "Capsule",
  "Liquid",
  "Drops",
  "Inhaler",
  "Injection",
  "Other",
];

const FREQUENCY_OPTIONS = [
  "Every day",
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Every 8 hours",
  "Every 12 hours",
  "As needed",
];

const PRESET_TIMES = [
  { label: "08:00 AM", value: "08:00" },
  { label: "09:00 AM", value: "09:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "02:00 PM", value: "14:00" },
  { label: "06:00 PM", value: "18:00" },
  { label: "08:00 PM", value: "20:00" },
  { label: "10:00 PM", value: "22:00" },
];

export const EditMedicineScreen: React.FC<EditMedicineScreenProps> = ({
  medicine,
  onBack,
  onSuccess,
  onDeleted,
}) => {
  // Form state
  const [name, setName] = useState<string>(medicine.name);
  const [dosage, setDosage] = useState<string>(medicine.dosage);
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>(medicine.dosageUnit);
  const [medicineType, setMedicineType] = useState<string>(
    medicine.dosageUnit === "capsule" ? "Capsule" : "Tablet"
  );
  const [instructions, setInstructions] = useState<string>(medicine.instructions || "");
  const [frequency, setFrequency] = useState<string>(medicine.frequency || "Every day");
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

  // Schedules & Reminders
  const [existingSchedules, setExistingSchedules] = useState<MedicationSchedule[]>([]);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);

  // Modals & Pickers
  const [showUnitModal, setShowUnitModal] = useState<boolean>(false);
  const [showTypeModal, setShowTypeModal] = useState<boolean>(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState<boolean>(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState<boolean>(false);
  const [customTimeInput, setCustomTimeInput] = useState<string>("");
  const [dateModalMode, setDateModalMode] = useState<"start" | "end" | null>(null);
  const [dateModalValue, setDateModalValue] = useState<string>("");
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Status
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load existing schedules for this medicine
  useEffect(() => {
    getSchedules(medicine.id)
      .then((res) => {
        const items = res.items || [];
        setExistingSchedules(items);
        if (items.length > 0) {
          const times = items.map((s) => s.time).filter(Boolean);
          setScheduleTimes(times);
          setReminderEnabled(items.some((s) => s.enabled));
        } else {
          setScheduleTimes(["09:00", "14:00", "20:00"]);
        }
      })
      .catch(() => {
        setScheduleTimes(["09:00", "14:00", "20:00"]);
      });
  }, [medicine.id]);

  // Helpers
  const formatDisplayTime = (timeStr: string): string => {
    if (!timeStr) return "";
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    const hourStr = String(hour12).padStart(2, "0");
    const minStr = String(m).padStart(2, "0");
    return `${hourStr}:${minStr} ${ampm}`;
  };

  const formatDisplayDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      const mIdx = parseInt(m, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        return `${d} ${months[mIdx]} ${y}`;
      }
    }
    return dateStr;
  };

  const formatFormName = (unit?: string): string => {
    if (!unit) return "Tablet";
    const lower = unit.toLowerCase();
    if (lower === "tablet" || lower === "tablets") return "Tablet";
    if (lower === "capsule" || lower === "capsules") return "Capsule";
    if (lower === "liquid" || lower === "ml") return "Liquid";
    if (lower === "drop" || lower === "drops") return "Drops";
    if (lower === "puff" || lower === "inhaler") return "Inhaler";
    return unit.charAt(0).toUpperCase() + unit.slice(1);
  };

  // Schedule times management
  const handleRemoveTime = (indexToRemove: number) => {
    setScheduleTimes((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddTime = (timeValue: string) => {
    if (!timeValue) return;
    if (!scheduleTimes.includes(timeValue)) {
      setScheduleTimes((prev) => [...prev, timeValue].sort());
    }
    setShowAddTimeModal(false);
    setCustomTimeInput("");
  };

  // Date picker modal
  const openDatePicker = (mode: "start" | "end") => {
    setDateModalMode(mode);
    setDateModalValue(mode === "start" ? startDate : endDate);
  };

  const handleApplyDate = () => {
    if (dateModalMode === "start") {
      setStartDate(dateModalValue.trim());
      if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: "" }));
    } else if (dateModalMode === "end") {
      setEndDate(dateModalValue.trim());
      if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: "" }));
    }
    setDateModalMode(null);
  };

  // Form validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = "Medicine name is required.";
    }

    if (!dosage.trim()) {
      errs.dosage = "Dosage is required (e.g., 500).";
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
        errs.inventory = "Supply count must be a non-negative number.";
      }
    }

    if (refillThreshold.trim()) {
      const refNum = parseInt(refillThreshold.trim(), 10);
      if (isNaN(refNum) || refNum < 0) {
        errs.refillThreshold = "Refill alert threshold must be a non-negative number.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit changes
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

      // Sync schedule times
      for (const s of existingSchedules) {
        if (!scheduleTimes.includes(s.time)) {
          deleteSchedule(s.id).catch(() => {});
          notificationService.cancelScheduleReminder(s.id).catch(() => {});
        } else if (s.enabled !== reminderEnabled) {
          updateSchedule(s.id, { enabled: reminderEnabled }).catch(() => {});
        }
      }

      const existingTimeStrings = existingSchedules.map((s) => s.time);
      for (const t of scheduleTimes) {
        if (!existingTimeStrings.includes(t)) {
          createSchedule({
            medicineId: medicine.id,
            time: t,
            frequencyType: "daily",
            enabled: reminderEnabled,
          })
            .then((newSched) => {
              notificationService.syncScheduleReminder(newSched).catch(() => {});
            })
            .catch(() => {});
        }
      }

      await notificationService.autoSync({ force: true }).catch(() => {});

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

  // Delete medicine
  const performDelete = async () => {
    setShowDeleteModal(false);
    setIsDeleting(true);
    setServerError(null);
    try {
      await deleteMedicine(medicine.id);
      for (const s of existingSchedules) {
        notificationService.cancelScheduleReminder(s.id).catch(() => {});
      }
      await notificationService.autoSync({ force: true }).catch(() => {});
      Alert.alert(
        "Deleted",
        `"${medicine.name}" has been removed from your list.`,
        [{ text: "OK", onPress: () => (onDeleted ? onDeleted() : onBack()) }]
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to delete medicine. Please try again.";
      setServerError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel editing"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Edit Medicine</Text>
          <Text style={styles.headerSubtitle}>Update your medicine details.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error Banner */}
        {serverError ? (
          <InlineError
            title="Couldn't save medicine"
            subtitle={serverError}
            onDismiss={() => setServerError(null)}
            onRetry={handleSubmit}
          />
        ) : null}

        {/* 2. Medicine Summary Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconBox}>
            <MaterialCommunityIcons name="pill" size={28} color={colors.primary} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>
              {name || medicine.name}
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {dosage || medicine.dosage} {dosageUnit}  •  {formatFormName(dosageUnit)}
            </Text>
          </View>
        </View>

        {/* 3. Section: Medicine information */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Medicine information</Text>

          {/* Medicine Name */}
          <Text style={styles.fieldLabel}>
            Medicine name <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View
            style={[
              styles.inputBox,
              errors.name ? styles.inputBoxError : null,
            ]}
          >
            <MaterialCommunityIcons
              name="pill"
              size={18}
              color={colors.textSecondary}
              style={styles.fieldIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Paracetamol"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) setErrors({ ...errors, name: "" });
              }}
            />
          </View>
          {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

          {/* Dosage & Medicine Type Row */}
          <View style={styles.twoColRow}>
            {/* Left: Dosage */}
            <View style={styles.colLeft}>
              <Text style={styles.fieldLabel}>
                Dosage <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <View
                style={[
                  styles.combinedInputBox,
                  errors.dosage ? styles.inputBoxError : null,
                ]}
              >
                <TextInput
                  style={styles.combinedTextInput}
                  placeholder="500"
                  placeholderTextColor={colors.textMuted}
                  value={dosage}
                  onChangeText={(text) => {
                    setDosage(text);
                    if (errors.dosage) setErrors({ ...errors, dosage: "" });
                  }}
                  keyboardType="numeric"
                />
                <View style={styles.verticalDivider} />
                <TouchableOpacity
                  style={styles.combinedSelectBtn}
                  onPress={() => setShowUnitModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Select dosage unit"
                >
                  <Text style={styles.selectBtnText}>{dosageUnit}</Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSecondary}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              </View>
              {errors.dosage ? <Text style={styles.errorText}>{errors.dosage}</Text> : null}
            </View>

            {/* Right: Medicine type */}
            <View style={styles.colRight}>
              <Text style={styles.fieldLabel}>
                Medicine type <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.selectBox}
                onPress={() => setShowTypeModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Select medicine type"
              >
                <MaterialCommunityIcons
                  name="pill"
                  size={18}
                  color={colors.textSecondary}
                  style={styles.fieldIcon}
                />
                <Text style={styles.selectBoxText} numberOfLines={1}>
                  {medicineType}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Instructions (optional) */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
            Instructions <Text style={styles.optionalText}>(optional)</Text>
          </Text>
          <View style={styles.inputBox}>
            <Ionicons
              name="menu-outline"
              size={20}
              color={colors.textSecondary}
              style={styles.fieldIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Take after food"
              placeholderTextColor={colors.textMuted}
              value={instructions}
              onChangeText={setInstructions}
            />
          </View>
        </View>

        {/* 4. Section: When should you take it? */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>When should you take it?</Text>

          {/* Frequency */}
          <Text style={styles.fieldLabel}>
            Frequency <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.selectBox}
            onPress={() => setShowFrequencyModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Select frequency"
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={colors.textPrimary}
              style={styles.fieldIcon}
            />
            <Text style={styles.selectBoxText}>{frequency}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {errors.frequency ? <Text style={styles.errorText}>{errors.frequency}</Text> : null}

          {/* Times */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            Times <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={styles.timeChipsWrap}>
            {scheduleTimes.map((timeStr, idx) => (
              <View key={`${timeStr}-${idx}`} style={styles.timeChip}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.timeChipText}>{formatDisplayTime(timeStr)}</Text>
                <TouchableOpacity
                  onPress={() => handleRemoveTime(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove time ${formatDisplayTime(timeStr)}`}
                >
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Add another time */}
          <TouchableOpacity
            style={styles.addTimeBtn}
            onPress={() => setShowAddTimeModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add another time"
          >
            <Ionicons
              name="add"
              size={18}
              color={colors.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.addTimeBtnText}>Add another time</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Section: Treatment duration */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Treatment duration</Text>
          <View style={styles.twoColRow}>
            {/* Start Date */}
            <View style={styles.colLeft}>
              <Text style={styles.fieldLabel}>
                Start date <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.selectBox,
                  errors.startDate ? styles.inputBoxError : null,
                ]}
                onPress={() => openDatePicker("start")}
                accessibilityRole="button"
                accessibilityLabel="Set start date"
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.textPrimary}
                  style={styles.fieldIcon}
                />
                <Text style={styles.selectBoxText} numberOfLines={1}>
                  {startDate ? formatDisplayDate(startDate) : "Select date"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {errors.startDate ? (
                <Text style={styles.errorText}>{errors.startDate}</Text>
              ) : null}
            </View>

            {/* End Date */}
            <View style={styles.colRight}>
              <Text style={styles.fieldLabel}>
                End date <Text style={styles.optionalText}>(optional)</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.selectBox,
                  errors.endDate ? styles.inputBoxError : null,
                ]}
                onPress={() => openDatePicker("end")}
                accessibilityRole="button"
                accessibilityLabel="Set end date"
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.textPrimary}
                  style={styles.fieldIcon}
                />
                <Text style={styles.selectBoxText} numberOfLines={1}>
                  {endDate ? formatDisplayDate(endDate) : "Ongoing"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {errors.endDate ? (
                <Text style={styles.errorText}>{errors.endDate}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* 6. Section: Medicine supply */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Medicine supply</Text>
          <View style={styles.supplyRow}>
            {/* Quantity */}
            <View style={styles.supplyLeftCol}>
              <Text style={styles.fieldLabel}>
                Quantity <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <View
                style={[
                  styles.combinedInputBox,
                  errors.inventory ? styles.inputBoxError : null,
                ]}
              >
                <TextInput
                  style={styles.combinedTextInput}
                  placeholder="18"
                  placeholderTextColor={colors.textMuted}
                  value={inventory}
                  onChangeText={(text) => {
                    setInventory(text);
                    if (errors.inventory) setErrors({ ...errors, inventory: "" });
                  }}
                  keyboardType="numeric"
                />
                <View style={styles.verticalDivider} />
                <TouchableOpacity
                  style={styles.combinedSelectBtn}
                  onPress={() => setShowUnitModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Select supply unit"
                >
                  <Text style={styles.selectBtnText}>
                    {dosageUnit === "mg" || dosageUnit === "ml"
                      ? dosageUnit
                      : `${dosageUnit}s`}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSecondary}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              </View>
              {errors.inventory ? (
                <Text style={styles.errorText}>{errors.inventory}</Text>
              ) : null}
            </View>

            {/* Info Box */}
            <View style={styles.supplyRightCol}>
              <View style={styles.supplyInfoBox}>
                <Ionicons
                  name="cube-outline"
                  size={24}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.supplyInfoText}>
                  Keep this updated to track your remaining medicine.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 7. Section: Medication reminder */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Medication reminder</Text>
          <View style={styles.reminderRow}>
            <Ionicons
              name="notifications-outline"
              size={24}
              color={colors.primary}
              style={{ marginRight: 12 }}
            />
            <View style={styles.reminderTextCol}>
              <Text style={styles.reminderTitle}>Medication reminders</Text>
              <Text style={styles.reminderSubtitle}>
                Receive a reminder when it's time to take this medicine.
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={setReminderEnabled}
              trackColor={{ false: "#CBD5E1", true: colors.primary }}
              thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
            />
          </View>
        </View>

        {/* 8 & 9. Actions */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.saveButton, isSubmitting && { opacity: 0.85 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
          >
            {isSubmitting ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.saveButtonText}>Updating...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setShowDeleteModal(true)}
            disabled={isDeleting || isSubmitting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete Medicine"
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.danger}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.deleteButtonText}>
              {isDeleting ? "Deleting..." : "Delete Medicine"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL: Dosage Unit Picker */}
      <Modal
        visible={showUnitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnitModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowUnitModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalDialogCard}>
                <Text style={styles.modalDialogTitle}>Select Dosage Unit</Text>
                <View style={styles.modalOptionsList}>
                  {DOSAGE_UNITS.map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.modalOptionItem,
                        dosageUnit === unit && styles.modalOptionItemSelected,
                      ]}
                      onPress={() => {
                        setDosageUnit(unit);
                        setShowUnitModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          dosageUnit === unit && styles.modalOptionTextSelected,
                        ]}
                      >
                        {unit}
                      </Text>
                      {dosageUnit === unit ? (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Medicine Type Picker */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowTypeModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalDialogCard}>
                <Text style={styles.modalDialogTitle}>Select Medicine Type</Text>
                <View style={styles.modalOptionsList}>
                  {MEDICINE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.modalOptionItem,
                        medicineType === type && styles.modalOptionItemSelected,
                      ]}
                      onPress={() => {
                        setMedicineType(type);
                        if (type === "Tablet") setDosageUnit("tablet");
                        else if (type === "Capsule") setDosageUnit("capsule");
                        else if (type === "Liquid") setDosageUnit("ml");
                        else if (type === "Drops") setDosageUnit("drop");
                        setShowTypeModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          medicineType === type && styles.modalOptionTextSelected,
                        ]}
                      >
                        {type}
                      </Text>
                      {medicineType === type ? (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Frequency Picker */}
      <Modal
        visible={showFrequencyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFrequencyModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowFrequencyModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalDialogCard}>
                <Text style={styles.modalDialogTitle}>Select Frequency</Text>
                <View style={styles.modalOptionsList}>
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <TouchableOpacity
                      key={freq}
                      style={[
                        styles.modalOptionItem,
                        frequency === freq && styles.modalOptionItemSelected,
                      ]}
                      onPress={() => {
                        setFrequency(freq);
                        if (errors.frequency) setErrors({ ...errors, frequency: "" });
                        setShowFrequencyModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          frequency === freq && styles.modalOptionTextSelected,
                        ]}
                      >
                        {freq}
                      </Text>
                      {frequency === freq ? (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Add Time */}
      <Modal
        visible={showAddTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddTimeModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAddTimeModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalDialogCard}>
                <Text style={styles.modalDialogTitle}>Add Medication Time</Text>
                <Text style={styles.modalDialogSubtitle}>Select a preset or enter HH:MM (24h)</Text>

                <View style={styles.presetTimeGrid}>
                  {PRESET_TIMES.map((pt) => (
                    <TouchableOpacity
                      key={pt.value}
                      style={styles.presetTimeBtn}
                      onPress={() => handleAddTime(pt.value)}
                    >
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color={colors.primary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.presetTimeBtnText}>{pt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.customTimeRow}>
                  <TextInput
                    style={styles.customTimeInput}
                    placeholder="e.g., 07:30"
                    placeholderTextColor={colors.textMuted}
                    value={customTimeInput}
                    onChangeText={setCustomTimeInput}
                  />
                  <TouchableOpacity
                    style={styles.customTimeAddBtn}
                    onPress={() => {
                      if (/^\d{1,2}:\d{2}$/.test(customTimeInput.trim())) {
                        const parts = customTimeInput.trim().split(":");
                        const h = String(parseInt(parts[0], 10)).padStart(2, "0");
                        const m = String(parseInt(parts[1], 10)).padStart(2, "0");
                        handleAddTime(`${h}:${m}`);
                      } else {
                        Alert.alert("Invalid Time", "Please use HH:MM format (e.g. 07:30).");
                      }
                    }}
                  >
                    <Text style={styles.customTimeAddText}>Add</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setShowAddTimeModal(false)}
                >
                  <Text style={styles.modalCloseBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Date Picker Input */}
      <Modal
        visible={dateModalMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalMode(null)}
      >
        <TouchableWithoutFeedback onPress={() => setDateModalMode(null)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalDialogCard}>
                <Text style={styles.modalDialogTitle}>
                  {dateModalMode === "start" ? "Set Start Date" : "Set End Date"}
                </Text>
                <Text style={styles.modalDialogSubtitle}>Enter date in YYYY-MM-DD format</Text>

                <View style={styles.inputBox}>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={colors.textSecondary}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    value={dateModalValue}
                    onChangeText={setDateModalValue}
                  />
                </View>

                <View style={styles.quickDateRow}>
                  <TouchableOpacity
                    style={styles.quickDateBtn}
                    onPress={() => {
                      const today = new Date().toISOString().split("T")[0];
                      setDateModalValue(today);
                    }}
                  >
                    <Text style={styles.quickDateBtnText}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickDateBtn}
                    onPress={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      setDateModalValue(d.toISOString().split("T")[0]);
                    }}
                  >
                    <Text style={styles.quickDateBtnText}>+30 Days</Text>
                  </TouchableOpacity>
                  {dateModalMode === "end" ? (
                    <TouchableOpacity
                      style={styles.quickDateBtn}
                      onPress={() => setDateModalValue("")}
                    >
                      <Text style={styles.quickDateBtnText}>Ongoing</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setDateModalMode(null)}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalApplyBtn} onPress={handleApplyDate}>
                    <Text style={styles.modalApplyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteModal}
        title="Delete Medicine?"
        message={`Are you sure you want to permanently delete "${name || medicine.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={performDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  /* 1. Header */
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitleCol: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },

  /* Error Banner */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "500",
  },

  /* 2. Medicine Summary Hero Card */
  heroCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },

  /* Section Cards */
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  requiredAsterisk: {
    color: "#EF4444",
  },
  optionalText: {
    fontSize: 12,
    fontWeight: "400",
    color: colors.textSecondary,
  },
  fieldIcon: {
    marginRight: 8,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
  },

  /* Form Inputs */
  inputBox: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  inputBoxError: {
    borderColor: colors.danger,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  twoColRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  colLeft: {
    flex: 1,
  },
  colRight: {
    flex: 1,
  },
  combinedInputBox: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
  },
  combinedTextInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
  },
  combinedSelectBtn: {
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  selectBox: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  selectBoxText: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },

  /* Times */
  timeChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  timeChip: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    marginRight: 8,
  },
  addTimeBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  addTimeBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },

  /* Supply */
  supplyRow: {
    flexDirection: "row",
    gap: 12,
  },
  supplyLeftCol: {
    flex: 1.1,
  },
  supplyRightCol: {
    flex: 1,
  },
  supplyInfoBox: {
    backgroundColor: "#F0FDFA",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  supplyInfoText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    flex: 1,
  },

  /* Reminder */
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reminderTextCol: {
    flex: 1,
    marginRight: 10,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  reminderSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  /* Actions */
  actionButtonsContainer: {
    marginTop: 8,
    marginBottom: 20,
    gap: 10,
  },
  saveButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  deleteButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.danger,
  },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalDialogCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalDialogTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  modalDialogSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  modalOptionsList: {
    gap: 6,
  },
  modalOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  modalOptionItemSelected: {
    backgroundColor: "#CCFBF1",
  },
  modalOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalOptionTextSelected: {
    fontWeight: "700",
    color: colors.primaryDark,
  },

  /* Add Time Modal */
  presetTimeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  presetTimeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetTimeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  customTimeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  customTimeInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  customTimeAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  customTimeAddText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  modalCloseBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  /* Date Modal */
  quickDateRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  quickDateBtn: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickDateBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  modalApplyBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  modalApplyBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
