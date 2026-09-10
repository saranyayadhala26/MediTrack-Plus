/**
 * Caregiver Dashboard Screen (Phase 9.2.7).
 * Central hub for authenticated caregivers to view monitored patients,
 * inspect unread missed-dose alerts, and understand read-only permissions.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getCaregiverAlerts, getLinkedPatients } from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { LoadingState } from "../../components/common/LoadingState";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { LinkedPatient } from "../../types";

interface CaregiverDashboardScreenProps {
  onSelectPatient: (patient: LinkedPatient) => void;
  onViewAlerts: () => void;
}

export const CaregiverDashboardScreen: React.FC<CaregiverDashboardScreenProps> = ({
  onSelectPatient,
  onViewAlerts,
}) => {
  const { user, logout } = useAuth();
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);
      const [patientsData, alertsData] = await Promise.all([
        getLinkedPatients(),
        getCaregiverAlerts("unread").catch(() => []),
      ]);
      setPatients(patientsData || []);
      setUnreadAlertsCount(alertsData?.length || 0);
    } catch (err: any) {
      console.error("[CaregiverDashboard] Error fetching data:", err);
      const msg =
        err?.response?.data?.detail ||
        "Unable to load monitored patients. Please check your connection and try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  const handleLogoutPress = () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out of your Caregiver account?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return "N/A";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      {/* Caregiver Portal Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.appName}>MediTrack+</Text>
            <Text style={styles.screenTitle}>Caregiver Portal</Text>
            <Text style={styles.caregiverName}>
              Welcome, {user?.fullName || "Caregiver"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogoutPress}
            accessibilityRole="button"
            accessibilityLabel="Log out of caregiver account"
          >
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Role & Access Badge */}
        <View style={styles.badgeRow}>
          <View style={styles.caregiverBadge}>
            <Text style={styles.caregiverBadgeText}>
              ● Caregiver Account (Read-Only)
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {/* Prominent Read-Only Monitoring Access Notice */}
        <View style={styles.readOnlyBanner}>
          <View style={styles.bannerHeaderRow}>
            <Text style={styles.bannerIcon}>🛡️</Text>
            <Text style={styles.bannerTitle}>Read-Only Monitoring Access</Text>
          </View>
          <Text style={styles.bannerBody}>
            Your access is limited to viewing medication adherence, scheduled
            medication status, and caregiver alerts. You cannot add, edit, delete,
            or record medication activities.
          </Text>
        </View>

        {/* Medical Safety Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
          <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
        </View>

        {/* Unread Alerts Banner (if any) */}
        {unreadAlertsCount > 0 && (
          <TouchableOpacity
            style={styles.alertsBanner}
            onPress={onViewAlerts}
            accessibilityRole="button"
            accessibilityLabel={`You have ${unreadAlertsCount} unread missed-dose alerts. Tap to view.`}
          >
            <View style={styles.alertsBannerLeft}>
              <Text style={styles.alertsBannerIcon}>🔔</Text>
              <View>
                <Text style={styles.alertsBannerTitle}>
                  {unreadAlertsCount} Unread Missed-Dose Alert
                  {unreadAlertsCount > 1 ? "s" : ""}
                </Text>
                <Text style={styles.alertsBannerSub}>
                  Tap to view details and mark as read
                </Text>
              </View>
            </View>
            <Text style={styles.alertsBannerArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Monitored Patients Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Monitored Patients</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {patients.length} {patients.length === 1 ? "Patient" : "Patients"}
            </Text>
          </View>
        </View>

        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Loading monitored patients..." />
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to Load Patients</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button
              title="Try Again"
              onPress={loadDashboardData}
              variant="outline"
              style={styles.retryButton}
            />
          </Card>
        ) : patients.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No Patients Linked</Text>
            <Text style={styles.emptyDescription}>
              You are not currently monitoring any patients. When a MediTrack+
              patient links your email address (
              <Text style={styles.highlightText}>{user?.email}</Text>) as their
              caregiver, their profile will appear here automatically.
            </Text>
            <Button
              title="Refresh Patients"
              onPress={handleRefresh}
              variant="outline"
              style={styles.emptyRefreshBtn}
            />
          </Card>
        ) : (
          <View style={styles.patientsList}>
            {patients.map((patient) => (
              <Card key={patient.patientId} style={styles.patientCard}>
                <View style={styles.patientCardHeader}>
                  <View style={styles.patientAvatar}>
                    <Text style={styles.patientAvatarText}>
                      {patient.fullName
                        ? patient.fullName.charAt(0).toUpperCase()
                        : "P"}
                    </Text>
                  </View>
                  <View style={styles.patientMeta}>
                    <View style={styles.patientNameRow}>
                      <Text style={styles.patientName}>{patient.fullName}</Text>
                      <View style={styles.relationshipBadge}>
                        <Text style={styles.relationshipBadgeText}>
                          {patient.relationship}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.patientEmail}>{patient.email}</Text>
                  </View>
                </View>

                <View style={styles.patientDetails}>
                  {patient.emergencyContact ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Emergency Contact:</Text>
                      <Text style={styles.detailValue}>
                        {patient.emergencyContact}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Linked Since:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(patient.linkedAt)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Access Status:</Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        ● Active (Read-Only)
                      </Text>
                    </View>
                  </View>
                </View>

                <Button
                  title="View Monitoring Dashboard →"
                  onPress={() => onSelectPatient(patient)}
                  variant="primary"
                  style={styles.viewPatientBtn}
                />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + spacing.md
        : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTextContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  appName: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  screenTitle: {
    ...typography.h2,
    color: colors.surface,
    fontWeight: "700",
  },
  caregiverName: {
    ...typography.body,
    color: colors.surface,
    opacity: 0.95,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  logoutButtonText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: spacing.sm,
  },
  caregiverBadge: {
    backgroundColor: colors.surface,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  caregiverBadgeText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  readOnlyBanner: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 4,
  },
  bannerIcon: {
    fontSize: 18,
  },
  bannerTitle: {
    ...typography.body,
    fontWeight: "700",
    color: "#166534",
  },
  bannerBody: {
    ...typography.caption,
    color: "#166534",
    lineHeight: 18,
  },
  disclaimerBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  alertsBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alertsBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  alertsBannerIcon: {
    fontSize: 22,
  },
  alertsBannerTitle: {
    ...typography.body,
    fontWeight: "700",
    color: colors.error,
  },
  alertsBannerSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  alertsBannerArrow: {
    ...typography.h3,
    color: colors.error,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
  },
  errorCard: {
    padding: spacing.lg,
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderColor: colors.error,
    borderWidth: 1,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryButton: {
    minWidth: 140,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: "700",
  },
  emptyDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  highlightText: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  emptyRefreshBtn: {
    minWidth: 160,
  },
  patientsList: {
    gap: spacing.md,
  },
  patientCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  patientCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  patientAvatarText: {
    ...typography.h2,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  patientMeta: {
    flex: 1,
  },
  patientNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  patientName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    flex: 1,
  },
  relationshipBadge: {
    backgroundColor: colors.background,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  relationshipBadgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  patientEmail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  patientDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
    marginBottom: spacing.md,
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  statusPill: {
    backgroundColor: "#DCFCE7",
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPillText: {
    fontSize: 11,
    color: "#15803D",
    fontWeight: "700",
  },
  viewPatientBtn: {
    marginTop: spacing.xs,
  },
});
