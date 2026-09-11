/**
 * Medicine List Screen (Phase 4).
 * Displays accessible medication cards, inventory warnings, pull-to-refresh,
 * search/filter, and navigation to Detail and Add screens.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getMedicines } from "../../api/medicines";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { Medicine } from "../../types";

interface MedicineListScreenProps {
  onSelectMedicine: (medicine: Medicine) => void;
  onAddMedicine: () => void;
}

export const MedicineListScreen: React.FC<MedicineListScreenProps> = ({
  onSelectMedicine,
  onAddMedicine,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMedicines = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      if (isCaregiver) {
        // Caregiver role has no direct CRUD
        setMedicines([]);
        setIsLoading(false);
        return;
      }
      const data = await getMedicines();
      setMedicines(data.items || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to load prescribed medicines. Please check your network connection.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isCaregiver]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchMedicines(false);
  };

  const renderMedicineItem = ({ item }: { item: Medicine }) => {
    const isLowInventory =
      item.inventory !== undefined &&
      item.inventory !== null &&
      item.refillThreshold !== undefined &&
      item.refillThreshold !== null &&
      item.inventory <= item.refillThreshold;

    return (
      <TouchableOpacity
        onPress={() => onSelectMedicine(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${item.name}`}
      >
        <Card style={styles.medicineCard}>
          <View style={styles.cardHeader}>
            <View style={styles.nameContainer}>
              <Text style={styles.medicineName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.dosageBadge}>
                {item.dosage} {item.dosageUnit}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Frequency:</Text>
              <Text style={styles.detailValue}>{item.frequency}</Text>
            </View>

            {item.instructions ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Instructions:</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {item.instructions}
                </Text>
              </View>
            ) : null}

            {/* Inventory count & low stock warning badge */}
            <View style={styles.inventoryRow}>
              {item.inventory !== undefined && item.inventory !== null ? (
                <View
                  style={[
                    styles.inventoryBadge,
                    isLowInventory ? styles.inventoryLowBadge : styles.inventoryNormalBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.inventoryText,
                      isLowInventory ? styles.inventoryLowText : styles.inventoryNormalText,
                    ]}
                  >
                    {isLowInventory
                      ? `⚠️ Low Supply: ${item.inventory} left (Refill at ${item.refillThreshold})`
                      : `In Stock: ${item.inventory} units`}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noInventoryText}>Supply tracking not configured</Text>
              )}
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Medicines</Text>
          <Text style={styles.headerSubtitle}>
            {medicines.length} {medicines.length === 1 ? "medicine" : "medicines"} prescribed
          </Text>
        </View>

        {!isCaregiver && (
          <Button
            title="+ Add Medicine"
            onPress={onAddMedicine}
            variant="secondary"
            style={styles.addButton}
            textStyle={styles.addButtonText}
          />
        )}
      </View>

      {/* Caregiver Notice */}
      {isCaregiver && (
        <View style={styles.caregiverNotice}>
          <Text style={styles.caregiverNoticeTitle}>Caregiver Mode</Text>
          <Text style={styles.caregiverNoticeText}>
            Medicine management is managed exclusively by the patient. You have read-only access to adherence logs.
          </Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading your prescribed medicines..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchMedicines(true)} />
      ) : medicines.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No Medicines Added"
            description="Keep all your prescriptions organized in one secure place. Tap the button below to add your first medicine."
            actionTitle={isCaregiver ? undefined : "Add First Medicine"}
            onActionPress={isCaregiver ? undefined : onAddMedicine}
          />
        </View>
      ) : (
        <FlatList
          data={medicines}
          keyExtractor={(item) => item.id}
          renderItem={renderMedicineItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>⚠️ {config.medicalDisclaimer}</Text>
            </View>
          }
        />
      )}
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
        : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 2,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 38,
    minWidth: 120,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
  },
  addButtonText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  caregiverNotice: {
    backgroundColor: colors.secondaryLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
    padding: spacing.md,
    margin: spacing.md,
    borderRadius: borderRadius.md,
  },
  caregiverNoticeTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.secondaryDark,
    marginBottom: 2,
  },
  caregiverNoticeText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  listContent: {
    padding: spacing.md,
  },
  medicineCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  nameContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  medicineName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  dosageBadge: {
    ...typography.caption,
    backgroundColor: colors.primaryLight,
    color: colors.primaryDark,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
    fontWeight: "300",
    marginLeft: spacing.sm,
  },
  cardDetails: {
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  inventoryRow: {
    marginTop: spacing.xs,
  },
  inventoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  inventoryNormalBadge: {
    backgroundColor: colors.surfaceSubtle,
  },
  inventoryLowBadge: {
    backgroundColor: colors.skippedLight,
    borderWidth: 1,
    borderColor: colors.skipped,
  },
  inventoryText: {
    ...typography.small,
    fontWeight: "600",
  },
  inventoryNormalText: {
    color: colors.textSecondary,
  },
  inventoryLowText: {
    color: colors.skipped,
    fontWeight: "700",
  },
  noInventoryText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  disclaimerBox: {
    padding: spacing.md,
    marginTop: spacing.md,
    backgroundColor: "#FEF2F2",
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
