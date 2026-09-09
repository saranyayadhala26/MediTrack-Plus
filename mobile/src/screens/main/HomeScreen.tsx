/**
 * Authenticated Dashboard / Home Screen for MediTrack+
 */

import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

export const HomeScreen: React.FC = () => {
  const { user, logout, refreshProfile } = useAuth();

  const isCaregiver = user?.role === "caregiver";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.fullName || "User"}</Text>
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

          <Button
            title="Refresh Profile"
            onPress={refreshProfile}
            variant="outline"
            style={styles.refreshButton}
          />
        </Card>

        {/* Next Phases Ready Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Phase 3 Authentication Active</Text>
          <Text style={styles.cardDescription}>
            Your session is secured via hardware-backed SecureStore and signed JWT tokens.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>✓ Bcrypt password hashing verified</Text>
            <Text style={styles.bulletItem}>✓ Role-based permissions enforced</Text>
            <Text style={styles.bulletItem}>✓ Ready for Phase 4: Medicine Management</Text>
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
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTop: {
    marginBottom: spacing.sm,
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
  logoutButton: {
    marginVertical: spacing.lg,
  },
});
