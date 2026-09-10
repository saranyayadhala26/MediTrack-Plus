/**
 * Patient Caregiver Management Screen (Phase 9.1 / Phase 9.2.6).
 *
 * Senior-friendly, accessible UI for authenticated patients to:
 * 1. View all active linked caregivers.
 * 2. Link a registered caregiver account with inline validation and backend error handling.
 * 3. Soft-revoke an active caregiver with a confirmation dialog.
 * 4. Clearly understand that caregivers hold read-only monitoring access.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createCaregiver, getCaregivers, revokeCaregiver } from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { Input } from "../../components/common/Input";
import { LoadingState } from "../../components/common/LoadingState";
import {
  accessibility,
  borderRadius,
  colors,
  spacing,
  typography,
} from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { Caregiver, CaregiverCreatePayload } from "../../types";

interface CaregiverManagementScreenProps {
  onBack?: () => void;
}

const RELATIONSHIP_PRESETS = [
  "Daughter",
  "Son",
  "Spouse",
  "Nurse",
  "Physician",
  "Family Member",
];

export const CaregiverManagementScreen: React.FC<CaregiverManagementScreenProps> = ({
  onBack,
}) => {
  const { user } = useAuth();
  const isPatient = user?.role === "patient" || !user?.role;

  // List State
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Modal & Form State
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [caregiverName, setCaregiverName] = useState<string>("");
  const [caregiverEmail, setCaregiverEmail] = useState<string>("");
  const [caregiverPhone, setCaregiverPhone] = useState<string>("");
  const [relationship, setRelationship] = useState<string>("");

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Fetch active caregivers
  const fetchCaregivers = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setListError(null);
    try {
      if (!isPatient) {
        setCaregivers([]);
        setIsLoading(false);
        return;
      }
      // Filter for active caregivers per Phase 9.1 API
      const data = await getCaregivers("active");
      setCaregivers(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to load caregivers. Please check your connection.";
      setListError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isPatient]);

  useEffect(() => {
    fetchCaregivers();
  }, [fetchCaregivers]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchCaregivers(false);
  };

  // Reset form inputs
  const resetForm = () => {
    setCaregiverName("");
    setCaregiverEmail("");
    setCaregiverPhone("");
    setRelationship("");
    setFormErrors({});
    setServerError(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    resetForm();
    setIsModalVisible(false);
  };

  // Client-side validation
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!caregiverName.trim()) {
      errs.caregiverName = "Caregiver full name is required.";
    } else if (caregiverName.trim().length < 2) {
      errs.caregiverName = "Name must be at least 2 characters.";
    }

    const emailTrimmed = caregiverEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailTrimmed) {
      errs.caregiverEmail = "Caregiver email is required.";
    } else if (!emailRegex.test(emailTrimmed)) {
      errs.caregiverEmail = "Please enter a valid email address.";
    }

    const phoneTrimmed = caregiverPhone.trim();
    if (!phoneTrimmed) {
      errs.caregiverPhone = "Caregiver phone number is required.";
    } else if (phoneTrimmed.length < 5) {
      errs.caregiverPhone = "Phone number must be at least 5 digits.";
    }

    if (!relationship.trim()) {
      errs.relationship = "Relationship to patient is required.";
    } else if (relationship.trim().length < 2) {
      errs.relationship = "Relationship must be at least 2 characters.";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Form Submission
  const handleSubmitCaregiver = async () => {
    setServerError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload: CaregiverCreatePayload = {
        caregiverName: caregiverName.trim(),
        caregiverEmail: caregiverEmail.trim().toLowerCase(),
        caregiverPhone: caregiverPhone.trim(),
        relationship: relationship.trim(),
      };

      const result = await createCaregiver(payload);
      handleCloseModal();

      Alert.alert(
        "Caregiver Linked",
        `"${result.caregiverName}" has been successfully linked as your caregiver with read-only monitoring access.`,
        [{ text: "OK", onPress: () => fetchCaregivers(false) }]
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to link caregiver. Please try again.";
      setServerError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Revoke Access with Confirmation Dialog
  const handleConfirmRevoke = (caregiver: Caregiver) => {
    Alert.alert(
      "Revoke Caregiver Access",
      `Are you sure you want to revoke access for ${caregiver.caregiverName} (${caregiver.caregiverEmail})?\n\nThey will immediately lose read-only access to view your medication adherence.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke Access",
          style: "destructive",
          onPress: () => performRevoke(caregiver),
        },
      ]
    );
  };

  const performRevoke = async (caregiver: Caregiver) => {
    setRevokingId(caregiver.id);
    try {
      await revokeCaregiver(caregiver.id);
      Alert.alert(
        "Access Revoked",
        `Caregiver access for ${caregiver.caregiverName} has been revoked.`
      );
      fetchCaregivers(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to revoke caregiver access. Please try again.";
      Alert.alert("Revocation Failed", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setRevokingId(null);
    }
  };

  // Render Caregiver Item Card
  const renderCaregiverItem = ({ item }: { item: Caregiver }) => {
    const isRevoking = revokingId === item.id;
    const formattedDate = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Recently";

    return (
      <Card style={styles.caregiverCard}>
        {/* Card Top Row: Name & Status */}
        <View style={styles.cardHeader}>
          <View style={styles.nameContainer}>
            <Text style={styles.caregiverName} numberOfLines={1}>
              {item.caregiverName}
            </Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeDot}>●</Text>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>
        </View>

        {/* Details Grid */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Relationship:</Text>
            <Text style={styles.detailValue}>{item.relationship}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email:</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {item.caregiverEmail}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Phone:</Text>
            <Text style={styles.detailValue}>{item.caregiverPhone}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Linked Date:</Text>
            <Text style={styles.detailValueMuted}>{formattedDate}</Text>
          </View>
        </View>

        {/* Read-Only Permission Scope Note */}
        <View style={styles.scopeNoticeBox}>
          <Text style={styles.scopeNoticeIcon}>🛡️</Text>
          <Text style={styles.scopeNoticeText}>
            {item.permissionsNote ||
              "Permitted: Read-only adherence monitoring. Cannot modify prescriptions or schedules."}
          </Text>
        </View>

        {/* Revoke Button */}
        <Button
          title={isRevoking ? "Revoking..." : "Revoke Access"}
          onPress={() => handleConfirmRevoke(item)}
          variant="outline"
          disabled={isRevoking}
          loading={isRevoking}
          style={styles.revokeButton}
          textStyle={styles.revokeButtonText}
        />
      </Card>
    );
  };

  // If user is caregiver role, show explanatory notice
  if (!isPatient) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>‹ Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Caregiver Management</Text>
        </View>
        <View style={styles.emptyContainer}>
          <EmptyState
            title="Patient Account Required"
            description="You are currently signed in with a Caregiver account. Caregiver linking and revocation are managed directly by patients."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backButtonText}>‹ Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Caregivers</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Manage trusted family & caregivers who monitor your adherence
        </Text>
      </View>

      {/* Body Content */}
      <View style={styles.body}>
        {/* Read-Only Notice Banner */}
        <View style={styles.bannerNotice}>
          <View style={styles.bannerIconContainer}>
            <Text style={styles.bannerIcon}>🛡️</Text>
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Read-Only Monitoring Access</Text>
            <Text style={styles.bannerDescription}>
              Caregivers can view your adherence logs and receive missed-dose alerts.
              Caregivers CANNOT modify, add, or delete your prescriptions or schedules.
            </Text>
          </View>
        </View>

        {/* Action Header */}
        <View style={styles.actionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Linked Caregivers</Text>
            <Text style={styles.sectionCount}>
              {caregivers.length} {caregivers.length === 1 ? "Caregiver" : "Caregivers"} Active
            </Text>
          </View>
          <Button
            title="+ Link Caregiver"
            onPress={handleOpenModal}
            variant="primary"
            style={styles.addCaregiverButton}
          />
        </View>

        {/* Main List States */}
        {isLoading ? (
          <LoadingState message="Loading your caregivers..." />
        ) : listError ? (
          <ErrorState message={listError} onRetry={() => fetchCaregivers(true)} />
        ) : caregivers.length === 0 ? (
          <EmptyState
            title="No Caregivers Linked"
            description="You currently have no active caregivers. Link a trusted family member or caregiver so they can monitor your adherence and receive alerts if you miss doses."
            actionTitle="+ Link Caregiver"
            onActionPress={handleOpenModal}
          />
        ) : (
          <FlatList
            data={caregivers}
            keyExtractor={(item) => item.id}
            renderItem={renderCaregiverItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          />
        )}
      </View>

      {/* Add Caregiver Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleCloseModal}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Link a Caregiver</Text>
                <Text style={styles.modalSubtitle}>
                  Grant read-only medication monitoring access
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close form"
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Informational Guidance Box */}
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxTitle}>ℹ️ Important Prerequisite</Text>
                <Text style={styles.infoBoxText}>
                  Your caregiver must already have registered an account with the{" "}
                  <Text style={styles.boldText}>Caregiver</Text> role in MediTrack+ using
                  their email address before you can link them.
                </Text>
              </View>

              {/* Server Error Alert Banner */}
              {serverError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>⚠️ Unable to Link Caregiver</Text>
                  <Text style={styles.errorBannerText}>{serverError}</Text>
                </View>
              )}

              {/* Caregiver Name */}
              <Input
                label="Caregiver Full Name *"
                placeholder="e.g. Dr. John Smith or Sarah Doe"
                value={caregiverName}
                onChangeText={setCaregiverName}
                error={formErrors.caregiverName}
                autoCapitalize="words"
              />

              {/* Caregiver Email */}
              <Input
                label="Caregiver Email Address *"
                placeholder="caregiver@example.com"
                value={caregiverEmail}
                onChangeText={setCaregiverEmail}
                error={formErrors.caregiverEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                helperText="Must match their registered MediTrack+ caregiver account."
              />

              {/* Caregiver Phone */}
              <Input
                label="Caregiver Phone Number *"
                placeholder="e.g. +1-555-0144"
                value={caregiverPhone}
                onChangeText={setCaregiverPhone}
                error={formErrors.caregiverPhone}
                keyboardType="phone-pad"
              />

              {/* Relationship Input */}
              <Input
                label="Relationship to You *"
                placeholder="e.g. Daughter, Son, Nurse, Physician"
                value={relationship}
                onChangeText={setRelationship}
                error={formErrors.relationship}
              />

              {/* Quick Relationship Chips */}
              <Text style={styles.presetLabel}>Quick Select Relationship:</Text>
              <View style={styles.presetsRow}>
                {RELATIONSHIP_PRESETS.map((preset) => {
                  const isSelected = relationship.toLowerCase() === preset.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setRelationship(preset)}
                      style={[
                        styles.presetChip,
                        isSelected && styles.presetChipSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select relationship ${preset}`}
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

              {/* Notice Reminder */}
              <View style={styles.permissionDisclaimer}>
                <Text style={styles.disclaimerText}>
                  🛡️ <Text style={styles.boldText}>Security Note:</Text> Caregivers will only
                  receive read-only adherence data. They can never modify your prescriptions,
                  schedules, or medical profile.
                </Text>
              </View>

              {/* Action Buttons */}
              <Button
                title={isSubmitting ? "Linking Caregiver..." : "Link Caregiver"}
                onPress={handleSubmitCaregiver}
                variant="primary"
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
              />

              <Button
                title="Cancel"
                onPress={handleCloseModal}
                variant="outline"
                disabled={isSubmitting}
                style={styles.cancelButton}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    minHeight: accessibility.minTouchTarget,
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.h3,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerTitle: {
    ...typography.h1,
    color: colors.textInverse,
    fontWeight: "800",
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 2,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bannerNotice: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  bannerIconContainer: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  bannerIcon: {
    fontSize: 20,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: 2,
  },
  bannerDescription: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionCount: {
    ...typography.small,
    color: colors.textMuted,
  },
  addCaregiverButton: {
    minHeight: 42,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  caregiverCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  caregiverName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    flex: 1,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.takenLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  activeBadgeDot: {
    color: colors.taken,
    fontSize: 10,
    marginRight: 4,
  },
  activeBadgeText: {
    ...typography.small,
    color: colors.taken,
    fontWeight: "700",
  },
  detailsContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "500",
  },
  detailValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
    maxWidth: "65%",
    textAlign: "right",
  },
  detailValueMuted: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "500",
  },
  scopeNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  scopeNoticeIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  scopeNoticeText: {
    ...typography.small,
    color: colors.taken,
    fontWeight: "600",
    flex: 1,
  },
  revokeButton: {
    borderColor: colors.danger,
    minHeight: 44,
  },
  revokeButtonText: {
    color: colors.danger,
    ...typography.caption,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "center",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  modalSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: spacing.xs,
    minHeight: accessibility.minTouchTarget,
    minWidth: accessibility.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: "700",
  },
  modalScrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  infoBox: {
    backgroundColor: colors.secondaryLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoBoxTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.secondaryDark,
    marginBottom: 4,
  },
  infoBoxText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.error,
    marginBottom: 2,
  },
  errorBannerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  presetLabel: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  presetChip: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  presetChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  presetChipText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  presetChipTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  permissionDisclaimer: {
    backgroundColor: "#F0FDF4",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  submitButton: {
    marginBottom: spacing.md,
  },
  cancelButton: {
    marginBottom: spacing.lg,
  },
});
