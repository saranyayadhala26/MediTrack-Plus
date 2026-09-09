import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from "react-native";
import { colors, typography, spacing, borderRadius } from "./src/constants/theme";
import { config } from "./src/constants/config";
import { apiClient } from "./src/api/client";
import { Card } from "./src/components/common/Card";
import { Button } from "./src/components/common/Button";

interface HealthData {
  status: string;
  version: string;
  environment: string;
  database_connected: boolean;
  medical_disclaimer: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkBackendHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get("/health");
      setHealth(response.data);
    } catch (err: any) {
      setError(
        err.message || "Could not connect to FastAPI backend. Ensure server is running on " + config.apiBaseUrl
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>MediTrack+</Text>
        <Text style={styles.tagline}>Smart Medication Management & Adherence</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Medical Safety Rule Notice */}
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
          <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
        </View>

        {/* Phase 1 Scaffolding Status Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Phase 1 Setup: Architecture & Scaffolding</Text>
          <Text style={styles.cardSubtitle}>
            Clean three-layer architecture initialized:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>✓ Mobile App: React Native + Expo SDK 52 (TypeScript)</Text>
            <Text style={styles.bulletItem}>✓ REST API: FastAPI + Pydantic v2 (Python 3.13)</Text>
            <Text style={styles.bulletItem}>✓ Database: MongoDB Atlas Async Client (PyMongo Async)</Text>
            <Text style={styles.bulletItem}>✓ Security: Hardware-Backed SecureStore & PyJWT</Text>
            <Text style={styles.bulletItem}>✓ Accessible Design Tokens & High-Contrast Layout</Text>
          </View>
        </Card>

        {/* Backend Connectivity Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Backend Connectivity Status</Text>
          <Text style={styles.configUrl}>API Target: {config.apiBaseUrl}</Text>

          {loading ? (
            <Text style={styles.statusText}>Testing connection to FastAPI...</Text>
          ) : error ? (
            <View style={styles.statusBoxError}>
              <Text style={styles.statusTextError}>Connection Offline / Pending</Text>
              <Text style={styles.statusDetailError}>{error}</Text>
            </View>
          ) : health ? (
            <View style={styles.statusBoxSuccess}>
              <Text style={styles.statusTextSuccess}>● Backend Online ({health.status})</Text>
              <Text style={styles.statusDetail}>Version: v{health.version}</Text>
              <Text style={styles.statusDetail}>Environment: {health.environment}</Text>
              <Text style={styles.statusDetail}>
                Database: {health.database_connected ? "Connected" : "Atlas Standby"}
              </Text>
            </View>
          ) : null}

          <Button
            title="Refresh Backend Status"
            onPress={checkBackendHealth}
            variant="primary"
            loading={loading}
            style={styles.refreshButton}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  appName: {
    ...typography.h1,
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
  tagline: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: spacing.xs,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  disclaimerContainer: {
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
    marginBottom: spacing.xs,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  bulletList: {
    gap: spacing.xs,
  },
  bulletItem: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  configUrl: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  statusBoxSuccess: {
    backgroundColor: colors.takenLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  statusTextSuccess: {
    ...typography.body,
    fontWeight: "700",
    color: colors.taken,
  },
  statusDetail: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBoxError: {
    backgroundColor: colors.skippedLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  statusTextError: {
    ...typography.body,
    fontWeight: "700",
    color: colors.skipped,
  },
  statusDetailError: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusText: {
    ...typography.body,
    color: colors.textSecondary,
    marginVertical: spacing.md,
  },
  refreshButton: {
    marginTop: spacing.sm,
  },
});
