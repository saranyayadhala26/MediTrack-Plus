/**
 * Authenticated Dashboard / Home Screen for MediTrack+
 */

import React from "react";
import { AdherenceSummaryCard } from "../../components/adherence/AdherenceSummaryCard";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { NotificationStatusCard } from "../../components/notifications/NotificationStatusCard";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

interface HomeScreenProps {
  onNavigateToMedicines?: (subScreen?: "list" | "add") => void;
  onNavigateToCaregivers?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToReports?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateToMedicines,
  onNavigateToCaregivers,
  onNavigateToProfile,
  onNavigateToReports,
}) => {
  const { user, logout, refreshProfile } = useAuth();

  const isCaregiver = user?.role === "caregiver";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.fullName || "User"}</Text>
          </View>
          <TouchableOpacity
            style={styles.profileHeaderButton}
            onPress={() => onNavigateToProfile?.()}
            accessibilityRole="button"
            accessibilityLabel="Open user profile and settings"
          >
            <Text style={styles.profileHeaderButtonText}>👤 Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Role Badge */}
        <View
          style={[
            styles.roleBadge,
            isCaregiver ? styles.caregiverBadge : styles.patientBadge,
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              isCaregiver ? styles.caregiverBadgeText : styles.patientBadgeText,
            ]}
          >
            ● {isCaregiver ? "Caregiver Account (Read-Only)" : "Primary Patient Account"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Medical Safety Notice */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
          <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
        </View>

        {/* Prescription Management Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>My Prescriptions</Text>
          <Text style={styles.cardDescription}>
            {isCaregiver
              ? "View medication adherence logs for your linked patient (read-only)."
              : "Keep track of your prescribed medications, dosage schedules, and supply refill levels."}
          </Text>

          <View style={styles.actionRow}>
            <Button
              title="View Medicines"
              onPress={() => onNavigateToMedicines?.("list")}
              variant="primary"
              style={styles.medicineActionButton}
            />
            {!isCaregiver && (
              <Button
                title="+ Add Medicine"
                onPress={() => onNavigateToMedicines?.("add")}
                variant="outline"
                style={styles.medicineActionButton}
              />
            )}
          </View>
        </Card>

        {!isCaregiver && <AdherenceSummaryCard />}

        {/* Phase 6: Local Medication Reminders & Alerts */}
        <NotificationStatusCard />

        {/* Phase 11: Medication Adherence Reports */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>📊 Adherence Reports</Text>
          <Text style={styles.cardDescription}>
            {isCaregiver
              ? "View weekly and monthly adherence reports and download clinical PDFs for monitored patients."
              : "Review weekly and monthly medication adherence summaries, track streaks, and download clinical PDFs."}
          </Text>
          <Button
            title="📊 View Adherence Reports"
            onPress={() => onNavigateToReports?.()}
            variant="primary"
            style={styles.reportsButton}
          />
        </Card>

        {/* Phase 9.2.6: Caregiver Access & Monitoring Card */}
        {!isCaregiver && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Caregiver Access</Text>
            <Text style={styles.cardDescription}>
              Allow trusted family members or caregivers to monitor your medication adherence with
              secure, read-only access.
            </Text>
            <Button
              title="👥 Manage Caregivers"
              onPress={() => onNavigateToCaregivers?.()}
              variant="outline"
              style={styles.caregiverButton}
            />
          </Card>
        )}

        {/* Account Profile Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Account Profile</Text>
          <View style={styles.profileRow}>
            <Text style={styles.label}>Email Address:</Text>
            <Text style={styles.value}>{user?.email}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.label}>Role:</Text>
            <Text style={styles.value}>
              {user?.role === "caregiver" ? "Caregiver (Monitoring)" : "Primary Patient"}
            </Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.label}>Emergency Contact:</Text>
            <Text style={styles.value}>{user?.emergencyContact || "Not configured"}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.label}>Token Storage:</Text>
            <Text style={styles.valueSuccess}>Hardware-Backed SecureStore</Text>
          </View>

          <View style={styles.profileActionRow}>
            <Button
              title="Edit Profile & Settings"
              onPress={() => onNavigateToProfile?.()}
              variant="primary"
              style={styles.profileActionButton}
            />
            <Button
              title="Refresh"
              onPress={refreshProfile}
              variant="outline"
              style={styles.profileRefreshButton}
            />
          </View>
        </Card>

        {/* Prescription Safety & Privacy Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Prescription Safety & Privacy</Text>
          <Text style={styles.cardDescription}>
            MediTrack+ keeps your daily schedule secure, synchronized, and private.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>✓ Strict personal data privacy & isolation</Text>
            <Text style={styles.bulletItem}>✓ Automated low supply & refill alerts</Text>
            <Text style={styles.bulletItem}>✓ High-priority intake alarm reminders</Text>
            <Text style={styles.bulletItem}>✓ Verified clinical tracking & adherence logs</Text>
          </View>
        </Card>

        {/* Logout Button */}
        <Button
          title="Sign Out"
          onPress={logout}
          variant="danger"
          style={styles.logoutButton}
        />
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
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + spacing.md
        : spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  greetingContainer: {
    flex: 1,
  },
  profileHeaderButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  profileHeaderButtonText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: "700",
  },
  greeting: {
    ...typography.body,
    color: colors.primaryLight,
  },
  userName: {
    ...typography.h1,
    color: colors.textInverse,
    fontWeight: "800",
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  patientBadge: {
    backgroundColor: colors.primaryLight,
  },
  caregiverBadge: {
    backgroundColor: colors.secondaryLight,
  },
  roleBadgeText: {
    ...typography.caption,
    fontWeight: "700",
  },
  patientBadgeText: {
    color: colors.primaryDark,
  },
  caregiverBadgeText: {
    color: colors.secondaryDark,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  disclaimerBox: {
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
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
  card: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.body,
    color: colors.textMuted,
  },
  value: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  valueSuccess: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.taken,
  },
  bulletList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  bulletItem: {
    ...typography.body,
    color: colors.textSecondary,
  },
  refreshButton: {
    marginTop: spacing.md,
  },
  profileActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  profileActionButton: {
    flex: 1.6,
  },
  profileRefreshButton: {
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  medicineActionButton: {
    flex: 1,
  },
  logoutButton: {
    marginVertical: spacing.lg,
  },
  caregiverButton: {
    marginTop: spacing.xs,
  },
  reportsButton: {
    marginTop: spacing.sm,
  },
});
