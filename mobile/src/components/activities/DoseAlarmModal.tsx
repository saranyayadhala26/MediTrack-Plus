/**
 * DoseAlarmModal Component (Phase 10.2).
 * Redesigned to match Page 24 of ui.pdf (Medication Reminder Flow).
 * Includes:
 * 1. State 1: Main Medication Reminder (Page 24 - Left)
 * 2. State 2: Snooze Reminder Bottom Sheet (Page 21 & Page 24 - Top Right)
 * 3. State 3: Skip Dose Bottom Sheet (Page 22-23 & Page 24 - Bottom Right)
 *
 * Preserves 100% of underlying business logic, API calls, exact alarm scheduling,
 * and navigation/callback flows.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { recordMedicationActivity } from "../../api/activities";
import { notificationService } from "../../services/notificationService";
import { colors, spacing } from "../../constants/theme";

const PREDEFINED_SKIP_REASONS = [
  "Forgot",
  "Feeling unwell",
  "Medicine unavailable",
  "Away from home",
  "Not required today",
  "Other",
];

const SNOOZE_OPTIONS = [10, 20, 30];

export interface DoseAlarmData {
  scheduleId: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  dosageUnit?: string;
  scheduledTime: string;
  scheduledDate?: string;
  isSnooze?: boolean;
}

export interface DoseAlarmModalProps {
  visible: boolean;
  data: DoseAlarmData | null;
  onDismiss: () => void;
  onActivityRecorded?: (action: "Taken" | "Snoozed" | "Skipped") => void;
}

/**
 * Format HH:MM 24-hour time to 12-hour format e.g. "2:30 PM"
 */
