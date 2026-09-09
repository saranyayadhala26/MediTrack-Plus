/**
 * Medicine Detail Screen (Phase 4).
 * Displays full clinical details, intake directions, duration dates,
 * inventory/refill alerts, mandatory medical disclaimer, and actions (Edit / Delete).
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { deleteMedicine } from "../../api/medicines";
import { deleteSchedule, getSchedules, updateSchedule } from "../../api/schedules";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ScheduleCard } from "../../components/schedules/ScheduleCard";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../services/notificationService";
import { MedicationSchedule, Medicine } from "../../types";

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
  onAddSchedule,
  onEditSchedule,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCaregiver) {
      setIsLoadingSchedules(true);
      getSchedules(medicine.id)
        .then((res) => setSchedules(res.items || []))
        .catch(() => {})
        .finally(() => setIsLoadingSchedules(false));
    }
  }, [medicine.id, isCaregiver]);

  const handleToggleSchedule = async (sched: MedicationSchedule) => {
    try {
      const updated = await updateSchedule(sched.id, { enabled: !sched.enabled });
      setSchedules((prev) => prev.map((s) => (s.id === sched.id ? updated : s)));
      try {
        await notificationService.syncScheduleReminder(updated);
      } catch (notifErr) {
        console.warn("Failed to sync reminder status:", notifErr);
      }
    } catch {
      Alert.alert("Error", "Failed to update schedule status.");
    }
  };

  const handleDeleteSchedule = (sched: MedicationSchedule) => {
    Alert.alert("Delete Reminder", `Delete reminder for ${sched.time}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSchedule(sched.id);
            setSchedules((prev) => prev.filter((s) => s.id !== sched.id));
            try {
              await notificationService.cancelScheduleReminder(sched.id);
            } catch (notifErr) {
              console.warn("Failed to cancel schedule reminder:", notifErr);
            }
          } catch {
            Alert.alert("Error", "Failed to delete schedule.");
          }
        },
      },
    ]);
  };

  const isLowInventory =
    medicine.inventory !== undefined &&
    medicine.inventory !== null &&
    medicine.refillThreshold !== undefined &&
    medicine.refillThreshold !== null &&
    medicine.inventory <= medicine.refillThreshold;

  const performDelete = async () => {
    setShowConfirmModal(false);
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMedicine(medicine.id);
      // Cancel local reminders for all schedules linked to this deleted medicine
      for (const s of schedules) {
        notificationService.cancelScheduleReminder(s.id).catch(() => {});
      }
      Alert.alert("Deleted", `"${medicine.name}" has been removed from your list.`, [
        { text: "OK", onPress: onDeleted },
      ]);
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
    // Cross-platform delete confirmation (Modal for web/testing and Alert for native)
    setShowConfirmModal(true);
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
          accessibilityLabel="Back to medicines"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {medicine.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Medical Safety Notice */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
          <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
        </View>

        {deleteError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{deleteError}</Text>
          </View>
        )}

        {/* Primary Overview Card */}
        <Card style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.titleInfo}>
              <Text style={styles.medName}>{medicine.name}</Text>
              <Text style={styles.strengthText}>
                {medicine.dosage} {medicine.dosageUnit}
              </Text>
            </View>
            <View style={styles.frequencyBadge}>
              <Text style={styles.frequencyBadgeText}>{medicine.frequency}</Text>
            </View>
          </View>
        </Card>

        {/* Clinical Directions Card */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Prescription Directions</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Intake Frequency:</Text>
            <Text style={styles.rowValue}>{medicine.frequency}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Dosage per intake:</Text>
            <Text style={styles.rowValue}>
              {medicine.dosage} {medicine.dosageUnit}
            </Text>
          </View>

          {medicine.instructions ? (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsTitle}>Special Instructions:</Text>
              <Text style={styles.instructionsText}>{medicine.instructions}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Special Instructions:</Text>
              <Text style={styles.rowValueMuted}>None provided</Text>
            </View>
          )}

          {/* Schedule Duration */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Course Duration:</Text>
            <Text style={styles.rowValue}>
              {medicine.startDate || "Ongoing"} {medicine.endDate ? `→ ${medicine.endDate}` : ""}
            </Text>
          </View>
        </Card>

        {/* Reminder Schedules Card */}
        <Card style={styles.card}>
          <View style={styles.schedulesHeaderRow}>
            <Text style={styles.sectionTitle}>Reminder Schedules</Text>
            {!isCaregiver && onAddSchedule && (
              <Button
                title="+ Add Time"
                onPress={() => onAddSchedule(medicine)}
                variant="outline"
                style={styles.addTimeButton}
              />
            )}
          </View>

          {isLoadingSchedules ? (
            <Text style={styles.loadingSchedulesText}>Loading reminder times...</Text>
          ) : schedules.length === 0 ? (
            <View style={styles.emptySchedulesBox}>
              <Text style={styles.emptySchedulesTitle}>No Reminders Set</Text>
              <Text style={styles.emptySchedulesText}>
                Configure intake times to ensure you never miss a dose.
              </Text>
              {!isCaregiver && onAddSchedule && (
                <Button
                  title="+ Set Reminder Schedule"
                  onPress={() => onAddSchedule(medicine)}
                  variant="primary"
                  style={styles.setScheduleButton}
                />
              )}
            </View>
          ) : (
            <View style={styles.schedulesList}>
              {schedules.map((sched) => (
                <ScheduleCard
                  key={sched.id}
                  schedule={sched}
                  showMedicineName={false}
                  onToggleEnabled={handleToggleSchedule}
                  onEdit={isCaregiver ? undefined : onEditSchedule}
                  onDelete={isCaregiver ? undefined : handleDeleteSchedule}
                />
              ))}
            </View>
          )}
        </Card>

        {/* Supply & Inventory Status Card */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Supply & Refill Status</Text>

          {medicine.inventory !== undefined && medicine.inventory !== null ? (
            <View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Units Remaining:</Text>
                <Text
                  style={[
                    styles.rowValueBold,
                    isLowInventory ? styles.lowStockText : styles.inStockText,
                  ]}
                >
                  {medicine.inventory} {medicine.dosageUnit}(s)
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Refill Alert Level:</Text>
                <Text style={styles.rowValue}>
                  {medicine.refillThreshold !== undefined && medicine.refillThreshold !== null
                    ? `${medicine.refillThreshold} ${medicine.dosageUnit}(s)`
                    : "Not configured"}
                </Text>
              </View>

              {isLowInventory && (
                <View style={styles.lowStockWarning}>
                  <Text style={styles.lowStockWarningText}>
                    ⚠️ Low Supply Warning: Current count ({medicine.inventory}) is at or below
                    your refill threshold ({medicine.refillThreshold}). Please order a refill soon.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noSupplyText}>
              Supply tracking is not enabled for this medicine. You can edit this medicine to track inventory.
            </Text>
          )}
        </Card>

        {/* Metadata Card */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Record Information</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Added On:</Text>
            <Text style={styles.rowValue}>
              {new Date(medicine.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last Updated:</Text>
            <Text style={styles.rowValue}>
              {new Date(medicine.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        </Card>

        {/* Patient Actions: Edit & Delete */}
        {!isCaregiver ? (
          <View style={styles.actionButtonsContainer}>
            <Button
              title="Edit Medicine Details"
              onPress={() => onEdit(medicine)}
              variant="outline"
              style={styles.actionButton}
            />

            <Button
              title={isDeleting ? "Deleting..." : "Delete Medicine"}
              onPress={handleDeletePress}
              variant="danger"
              loading={isDeleting}
              style={styles.actionButton}
            />
          </View>
        ) : (
          <View style={styles.caregiverNotice}>
            <Text style={styles.caregiverNoticeText}>
              Caregiver accounts have read-only access to medication schedules.
            </Text>
          </View>
        )}
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
              Are you sure you want to permanently delete "{medicine.name}"? This action cannot be
              undone.
            </Text>
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => setShowConfirmModal(false)}
                variant="outline"
                style={styles.modalCancelButton}
              />
              <Button
                title="Delete"
                onPress={performDelete}
                variant="danger"
                style={styles.modalDeleteButton}
              />
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
    flex: 1,
    textAlign: "center",
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
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleInfo: {
    flex: 1,
  },
  medName: {
    ...typography.h1,
    color: colors.textPrimary,
    fontWeight: "800",
  },
  strengthText: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 2,
  },
  frequencyBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  },
  frequencyBadgeText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  rowValueBold: {
    ...typography.body,
    fontWeight: "700",
  },
  rowValueMuted: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  inStockText: {
    color: colors.taken,
  },
  lowStockText: {
    color: colors.skipped,
  },
  instructionsBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  instructionsTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  instructionsText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  lowStockWarning: {
    backgroundColor: colors.skippedLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.skipped,
  },
  lowStockWarningText: {
    ...typography.caption,
    color: colors.skipped,
    fontWeight: "600",
    lineHeight: 20,
  },
  noSupplyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  actionButtonsContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  actionButton: {
    width: "100%",
  },
  caregiverNotice: {
    backgroundColor: colors.secondaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  caregiverNoticeText: {
    ...typography.caption,
    color: colors.secondaryDark,
    textAlign: "center",
  },
  schedulesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  addTimeButton: {
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  loadingSchedulesText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },
  emptySchedulesBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: "center",
    marginVertical: spacing.xs,
  },
  emptySchedulesTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  emptySchedulesText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  setScheduleButton: {
    minWidth: 160,
  },
  schedulesList: {
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 400,
    elevation: 5,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
  },
  modalCancelButton: {
    flex: 1,
  },
  modalDeleteButton: {
    flex: 1,
  },
});
