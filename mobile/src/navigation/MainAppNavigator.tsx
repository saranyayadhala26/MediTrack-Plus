/**
 * Authenticated App Navigator (Phase 4).
 * Senior-friendly Tab and Stack routing for Dashboard and Prescribed Medicines.
 * Manages transitions between Medicine List, Detail, Add, and Edit screens.
 */

import React, { useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { borderRadius, colors, spacing, typography } from "../constants/theme";
import { HomeScreen } from "../screens/main/HomeScreen";
import { AddMedicineScreen } from "../screens/medicines/AddMedicineScreen";
import { EditMedicineScreen } from "../screens/medicines/EditMedicineScreen";
import { MedicineDetailScreen } from "../screens/medicines/MedicineDetailScreen";
import { MedicineListScreen } from "../screens/medicines/MedicineListScreen";
import { Medicine } from "../types";

type MainTab = "dashboard" | "medicines";
type MedicineScreenMode = "list" | "detail" | "add" | "edit";

export const MainAppNavigator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [medicineMode, setMedicineMode] = useState<MedicineScreenMode>("list");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  const handleNavigateToMedicines = (subScreen?: "list" | "add") => {
    setActiveTab("medicines");
    if (subScreen === "add") {
      setMedicineMode("add");
    } else {
      setMedicineMode("list");
    }
  };

  const renderContent = () => {
    if (activeTab === "dashboard") {
      return <HomeScreen onNavigateToMedicines={handleNavigateToMedicines} />;
    }

    // Active tab is "medicines"
    switch (medicineMode) {
      case "add":
        return (
          <AddMedicineScreen
            onBack={() => setMedicineMode("list")}
            onSuccess={() => setMedicineMode("list")}
          />
        );

      case "detail":
        if (!selectedMedicine) {
          return (
            <MedicineListScreen
              onSelectMedicine={(med) => {
                setSelectedMedicine(med);
                setMedicineMode("detail");
              }}
              onAddMedicine={() => setMedicineMode("add")}
            />
          );
        }
        return (
          <MedicineDetailScreen
            medicine={selectedMedicine}
            onBack={() => setMedicineMode("list")}
            onEdit={(med) => {
              setSelectedMedicine(med);
              setMedicineMode("edit");
            }}
            onDeleted={() => {
              setSelectedMedicine(null);
              setMedicineMode("list");
            }}
          />
        );

      case "edit":
        if (!selectedMedicine) {
          return (
            <MedicineListScreen
              onSelectMedicine={(med) => {
                setSelectedMedicine(med);
                setMedicineMode("detail");
              }}
              onAddMedicine={() => setMedicineMode("add")}
            />
          );
        }
        return (
          <EditMedicineScreen
            medicine={selectedMedicine}
            onBack={() => setMedicineMode("detail")}
            onSuccess={(updated) => {
              setSelectedMedicine(updated);
              setMedicineMode("detail");
            }}
          />
        );

      case "list":
      default:
        return (
          <MedicineListScreen
            onSelectMedicine={(med) => {
              setSelectedMedicine(med);
              setMedicineMode("detail");
            }}
            onAddMedicine={() => setMedicineMode("add")}
          />
        );
    }
  };

  // Hide bottom tab bar while user is actively filling out Add or Edit forms
  const showTabBar =
    activeTab === "dashboard" ||
    (activeTab === "medicines" && (medicineMode === "list" || medicineMode === "detail"));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>{renderContent()}</View>

      {showTabBar && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "dashboard" && styles.tabButtonActive]}
            onPress={() => setActiveTab("dashboard")}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "dashboard" }}
            accessibilityLabel="Dashboard Tab"
          >
            <Text
              style={[
                styles.tabIcon,
                activeTab === "dashboard" ? styles.tabIconActive : styles.tabIconInactive,
              ]}
            >
              ⌂
            </Text>
            <Text
              style={[
                styles.tabLabel,
                activeTab === "dashboard" ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "medicines" && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab("medicines");
              setMedicineMode("list");
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "medicines" }}
            accessibilityLabel="Medicines Tab"
          >
            <Text
              style={[
                styles.tabIcon,
                activeTab === "medicines" ? styles.tabIconActive : styles.tabIconInactive,
              ]}
            >
              💊
            </Text>
            <Text
              style={[
                styles.tabLabel,
                activeTab === "medicines" ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Medicines
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 48,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  tabIconActive: {
    color: colors.primaryDark,
  },
  tabIconInactive: {
    color: colors.textMuted,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  tabLabelInactive: {
    color: colors.textMuted,
  },
});
