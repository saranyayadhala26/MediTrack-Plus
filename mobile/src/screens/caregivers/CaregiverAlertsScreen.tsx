/**
 * Caregiver Alerts Screen (Phase 9.2.7).
 * Displays missed-dose alert notifications for all linked patients.
 * Allows caregivers to filter by unread status and mark unread alerts as read.
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
import { getCaregiverAlerts, markCaregiverAlertRead } from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { LoadingState } from "../../components/common/LoadingState";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { CaregiverNotificationAlert } from "../../types";

interface CaregiverAlertsScreenProps {
  initialPatientId?: string | null;
}

export const CaregiverAlertsScreen: React.FC<CaregiverAlertsScreenProps> = ({
  initialPatientId,
}) => {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [alerts, setAlerts] = useState<CaregiverNotificationAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const statusParam = filter === "unread" ? "unread" : undefined;
      const data = await getCaregiverAlerts(
        statusParam,
        initialPatientId || undefined
      );
      setAlerts(data || []);
    } catch (err: any) {
      console.error("[CaregiverAlerts] Error fetching alerts:", err);
      const msg =
        err?.response?.data?.detail ||
        "Unable to load caregiver alerts. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter, initialPatientId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAlerts();
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      setMarkingId(alertId);
      const updated = await markCaregiverAlertRead(alertId);
      // Update locally immediately without full screen reload
      setAlerts((prev) =>
        prev.map((item) =>
          item.id === alertId ? { ...item, status: "read" } : item
        )
      );
    } catch (err: any) {
      console.error("[CaregiverAlerts] Error marking alert as read:", err);
      Alert.alert(
        "Update Failed",
        err?.response?.data?.detail || "Could not mark alert as read. Please try again."
      );
    } finally {
      setMarkingId(null);
    }
  };

  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return (
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }) +
        " at " +
        d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch {
      return isoString;
    }
  };

  const unreadCount = alerts.filter((a) => a.status === "unread").length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Caregiver Alerts</Text>
        <Text style={styles.headerSubtitle}>
          Missed-dose notifications for your monitored patients
        </Text>

        {/* Filter Toggle Buttons */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filter === "all" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("all")}
            accessibilityRole="button"
            accessibilityLabel="Show all alerts"
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === "all" && styles.filterButtonTextActive,
              ]}
            >
              All Alerts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              filter === "unread" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("unread")}
            accessibilityRole="button"
            accessibilityLabel={`Show unread alerts only, ${unreadCount} unread`}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === "unread" && styles.filterButtonTextActive,
              ]}
            >
              Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
            </Text>
          </TouchableOpacity>
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
        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Loading caregiver alerts..." />
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to Load Alerts</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button
              title="Try Again"
              onPress={fetchAlerts}
              variant="outline"
              style={styles.retryBtn}
            />
          </Card>
        ) : alerts.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>
              {filter === "unread" ? "No Unread Alerts" : "No Alerts Recorded"}
            </Text>
            <Text style={styles.emptyDescription}>
              {filter === "unread"
                ? "All missed-dose notifications have been marked as read."
                : "No missed-dose alerts have been generated. Scheduled doses for your linked patients are being tracked."}
            </Text>
            {filter === "unread" && (
              <Button
                title="View All Alerts"
                onPress={() => setFilter("all")}
                variant="outline"
                style={styles.emptyBtn}
              />
            )}
          </Card>
        ) : (
          <View style={styles.alertsList}>
            {alerts.map((item) => {
              const isUnread = item.status === "unread";
              const isMarking = markingId === item.id;
              const medName = item.metadata?.medicineName;
              const scheduledTime = item.metadata?.scheduledTime;
              const ruleType = item.metadata?.ruleType;

              return (
                <Card
                  key={item.id}
                  style={[
                    styles.alertCard,
                    isUnread ? styles.alertCardUnread : styles.alertCardRead,
                  ]}
                >
                  <View style={styles.alertCardTop}>
                    <View style={styles.titleArea}>
                      <Text style={styles.alertItemTitle}>{item.title}</Text>
                      <Text style={styles.alertTimestamp}>
                        {formatTimestamp(item.createdAt)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        isUnread
                          ? styles.statusBadgeUnread
                          : styles.statusBadgeRead,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isUnread
                            ? styles.statusBadgeTextUnread
                            : styles.statusBadgeTextRead,
                        ]}
                      >
                        {isUnread ? "UNREAD" : "READ"}
                      </Text>
                    </View>
                  </View>

                  {/* Metadata Row */}
                  {(medName || scheduledTime) && (
                    <View style={styles.metaRow}>
                      {medName ? (
                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>💊 {medName}</Text>
                        </View>
                      ) : null}
                      {scheduledTime ? (
                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>
                            ⏰ {scheduledTime}
                          </Text>
                        </View>
                      ) : null}
                      {ruleType ? (
                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>
                            Rule: {ruleType}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* Alert Message Body */}
                  <Text style={styles.alertMessageText}>{item.message}</Text>

                  {/* Mark as Read Button */}
                  {isUnread && (
                    <TouchableOpacity
                      style={styles.markReadButton}
                      onPress={() => handleMarkAsRead(item.id)}
                      disabled={isMarking}
                      accessibilityRole="button"
                      accessibilityLabel="Mark this alert as read"
                    >
                      {isMarking ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.markReadButtonText}>
                          ✓ Mark as Read
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </Card>
              );
            })}
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
  headerTitle: {
    ...typography.h2,
    color: colors.surface,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.surface,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: borderRadius.md,
    padding: 3,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: borderRadius.sm,
  },
  filterButtonActive: {
    backgroundColor: colors.surface,
  },
  filterButtonText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.surface,
  },
  filterButtonTextActive: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    paddingVertical: spacing.xxl,
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
  retryBtn: {
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
    marginBottom: spacing.md,
  },
  emptyBtn: {
    minWidth: 140,
  },
  alertsList: {
    gap: spacing.sm,
  },
  alertCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  alertCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    backgroundColor: "#FFFDFD",
  },
  alertCardRead: {
    borderLeftWidth: 4,
    borderLeftColor: colors.borderLight,
    opacity: 0.85,
  },
  alertCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  alertItemTitle: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  alertTimestamp: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  statusBadgeUnread: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeRead: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadgeTextUnread: {
    color: colors.error,
  },
  statusBadgeTextRead: {
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  metaChip: {
    backgroundColor: colors.background,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  metaChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  alertMessageText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  markReadButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  markReadButtonText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryDark,
  },
});
