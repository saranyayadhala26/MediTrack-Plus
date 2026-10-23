/**
 * Medicine Detail Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 29 of ui.pdf).
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { deleteMedicine, getMedicineById } from "../../api/medicines";
import { deleteSchedule, getSchedules, updateSchedule } from "../../api/schedules";
import { getActivitiesByMedicine } from "../../api/activities";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../services/notificationService";
import { MedicationActivity, MedicationSchedule, Medicine } from "../../types";
import { InlineError } from "../../components/common";

interface MedicineDetailScreenProps {
  medicine: Medicine;
  onBack: () => void;
  onEdit: (medicine: Medicine) => void;
  onDeleted: () => void;
  onAddSchedule?: (medicine: Medicine) => void;
  onEditSchedule?: (schedule: MedicationSchedule) => void;
}

export const MedicineDetailScreen: React.FC<MedicineDetailScreenProps> = ({
  medicine,
  onBack,
  onEdit,
  onDeleted,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  const [currentMed, setCurrentMed] = useState<Medicine>(medicine);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [, setIsLoadingSchedules] = useState<boolean>(false);
  const [, setActivities] = useState<MedicationActivity[]>([]);
  const [, setIsLoadingActivities] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load activities and refresh medicine
  const loadActivities = () => {
    setIsLoadingActivities(true);
    getActivitiesByMedicine(currentMed.id)
      .then((acts) => setActivities(acts || []))
      .catch(() => {})
      .finally(() => setIsLoadingActivities(false));

    getMedicineById(currentMed.id)
      .then((updated) => {
        if (updated) setCurrentMed(updated);
      })
      .catch(() => {});
  };

  useEffect(() => {
    setCurrentMed(medicine);
  }, [medicine]);

  useEffect(() => {
    if (!isCaregiver) {
      setIsLoadingSchedules(true);
      getSchedules(medicine.id)
        .then((res) => setSchedules(res.items || []))
        .catch(() => {})
        .finally(() => setIsLoadingSchedules(false));
      loadActivities();
    } else {
      loadActivities();
    }
  }, [medicine.id, isCaregiver]);

  const handleToggleSchedule = async (sched: MedicationSchedule) => {
    try {
      const updated = await updateSchedule(sched.id, { enabled: !sched.enabled });
      setSchedules((prev) => prev.map((s) => (s.id === sched.id ? updated : s)));
      try {
        await notificationService.syncScheduleReminder(updated);
        await notificationService.autoSync({ force: true });
      } catch (notifErr) {
        console.warn("Failed to sync reminder status:", notifErr);
      }
    } catch {
      Alert.alert("Error", "Failed to update schedule status.");
    }
  };

  const performDelete = async () => {
    setShowConfirmModal(false);
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMedicine(currentMed.id);
      for (const s of schedules) {
        notificationService.cancelScheduleReminder(s.id).catch(() => {});
      }
      await notificationService.autoSync({ force: true }).catch(() => {});
      Alert.alert(
        "Deleted",
        `"${currentMed.name}" has been removed from your list.`,
        [{ text: "OK", onPress: onDeleted }]
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to delete medicine. Please check your network and try again.";
      setDeleteError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePress = () => {
    setShowConfirmModal(true);
  };

  // ----- UI calculation helpers -----
  const todayDate = new Date();
  const currentTimeStr = `${String(todayDate.getHours()).padStart(2, "0")}:${String(
    todayDate.getMinutes()
  ).padStart(2, "0")}`;

  const sortedSchedules = [...schedules]
    .filter((s) => s.enabled !== false)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const upcoming = sortedSchedules.find((s) => (s.time || "") >= currentTimeStr);
  const nextSchedule = upcoming || sortedSchedules[0];

  const formatTime = (time?: string) => {
    if (!time) return "";
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);
    if (isNaN(hour) || isNaN(minute)) return time;
    const ampm = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${String(minute).padStart(2, "0")} ${ampm}`;
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      const day = String(d.getDate()).padStart(2, "0");
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  };

  const calculateDays = (startStr?: string, endStr?: string): number | null => {
    if (!startStr || !endStr) return null;
    try {
      const s = new Date(startStr);
      const e = new Date(endStr);
      const diff = e.getTime() - s.getTime();
      if (isNaN(diff) || diff < 0) return null;
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const formatFormName = (unit?: string) => {
    if (!unit) return "Tablet";
    const lower = unit.toLowerCase();
    if (lower === "tablet" || lower === "tablets") return "Tablet";
    if (lower === "capsule" || lower === "capsules") return "Capsule";
    return unit.charAt(0).toUpperCase() + unit.slice(1);
  };

  const isLowInventory =
    currentMed.inventory !== undefined &&
    currentMed.inventory !== null &&
    currentMed.refillThreshold !== undefined &&
    currentMed.refillThreshold !== null &&
    currentMed.inventory <= currentMed.refillThreshold;

  const hasSupply = currentMed.inventory !== undefined && currentMed.inventory !== null;
  const inventoryCount = currentMed.inventory ?? 0;
  const refillThreshold = currentMed.refillThreshold ?? 15;
  const supplyMax = Math.max(inventoryCount, refillThreshold * 2, 30);
  const supplyPercent = Math.min(100, Math.max(0, Math.round((inventoryCount / supplyMax) * 100)));
  const durationDays = calculateDays(currentMed.startDate, currentMed.endDate);

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
          accessibilityLabel="Back to medicines"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medicine Details</Text>
        <TouchableOpacity
          onPress={() => onEdit(currentMed)}
          style={styles.headerEditButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Edit medicine"
        >
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={styles.headerEditText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner for delete failures */}
        {deleteError ? (
          <InlineError
            title="Couldn't delete medicine"
            subtitle={deleteError}
            onDismiss={() => setDeleteError(null)}
            onRetry={performDelete}
          />
        ) : null}

        {/* 2. Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconBox}>
            <MaterialCommunityIcons name="pill" size={32} color={colors.primary} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.medName} numberOfLines={1}>
              {currentMed.name}
            </Text>
            <Text style={styles.strengthText} numberOfLines={1}>
              {currentMed.dosage} {currentMed.dosageUnit}  •  {formatFormName(currentMed.dosageUnit)}
            </Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>
        </View>

        {/* 3. Next Dose Card */}
        {nextSchedule ? (
          <View style={styles.sectionCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>Next dose</Text>
              <View style={styles.todayChip}>
                <Text style={styles.todayChipText}>Today</Text>
              </View>
            </View>
            <View style={styles.nextDoseRow}>
              <View style={styles.nextDoseIconCircle}>
                <Ionicons name="time-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.nextDoseInfo}>
                <Text style={styles.nextDoseTime}>{formatTime(nextSchedule.time)}</Text>
                <Text style={styles.nextDoseMedicine}>{currentMed.name}</Text>
                <Text style={styles.nextDoseStrength}>
                  {currentMed.dosage} {currentMed.dosageUnit}  •  1 {currentMed.dosageUnit || "tablet"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </View>
        ) : null}

        {/* 4. Schedule Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardRowHeader}>
            <View style={[styles.tileIconContainer, { backgroundColor: "#E0F2FE" }]}>
              <Ionicons name="calendar-outline" size={20} color="#0284C7" />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={styles.sectionTitle}>Schedule</Text>
              <Text style={styles.sectionSubTitle}>{currentMed.frequency || "Every day"}</Text>
            </View>
          </View>
          {sortedSchedules.length > 0 ? (
            <View style={styles.timeChipsContainer}>
              {sortedSchedules.map((s) => (
                <View key={s.id} style={styles.timeChip}>
                  <Ionicons
                    name="time-outline"
                    size={15}
                    color={colors.primaryDark}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.timeChipText}>{formatTime(s.time)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.fallbackText}>No scheduled times set</Text>
          )}
        </View>

        {/* 5. How to Take Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardRowHeader}>
            <View style={[styles.tileIconContainer, { backgroundColor: "#EDE9FE" }]}>
              <Ionicons name="restaurant-outline" size={20} color="#7C3AED" />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={styles.sectionTitle}>How to take</Text>
              <Text style={styles.sectionSubTitle}>
                {currentMed.instructions || "Take after food"}
              </Text>
            </View>
          </View>
        </View>

        {/* 6. Treatment Duration Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardRowHeader}>
            <View style={[styles.tileIconContainer, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name="calendar-outline" size={20} color="#16A34A" />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={styles.sectionTitle}>Treatment duration</Text>
              <Text style={styles.sectionSubTitle}>
                {currentMed.startDate && currentMed.endDate
                  ? `${formatDisplayDate(currentMed.startDate)}  -  ${formatDisplayDate(currentMed.endDate)}`
                  : currentMed.startDate
                  ? `From ${formatDisplayDate(currentMed.startDate)}`
                  : "Ongoing"}
              </Text>
              {durationDays ? (
                <Text style={styles.sectionSubCaption}>{durationDays} days</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* 7. Medicine Supply Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardRowHeader}>
            <View style={[styles.tileIconContainer, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="cube-outline" size={20} color="#D97706" />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={styles.sectionTitle}>Medicine supply</Text>
              {hasSupply ? (
                <>
                  <View style={styles.supplyCountRow}>
                    <Text style={styles.supplyCountLeft}>
                      {currentMed.inventory} {currentMed.dosageUnit || "tablet"}
                      {currentMed.inventory === 1 ? "" : "s"} remaining
                    </Text>
                    <Text style={styles.supplyCountRight}>
                      {currentMed.inventory} / {supplyMax}
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${supplyPercent}%` },
                        isLowInventory ? { backgroundColor: colors.warning } : null,
                      ]}
                    />
                  </View>
                  <Text style={styles.supplyCaption}>
                    Keep this updated to track your remaining medicine.
                  </Text>
                </>
              ) : (
                <Text style={styles.sectionSubTitle}>
                  Supply tracking is not enabled for this medicine.
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 8. Reminder Card */}
        <View style={styles.sectionCard}>
          <View style={styles.reminderRow}>
            <View style={[styles.tileIconContainer, { backgroundColor: "#CCFBF1" }]}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.reminderTextCol}>
              <Text style={styles.sectionTitle}>Reminder</Text>
              <Text style={styles.sectionSubTitle}>Medication reminders</Text>
              <Text style={styles.supplyCaption}>
                You'll be reminded when it's time to take this medicine.
              </Text>
            </View>
            <Switch
              value={schedules.some((s) => s.enabled)}
              onValueChange={() => {
                schedules.forEach((s) => handleToggleSchedule(s));
              }}
              trackColor={{ false: "#CBD5E1", true: colors.primary }}
              thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
            />
          </View>
        </View>

        {/* 9. Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => onEdit(currentMed)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Edit Medicine"
          >
            <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryActionButtonText}>Edit Medicine</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteActionButton}
            onPress={handleDeletePress}
            disabled={isDeleting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete Medicine"
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
            <Text style={styles.deleteActionButtonText}>
              {isDeleting ? "Deleting..." : "Delete Medicine"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Medicine?</Text>
            <Text style={styles.modalBody}>
              Are you sure you want to permanently delete "{currentMed.name}"? This action cannot be
              undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteButton}
                onPress={performDelete}
                activeOpacity={0.8}
              >
                <Text style={styles.modalDeleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    minWidth: 40,
    height: 40,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerEditButton: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 40,
    height: 40,
    justifyContent: "flex-end",
  },
  headerEditText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    marginLeft: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
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

  /* 2. Hero Card */
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  heroInfo: {
    flex: 1,
  },
  medName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  strengthText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 3,
    marginBottom: 8,
  },
  activeBadge: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  activeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  /* Section Cards */
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  todayChip: {
    backgroundColor: "#CCFBF1",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },

  /* Next Dose */
  nextDoseRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextDoseIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  nextDoseInfo: {
    flex: 1,
  },
  nextDoseTime: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  nextDoseMedicine: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 2,
  },
  nextDoseStrength: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Icon Tile Header Cards (Schedule, How to take, Duration, Supply) */
  cardRowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  tileIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  tileTextCol: {
    flex: 1,
  },
  sectionSubTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionSubCaption: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  fallbackText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 8,
  },

  /* Schedule Time Chips */
  timeChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  /* Medicine Supply */
  supplyCountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  supplyCountLeft: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  supplyCountRight: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    marginTop: 8,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  supplyCaption: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
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

  /* Action Buttons */
  actionButtonsContainer: {
    marginTop: 8,
    marginBottom: 24,
    gap: 12,
  },
  primaryActionButton: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  primaryActionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteActionButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteActionButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalCancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  modalDeleteButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
  },
  modalDeleteButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