const formatTime12Hour = (time24: string): string => {
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Format ISO or YYYY-MM-DD date to "Today, 14 Sep 2026"
 */
const formatDateDisplay = (dateStr?: string): string => {
  try {
    const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    if (isNaN(d.getTime())) return "Today";
    const day = d.getDate();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `Today, ${day} ${month} ${year}`;
  } catch {
    return "Today";
  }
};

/**
 * Calculate expected time for snooze options e.g. "2:40 PM"
 */
const getSnoozeTimePreview = (minutes: number): string => {
  const target = new Date(Date.now() + minutes * 60 * 1000);
  const h = target.getHours();
  const m = target.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
};

export const DoseAlarmModal: React.FC<DoseAlarmModalProps> = ({
  visible,
  data,
  onDismiss,
  onActivityRecorded,
}) => {
  const [isTaking, setIsTaking] = useState(false);
  const [isSnoozing, setIsSnoozing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // Bottom sheet states
  const [showSnoozeStep, setShowSnoozeStep] = useState(false);
  const [selectedSnoozeMinutes, setSelectedSnoozeMinutes] = useState<number>(10);

  const [showSkipStep, setShowSkipStep] = useState(false);
  const [selectedSkipReason, setSelectedSkipReason] = useState<string>("");
  const [customSkipReason, setCustomSkipReason] = useState<string>("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!data) return null;

  const todayStr = data.scheduledDate || new Date().toISOString().split("T")[0];
  const dosageDisplay = `${data.dosage} ${data.dosageUnit || ""}`.trim();

  const resetState = () => {
    setIsTaking(false);
    setIsSnoozing(false);
    setIsSkipping(false);
    setShowSnoozeStep(false);
    setSelectedSnoozeMinutes(10);
    setShowSkipStep(false);
    setSelectedSkipReason("");
    setCustomSkipReason("");
    setFeedback(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetState();
    onDismiss();
  };

  const getValidScheduledTime = (): string => {
    if (data.scheduledTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.scheduledTime)) {
      return data.scheduledTime;
    }
    if (data.scheduledTime) {
      const parsed = new Date(data.scheduledTime);
      if (!isNaN(parsed.getTime())) {
        const hh = String(parsed.getHours()).padStart(2, "0");
        const mm = String(parsed.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    }
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const isTestAlert =
    data.medicineId === "test-med-001" || data.scheduleId === "test-sched-001";

  // 1. Take Now Action
  const handleTake = async () => {
    if (isTaking || isSnoozing || isSkipping) return;
    setIsTaking(true);
    setErrorMessage(null);

    if (isTestAlert) {
      setFeedback("Test alert: Take Medicine verified successfully!");
      setTimeout(() => {
        onActivityRecorded?.("Taken");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Taken",
      });
      setFeedback("Dose recorded as Taken!");
      setTimeout(() => {
        onActivityRecorded?.("Taken");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || "Failed to record dose intake. Please try again.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsTaking(false);
    }
  };

  // 2. Snooze Action
  const handleSnooze = async (minutes: number = selectedSnoozeMinutes) => {
    if (isTaking || isSnoozing || isSkipping) return;
    setIsSnoozing(true);
    setErrorMessage(null);

    if (isTestAlert) {
      try {
        await notificationService.scheduleSnoozeReminder(
          data.medicineName,
          dosageDisplay,
          data.scheduleId,
          data.medicineId,
          minutes
        );
      } catch (notifErr) {
        console.warn("DoseAlarmModal: Could not schedule local snooze alert:", notifErr);
      }
      setFeedback(`Test alert: Snoozed for ${minutes} minutes!`);
      setTimeout(() => {
        onActivityRecorded?.("Snoozed");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Snoozed",
      });

      // Schedule local hardware snooze alert in N minutes
      try {
        await notificationService.scheduleSnoozeReminder(
          data.medicineName,
          dosageDisplay,
          data.scheduleId,
          data.medicineId,
          minutes
        );
      } catch (notifErr) {
        console.warn("DoseAlarmModal: Could not schedule local snooze alert:", notifErr);
      }

      setFeedback(`Reminder snoozed for ${minutes} minutes.`);
      setTimeout(() => {
        onActivityRecorded?.("Snoozed");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to snooze reminder.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsSnoozing(false);
    }
  };

  // 3. Skip Dose Action (Confirm)
  const handleConfirmSkip = async () => {
    let reason = selectedSkipReason;
    if (selectedSkipReason === "Other") {
      reason = customSkipReason.trim();
    }

    if (!reason.trim()) {
      setErrorMessage("Please select or specify a reason for skipping this dose.");
      return;
    }

    setIsSkipping(true);
    setErrorMessage(null);

    if (isTestAlert) {
      setFeedback(`Test alert: Skipped (${reason})!`);
      setTimeout(() => {
        onActivityRecorded?.("Skipped");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Skipped",
        skipReason: reason,
      });

      setFeedback(`Dose skipped (${reason}).`);
      setTimeout(() => {
        onActivityRecorded?.("Skipped");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to record skipped dose.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsSkipping(false);
    }
  };

  const scheduledTime12 = formatTime12Hour(getValidScheduledTime());
  const scheduledDateLabel = formatDateDisplay(data.scheduledDate);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <SafeAreaView style={styles.safeContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

          {/* Top Close Button (Page 24 Top Right) */}
          <View style={styles.topBar}>
            <View style={{ width: 40 }} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              disabled={isTaking || isSnoozing || isSkipping}
              accessibilityRole="button"
              accessibilityLabel="Dismiss reminder"
            >
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Feedback Toast */}
            {feedback ? (
              <View style={styles.feedbackBanner}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color="#15803D"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.feedbackBannerText}>{feedback}</Text>
              </View>
            ) : null}

            {/* Error Banner */}
            {errorMessage && !showSkipStep && !showSnoozeStep ? (
              <View style={styles.errorBanner}>
                <Ionicons
                  name="alert-circle"
                  size={20}
                  color="#DC2626"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* 1. Bell Icon Header (Page 24) */}
            <View style={styles.headerSection}>
              <View style={styles.bellWrapper}>
                <Text style={styles.soundWaveText}>((</Text>
                <View style={styles.bellCircle}>
                  <Ionicons name="notifications" size={34} color="#0D9488" />
                </View>
                <Text style={styles.soundWaveText}>))</Text>
              </View>
              <Text style={styles.categoryTitle}>
                {data.isSnooze ? "Snoozed Reminder" : "Medication Reminder"}
              </Text>
              <Text style={styles.mainHeading}>It's time for your medicine</Text>
            </View>

            {/* 2. Medication Details Card (Page 24) */}
            <View style={styles.medCard}>
              <View style={styles.medCardHeader}>
                <View style={styles.pillCircle}>
                  <MaterialCommunityIcons name="pill" size={24} color="#2563EB" />
                </View>
                <View style={styles.medCardHeaderCol}>
                  <Text style={styles.medCardName}>{data.medicineName}</Text>
                  <Text style={styles.medCardDosage}>
                    {dosageDisplay || "Prescribed Medicine"}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.medDetailsList}>
                <View style={styles.medDetailRow}>
                  <Ionicons name="time-outline" size={17} color="#64748B" />
                  <Text style={styles.medDetailText}>
                    Take {dosageDisplay ? `1 dose (${dosageDisplay})` : "prescribed dose"}
                  </Text>
                </View>
                <View style={styles.medDetailRow}>
                  <MaterialCommunityIcons
                    name="silverware-fork-knife"
                    size={17}
                    color="#64748B"
                  />
                  <Text style={styles.medDetailText}>After food / as prescribed</Text>
                </View>
              </View>
            </View>

            {/* 3. Scheduled Time Card (Page 24) */}
            <View style={styles.scheduledCard}>
              <View style={styles.scheduledClockCircle}>
                <Ionicons name="time" size={26} color="#0D9488" />
              </View>
              <View style={styles.scheduledCol}>
                <Text style={styles.scheduledSublabel}>Scheduled for</Text>
                <Text style={styles.scheduledTimeBig}>{scheduledTime12}</Text>
                <Text style={styles.scheduledDateSub}>{scheduledDateLabel}</Text>
              </View>
            </View>

            {/* 4. Dose Progress Pill (Page 24) */}
            <View style={styles.doseProgressPill}>
              <Ionicons
                name="list"
                size={16}
                color="#64748B"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.doseProgressText}>Scheduled dose for today</Text>
            </View>

            {/* 5. Primary Action: Take Medicine */}
            <TouchableOpacity
              style={[
                styles.primaryTakeBtn,
                (isTaking || isSnoozing || isSkipping || !!feedback) &&
                  styles.btnDisabled,
              ]}
              onPress={handleTake}
              disabled={isTaking || isSnoozing || isSkipping || !!feedback}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Take Medicine"
            >
              {isTaking ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryTakeBtnText}>Take Medicine</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 6. Secondary Actions: Snooze & Skip (Page 24) */}
            <View style={styles.secondaryActionsRow}>
              {/* Snooze Button */}
              <TouchableOpacity
                style={[
                  styles.snoozeSecondaryBtn,
                  (isTaking || isSnoozing || isSkipping || !!feedback) &&
                    styles.btnDisabled,
                ]}
                onPress={() => {
                  setErrorMessage(null);
                  setShowSnoozeStep(true);
                }}
                disabled={isTaking || isSnoozing || isSkipping || !!feedback}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Snooze reminder"
              >
                <Ionicons
                  name="time-outline"
                  size={19}
                  color="#2563EB"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.snoozeSecondaryBtnText}>Snooze</Text>
              </TouchableOpacity>

              {/* Skip Button */}
              <TouchableOpacity
                style={[
                  styles.skipSecondaryBtn,
                  (isTaking || isSnoozing || isSkipping || !!feedback) &&
                    styles.btnDisabled,
                ]}
                onPress={() => {
                  setErrorMessage(null);
                  setShowSkipStep(true);
                }}
                disabled={isTaking || isSnoozing || isSkipping || !!feedback}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip dose"
              >
                <Ionicons
                  name="close"
                  size={19}
                  color="#EF4444"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.skipSecondaryBtnText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>

        {/* ============================================================== */}
        {/* STATE 2: SNOOZE REMINDER BOTTOM SHEET (Page 21 & Page 24 Top) */}
        {/* ============================================================== */}
        {showSnoozeStep && (
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback
              onPress={() => !isSnoozing && setShowSnoozeStep(false)}
            >
              <View style={styles.sheetBackdrop} />
            </TouchableWithoutFeedback>

            <View style={styles.bottomSheetContainer}>
              {/* Top Handle Bar */}
              <View style={styles.sheetHandleBar} />

              <Text style={styles.sheetTitle}>Snooze reminder</Text>
              <Text style={styles.sheetSubtitle}>
                Choose when to remind you again.
              </Text>

              {/* Mini Medicine Card */}
              <View style={styles.miniMedCard}>
                <View style={styles.miniPillCircle}>
                  <MaterialCommunityIcons name="pill" size={20} color="#2563EB" />
                </View>
                <View style={styles.miniMedCol}>
                  <Text style={styles.miniMedName}>{data.medicineName}</Text>
                  <Text style={styles.miniMedDosage}>
                    {dosageDisplay || "Prescribed dosage"}
                  </Text>
                  <Text style={styles.miniMedSchedule}>
                    Scheduled for {scheduledTime12}
                  </Text>
                </View>
              </View>

              {/* Snooze Duration Options */}
              <View style={styles.optionsList}>
                {SNOOZE_OPTIONS.map((mins) => {
                  const isSelected = selectedSnoozeMinutes === mins;
                  const timePreview = getSnoozeTimePreview(mins);
                  return (
                    <TouchableOpacity
                      key={`snooze-${mins}`}
                      style={[
                        styles.optionRow,
                        isSelected && styles.optionRowSelected,
                      ]}
                      onPress={() => setSelectedSnoozeMinutes(mins)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.optionLeft}>
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <Text
                          style={[
                            styles.optionLabel,
                            isSelected && styles.optionLabelSelected,
                          ]}
                        >
                          {mins} minutes
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.optionTimePreview,
                          isSelected && styles.optionTimePreviewSelected,
                        ]}
                      >
                        {timePreview}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Primary Action: Snooze Reminder */}
              <TouchableOpacity
                style={[
                  styles.sheetPrimaryBtn,
                  isSnoozing && styles.btnDisabled,
                ]}
                onPress={() => handleSnooze(selectedSnoozeMinutes)}
                disabled={isSnoozing}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Snooze Reminder"
              >
                {isSnoozing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.sheetPrimaryBtnText}>
                      Snooze Reminder
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Secondary Action: Cancel */}
              <TouchableOpacity
                style={styles.sheetSecondaryBtn}
                onPress={() => setShowSnoozeStep(false)}
                disabled={isSnoozing}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel Snooze"
              >
                <Text style={styles.sheetSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============================================================== */}
        {/* STATE 3: SKIP DOSE BOTTOM SHEET (Page 22-23 & Page 24 Bottom)  */}
        {/* ============================================================== */}
        {showSkipStep && (
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback
              onPress={() => !isSkipping && setShowSkipStep(false)}
            >
              <View style={styles.sheetBackdrop} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.bottomSheetContainer}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Top Handle Bar */}
                <View style={styles.sheetHandleBar} />

                <Text style={styles.sheetTitle}>Skip this dose?</Text>
                <Text style={styles.sheetSubtitle}>
                  This dose will be marked as skipped.
                </Text>

                {/* Mini Medicine Card */}
                <View style={styles.miniMedCard}>
                  <View style={styles.miniPillCircle}>
                    <MaterialCommunityIcons name="pill" size={20} color="#2563EB" />
                  </View>
                  <View style={styles.miniMedCol}>
                    <Text style={styles.miniMedName}>{data.medicineName}</Text>
                    <Text style={styles.miniMedDosage}>
                      {dosageDisplay || "Prescribed dosage"}
                    </Text>
                    <Text style={styles.miniMedSchedule}>
                      Scheduled for {scheduledTime12}
                    </Text>
                  </View>
                </View>

                {/* Error Banner within Sheet */}
                {errorMessage ? (
                  <View style={styles.errorBanner}>
                    <Ionicons
                      name="alert-circle"
                      size={18}
                      color="#DC2626"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <Text style={styles.skipSectionTitle}>
                  Why are you skipping this dose?
                </Text>

                {/* Predefined Reasons Radio List */}
                <View style={styles.reasonsList}>
                  {PREDEFINED_SKIP_REASONS.map((reason) => {
                    const isSelected = selectedSkipReason === reason;
                    return (
                      <TouchableOpacity
                        key={`skip-${reason}`}
                        style={[
                          styles.reasonOptionRow,
                          isSelected && styles.reasonOptionRowSelected,
                        ]}
                        onPress={() => {
                          setSelectedSkipReason(reason);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <Text
                          style={[
                            styles.reasonOptionText,
                            isSelected && styles.reasonOptionTextSelected,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Reason Input if 'Other' is chosen */}
                {selectedSkipReason === "Other" && (
                  <TextInput
                    style={styles.customReasonInput}
                    placeholder="Enter specific reason..."
                    placeholderTextColor="#94A3B8"
                    value={customSkipReason}
                    onChangeText={(txt) => {
                      setCustomSkipReason(txt);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    maxLength={150}
                    autoFocus
                  />
                )}

                {/* Bottom Actions Row: Cancel & Skip Dose */}
                <View style={styles.skipActionsRow}>
                  <TouchableOpacity
                    style={styles.skipCancelBtn}
                    onPress={() => {
                      setShowSkipStep(false);
                      setErrorMessage(null);
                    }}
                    disabled={isSkipping}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.skipCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.skipDestructiveBtn,
                      isSkipping && styles.btnDisabled,
                    ]}
                    onPress={handleConfirmSkip}
                    disabled={isSkipping}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Skip Dose"
                  >
                    {isSkipping ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.skipDestructiveBtnText}>Skip Dose</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    </Modal>
  );
};

export default DoseAlarmModal;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safeContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 6,
    paddingBottom: 6,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  /* Feedback / Error Banners */
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  feedbackBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#15803D",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
    flex: 1,
  },

  /* 1. Header with Bell (Page 24) */
  headerSection: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  bellWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  soundWaveText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#5EEAD4",
    marginHorizontal: 8,
  },
  bellCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#E6F4F1",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mainHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  /* 2. Medication Details Card (Page 24) */
  medCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  medCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  pillCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  medCardHeaderCol: {
    flex: 1,
  },
  medCardName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  medCardDosage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },
  medDetailsList: {
    gap: 8,
  },
  medDetailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  medDetailText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
    marginLeft: 10,
  },

  /* 3. Scheduled Time Card (Page 24) */
  scheduledCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  scheduledClockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  scheduledCol: {
    flex: 1,
  },
  scheduledSublabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  scheduledTimeBig: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginVertical: 1,
  },
  scheduledDateSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },

  /* 4. Dose Progress Pill (Page 24) */
  doseProgressPill: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  doseProgressText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },

  /* 5. Primary Action Button */
  primaryTakeBtn: {
    backgroundColor: "#0D9488",
    borderRadius: 14,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryTakeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* 6. Secondary Actions Row */
  secondaryActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  snoozeSecondaryBtn: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  snoozeSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2563EB",
  },
  skipSecondaryBtn: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  skipSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#EF4444",
  },

  /* ============================================================== */
  /* BOTTOM SHEET STYLES (Snooze & Skip)                            */
  /* ============================================================== */
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  bottomSheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "android" ? 24 : 34,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHandleBar: {
    width: 38,
    height: 4,
    backgroundColor: "#CBD5E1",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
    marginBottom: 14,
  },

  /* Mini Medicine Card in Bottom Sheets */
  miniMedCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  miniPillCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  miniMedCol: {
    flex: 1,
  },
  miniMedName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  miniMedDosage: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 1,
  },
  miniMedSchedule: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },

  /* Snooze Option Rows */
  optionsList: {
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  optionRowSelected: {
    borderColor: "#0D9488",
    backgroundColor: "#F0FDFA",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginLeft: 12,
  },
  optionLabelSelected: {
    color: "#0D9488",
    fontWeight: "700",
  },
  optionTimePreview: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  optionTimePreviewSelected: {
    color: "#0D9488",
    fontWeight: "700",
  },

  /* Radio Controls */
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: "#0D9488",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0D9488",
  },

  /* Snooze Sheet Action Buttons */
  sheetPrimaryBtn: {
    backgroundColor: "#0D9488",
    borderRadius: 12,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  sheetPrimaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sheetSecondaryBtn: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSecondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },

  /* Skip Sheet Styles */
  skipSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 4,
    marginBottom: 10,
  },
  reasonsList: {
    marginBottom: 12,
  },
  reasonOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  reasonOptionRowSelected: {
    borderColor: "#0D9488",
    backgroundColor: "#F0FDFA",
  },
  reasonOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginLeft: 12,
  },
  reasonOptionTextSelected: {
    color: "#0D9488",
    fontWeight: "700",
  },
  customReasonInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginBottom: 14,
  },
  skipActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  skipCancelBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  skipCancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  skipDestructiveBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  skipDestructiveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  btnDisabled: {
    opacity: 0.6,
  },
});
