/**
 * Medicine List Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMedicationActivities } from "../../api/activities";
import { getMedicines } from "../../api/medicines";
import { getSchedules } from "../../api/schedules";
import { useAuth } from "../../context/AuthContext";
import { MedicationActivity, MedicationSchedule, Medicine } from "../../types";
import { EmptyState, ErrorState, LoadingState } from "../../components/common";

interface MedicineListScreenProps {
  onSelectMedicine: (medicine: Medicine) => void;
  onAddMedicine: () => void;
}

type FilterTab = "All" | "Active" | "Low stock" | "Out of stock";

function formatScheduleTime(timeStr?: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(min)) return timeStr;
  const ampm = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  const formattedMin = String(min).padStart(2, "0");
  return `${formattedHour}:${formattedMin} ${ampm}`;
}

export const MedicineListScreen: React.FC<MedicineListScreenProps> = ({
  onSelectMedicine,
  onAddMedicine,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [todayActivities, setTodayActivities] = useState<MedicationActivity[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("All");

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split("T")[0];

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      setError(null);
      try {
        if (isCaregiver) {
          setMedicines([]);
          setSchedules([]);
          setIsLoading(false);
          return;
        }

        const [medRes, schedRes, actRes] = await Promise.allSettled([
          getMedicines(),
          getSchedules(),
          getMedicationActivities({ startDate: todayStr, endDate: todayStr }),
        ]);

        if (medRes.status === "fulfilled") {
          setMedicines(medRes.value.items || []);
        } else {
          const err: any = medRes.reason;
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              "Unable to load prescribed medicines."
          );
        }

        if (schedRes.status === "fulfilled") {
          setSchedules(schedRes.value.items || []);
        }

        if (actRes.status === "fulfilled") {
          setTodayActivities(actRes.value || []);
        }
      } catch (err: any) {
        setError(err?.message || "Unable to load data.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isCaregiver, todayStr]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData(false);
  };

  // Filter & Search Logic
  const filteredMedicines = medicines.filter((med) => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = med.name?.toLowerCase().includes(q);
      const instructionsMatch = med.instructions?.toLowerCase().includes(q);
      if (!nameMatch && !instructionsMatch) return false;
    }

    // 2. Filter Tab
    const isOutOfStock =
      med.inventory !== undefined && med.inventory !== null && med.inventory <= 0;
    const isLowStock =
      !isOutOfStock &&
      med.inventory !== undefined &&
      med.inventory !== null &&
      med.refillThreshold !== undefined &&
      med.refillThreshold !== null &&
      med.inventory <= med.refillThreshold;

    if (selectedFilter === "Out of stock") {
      return isOutOfStock;
    }
    if (selectedFilter === "Low stock") {
      return isLowStock;
    }
    if (selectedFilter === "Active") {
      return !isOutOfStock;
    }
    return true;
  });

  const renderMedicineItem = ({ item }: { item: Medicine }) => {
    const isOutOfStock =
      item.inventory !== undefined && item.inventory !== null && item.inventory <= 0;
    const isLowStock =
      !isOutOfStock &&
      item.inventory !== undefined &&
      item.inventory !== null &&
      item.refillThreshold !== undefined &&
      item.refillThreshold !== null &&
      item.inventory <= item.refillThreshold;

    // Associated Schedules
    const medSchedules = schedules.filter(
      (s) => s.medicineId === item.id && s.enabled !== false
    );
    const sortedSchedules = [...medSchedules].sort((a, b) =>
      (a.time || "").localeCompare(b.time || "")
    );

    const currentTimeStr = `${String(todayDate.getHours()).padStart(2, "0")}:${String(
      todayDate.getMinutes()
    ).padStart(2, "0")}`;

    const upcomingSched = sortedSchedules.find((s) => (s.time || "") >= currentTimeStr);
    const nextSched = upcomingSched || sortedSchedules[0];
    const nextDoseTime = nextSched ? formatScheduleTime(nextSched.time) : null;

    // Status Pill determination
    let statusText:
      | "Upcoming"
      | "Pending"
      | "Taken"
      | "Low stock"
      | "Out of stock"
      | "Active" = "Active";

    if (isOutOfStock) {
      statusText = "Out of stock";
    } else if (isLowStock) {
      statusText = "Low stock";
    } else {
      const isTakenToday = todayActivities.some(
        (a) => a.medicineId === item.id && a.action === "Taken"
      );
      if (isTakenToday) {
        statusText = "Taken";
      } else if (nextSched) {
        if ((nextSched.time || "") < currentTimeStr) {
          statusText = "Pending";
        } else {
          statusText = "Upcoming";
        }
      } else {
        statusText = "Active";
      }
    }

    return (
      <TouchableOpacity
        onPress={() => onSelectMedicine(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${item.name}`}
      >
        <View style={styles.medicineCard}>
          {/* Top Row: Icon + Name/Dosage/Freq + Status Pill & Chevron */}
          <View style={styles.cardTopRow}>
            {/* Left: Medicine Icon Container */}
            <View style={styles.medicineIconBox}>
              <Ionicons name="medkit-outline" size={22} color="#0D9488" />
            </View>

            {/* Center: Details */}
            <View style={styles.medicineInfoCol}>
              <Text style={styles.medicineName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.medicineDosage} numberOfLines={1}>
                {item.dosage} {item.dosageUnit ? `• 1 ${item.dosageUnit}` : ""}
              </Text>
              <Text style={styles.medicineFrequency} numberOfLines={1}>
                {item.frequency || "Daily"}
              </Text>
            </View>

            {/* Right: Status Pill & Chevron */}
            <View style={styles.cardRightCol}>
              <View
                style={[
                  styles.statusPill,
                  statusText === "Upcoming"
                    ? styles.statusPillUpcoming
                    : statusText === "Pending"
                    ? styles.statusPillPending
                    : statusText === "Taken"
                    ? styles.statusPillTaken
                    : statusText === "Low stock"
                    ? styles.statusPillLowStock
                    : statusText === "Out of stock"
                    ? styles.statusPillOutOfStock
                    : styles.statusPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    statusText === "Upcoming"
                      ? styles.statusPillTextUpcoming
                      : statusText === "Pending"
                      ? styles.statusPillTextPending
                      : statusText === "Taken"
                      ? styles.statusPillTextTaken
                      : statusText === "Low stock"
                      ? styles.statusPillTextLowStock
                      : statusText === "Out of stock"
                      ? styles.statusPillTextOutOfStock
                      : styles.statusPillTextActive,
                  ]}
                >
                  {statusText}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.chevron} />
            </View>
          </View>

          {/* Thin Divider */}
          <View style={styles.cardDivider} />

          {/* Bottom Row: Next dose (Left) + Remaining Quantity (Right) */}
          <View style={styles.cardBottomRow}>
            <View style={styles.bottomMetaItem}>
              <Ionicons name="time-outline" size={15} color="#0D9488" style={{ marginRight: 5 }} />
              <Text style={styles.bottomMetaLabel}>Next dose: </Text>
              <Text style={styles.bottomMetaValue}>
                {nextDoseTime || "No schedule"}
              </Text>
            </View>

            <View style={styles.bottomMetaItem}>
              <Ionicons
                name="cube-outline"
                size={15}
                color={isOutOfStock ? "#DC2626" : isLowStock ? "#D97706" : "#64748B"}
                style={{ marginRight: 5 }}
              />
              <Text
                style={[
                  styles.bottomMetaValue,
                  isOutOfStock
                    ? styles.bottomMetaValueCritical
                    : isLowStock
                    ? styles.bottomMetaValueWarning
                    : undefined,
                ]}
              >
                {item.inventory !== undefined && item.inventory !== null
                  ? `${item.inventory} ${item.dosageUnit || "units"} left`
                  : "Supply untracked"}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. TOP HEADER */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>
          <Text style={styles.brandTeal}>MediTrack</Text>
          <Text style={styles.brandPlus}>+</Text>
        </Text>
        <Text style={styles.pageTitle}>Medicines</Text>
        <Text style={styles.pageSubtitle}>Manage your medications and schedules.</Text>
      </View>

      {/* 2. SEARCH BAR */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search medicines"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search medicines"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. FILTER TABS */}
      <View style={styles.filterTabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsContent}
        >
          {(["All", "Active", "Low stock", "Out of stock"] as FilterTab[]).map((tab) => {
            const isSelected = selectedFilter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.filterTab,
                  isSelected ? styles.filterTabSelected : styles.filterTabUnselected,
                ]}
                onPress={() => setSelectedFilter(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${tab} filter`}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isSelected ? styles.filterTabTextSelected : styles.filterTabTextUnselected,
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 4 & 5. MEDICINE LIST */}
      {isLoading ? (
        <LoadingState skeleton={true} skeletonVariant="cards" skeletonCount={4} />
      ) : error ? (
        <ErrorState
          variant="data_load"
          title="Couldn't load your medicines"
          message={error}
          onRetry={() => fetchData(true)}
        />
      ) : filteredMedicines.length === 0 ? (
        searchQuery || selectedFilter !== "All" ? (
          <EmptyState
            variant="custom"
            iconName="search-outline"
            title="No matching medicines"
            description="Try adjusting your search terms or filter selection."
            actionTitle="Reset Filters"
            onActionPress={() => {
              setSearchQuery("");
              setSelectedFilter("All");
            }}
          />
        ) : (
          <EmptyState
            variant="medicines"
            actionTitle={!isCaregiver ? "+ Add Medicine" : undefined}
            onActionPress={!isCaregiver ? onAddMedicine : undefined}
          />
        )
      ) : (
        <FlatList
          data={filteredMedicines}
          keyExtractor={(item) => item.id}
          renderItem={renderMedicineItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={["#0D9488"]}
              tintColor="#0D9488"
            />
          }
        />
      )}

      {/* 8. FLOATING CIRCULAR "+" BUTTON */}
      {medicines.length > 0 && !isCaregiver && (
        <TouchableOpacity
          style={styles.fab}
          onPress={onAddMedicine}
          accessibilityRole="button"
          accessibilityLabel="Add Medicine"
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  /* 1. Top Header */
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  brandTeal: {
    color: "#0D9488",
  },
  brandPlus: {
    color: "#0D9488",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
  },

  /* 2. Search Bar */
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "#F8FAFC",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },

  /* 3. Filter Tabs */
  filterTabsContainer: {
    backgroundColor: "#F8FAFC",
    paddingBottom: 12,
  },
  filterTabsContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: "row",
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minHeight: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  filterTabSelected: {
    backgroundColor: "#0D9488",
  },
  filterTabUnselected: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterTabTextSelected: {
    color: "#FFFFFF",
  },
  filterTabTextUnselected: {
    color: "#64748B",
  },

  /* 4 & 5. Medicine Cards */
  listContent: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 88,
  },
  medicineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  medicineIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  medicineInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  medicineDosage: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  medicineFrequency: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  cardRightCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillUpcoming: {
    backgroundColor: "#E0F2FE",
  },
  statusPillPending: {
    backgroundColor: "#FEF3C7",
  },
  statusPillTaken: {
    backgroundColor: "#DCFCE7",
  },
  statusPillLowStock: {
    backgroundColor: "#FEF3C7",
  },
  statusPillOutOfStock: {
    backgroundColor: "#FEE2E2",
  },
  statusPillActive: {
    backgroundColor: "#F0FDFA",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillTextUpcoming: {
    color: "#0284C7",
  },
  statusPillTextPending: {
    color: "#B45309",
  },
  statusPillTextTaken: {
    color: "#15803D",
  },
  statusPillTextLowStock: {
    color: "#B45309",
  },
  statusPillTextOutOfStock: {
    color: "#DC2626",
  },
  statusPillTextActive: {
    color: "#0D9488",
  },
  chevron: {
    marginLeft: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginTop: 12,
    marginBottom: 10,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomMetaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomMetaLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  bottomMetaValue: {
    fontSize: 12,
    color: "#0F172A",
    fontWeight: "600",
  },
  bottomMetaValueWarning: {
    color: "#B45309",
  },
  bottomMetaValueCritical: {
    color: "#DC2626",
  },

  /* 7. Empty State */
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyPrimaryButton: {
    backgroundColor: "#0D9488",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  emptySecondaryButton: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptySecondaryButtonText: {
    color: "#0D9488",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Loading & Error */
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#0D9488",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#0D9488",
    fontWeight: "600",
    fontSize: 14,
  },

  /* 8. Floating Action Button */
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
});
