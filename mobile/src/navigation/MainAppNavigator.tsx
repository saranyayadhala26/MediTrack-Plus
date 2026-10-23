/**
 * Authenticated App Navigator (Phase 5).
 * Senior-friendly Tab and Stack routing for Dashboard, Prescribed Medicines,
 * and Medication Reminder Scheduling.
 */

import React, { useEffect, useState } from "react";
import {
  AppState,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getMedicineById } from "../api/medicines";
import { getSchedules } from "../api/schedules";
import { borderRadius, colors, spacing, typography } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../screens/main/HomeScreen";
import { AddMedicineScreen } from "../screens/medicines/AddMedicineScreen";
import { EditMedicineScreen } from "../screens/medicines/EditMedicineScreen";
import { MedicineDetailScreen } from "../screens/medicines/MedicineDetailScreen";
import { MedicineListScreen } from "../screens/medicines/MedicineListScreen";
import { AddScheduleScreen } from "../screens/schedules/AddScheduleScreen";
import { EditScheduleScreen } from "../screens/schedules/EditScheduleScreen";
import { ActivityHistoryScreen } from "../screens/activities/ActivityHistoryScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { CaregiverManagementScreen } from "../screens/caregivers/CaregiverManagementScreen";
import { CaregiverDashboardScreen } from "../screens/caregivers/CaregiverDashboardScreen";
import { PatientMonitoringDetailScreen } from "../screens/caregivers/PatientMonitoringDetailScreen";
import { CaregiverAlertsScreen } from "../screens/caregivers/CaregiverAlertsScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { AdherenceSummaryScreen } from "../screens/adherence/AdherenceSummaryScreen";
import { DoseAlarmModal, DoseAlarmData } from "../components/activities/DoseAlarmModal";
import { notificationService } from "../services/notificationService";
import { LinkedPatient, MedicationSchedule, Medicine } from "../types";
import { useAuth } from "../context/AuthContext";

type MainTab = "dashboard" | "calendar" | "medicines" | "history" | "caregivers";
type MedicineScreenMode =
  | "list"
  | "detail"
  | "add"
  | "edit"
  | "addSchedule"
  | "editSchedule";

export const MainAppNavigator: React.FC = () => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  // Patient state
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [medicineMode, setMedicineMode] = useState<MedicineScreenMode>("list");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<MedicationSchedule | null>(null);

  // Caregiver navigation state
  const [caregiverTab, setCaregiverTab] = useState<"dashboard" | "alerts">("dashboard");
  const [selectedPatient, setSelectedPatient] = useState<LinkedPatient | null>(null);

  // Profile navigation state (Phase 10.1)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);

  // Reports navigation state (Phase 11 Step 9)
  const [isReportsOpen, setIsReportsOpen] = useState<boolean>(false);
  const [reportsPatientId, setReportsPatientId] = useState<string | undefined>(undefined);

  // Adherence Summary navigation state
  const [isAdherenceOpen, setIsAdherenceOpen] = useState<boolean>(false);

  // Medication Alarm state (Phase 10.2)
  const [alarmData, setAlarmData] = useState<DoseAlarmData | null>(null);

  // Setup notification channel, sync active schedules, and attach tap listener
  useEffect(() => {
    if (isCaregiver) return;
    let isMounted = true;

    const remindersEnabled = user?.notificationPreferences?.medicationRemindersEnabled ?? true;

    // 1. Initial startup/login reconciliation
    notificationService.autoSync({ force: true, remindersEnabled }).catch(() => {});

    // 2. Returning to foreground: reconcile with throttle protection
    const appStateSub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && isMounted) {
        const currentEnabled = user?.notificationPreferences?.medicationRemindersEnabled ?? true;
        notificationService.autoSync({ force: false, remindersEnabled: currentEnabled }).catch(() => {});
      }
    });

    // 3. Foreground notification receipt: show DoseAlarmModal immediately (Phase 10.2)
    const receivedSub = notificationService.addNotificationReceivedListener((notification) => {
      if (!isMounted) return;
      const data = (notification?.request?.content?.data as any) || {};
      if (data?.isAlarm || (data?.medicineId && data?.scheduleId)) {
        const todayStr = (data.scheduledDate as string) || new Date().toISOString().split("T")[0];
        setAlarmData({
          scheduleId: (data.scheduleId as string) || "test-sched-001",
          medicineId: (data.medicineId as string) || "test-med-001",
          medicineName: (data.medicineName as string) || "Prescribed Medicine",
          dosage: (data.dosage as string) || "",
          dosageUnit: (data.dosageUnit as string) || "",
          scheduledTime:
            (data.time as string) ||
            (data.scheduledTime as string) ||
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          scheduledDate: todayStr,
          isSnooze: Boolean(data.isSnooze),
        });
      }
    });

    // 4. Notification response (tap): show DoseAlarmModal or deep link to MedicineDetail
    const responseSub = notificationService.addNotificationResponseListener((response) => {
      if (!isMounted) return;
      const data = (response?.notification?.request?.content?.data as any) || {};
      if (data?.isAlarm || (data?.medicineId && data?.scheduleId)) {
        const todayStr = (data.scheduledDate as string) || new Date().toISOString().split("T")[0];
        setAlarmData({
          scheduleId: (data.scheduleId as string) || "test-sched-001",
          medicineId: (data.medicineId as string) || "test-med-001",
          medicineName: (data.medicineName as string) || "Prescribed Medicine",
          dosage: (data.dosage as string) || "",
          dosageUnit: (data.dosageUnit as string) || "",
          scheduledTime:
            (data.time as string) ||
            (data.scheduledTime as string) ||
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          scheduledDate: todayStr,
          isSnooze: Boolean(data.isSnooze),
        });
      } else if (data?.medicineId) {
        getMedicineById(data.medicineId)
          .then((med) => {
            if (isMounted && med) {
              setSelectedMedicine(med);
              setActiveTab("medicines");
              setMedicineMode("detail");
            }
          })
          .catch(() => {
            if (isMounted) {
              setActiveTab("medicines");
              setMedicineMode("list");
            }
          });
      }
    });

    return () => {
      isMounted = false;
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isCaregiver, user?.notificationPreferences?.medicationRemindersEnabled]);

  const handleNavigateToMedicines = (subScreen?: "list" | "add") => {
    setActiveTab("medicines");
    if (subScreen === "add") {
      setMedicineMode("add");
    } else {
      setMedicineMode("list");
    }
  };

  const renderContent = () => {
    // Dedicated Profile Experience (Phase 10.1)
    if (isProfileOpen) {
      return <ProfileScreen onBack={() => setIsProfileOpen(false)} />;
    }

    // Dedicated Adherence Reports Experience (Phase 11 Step 9)
    if (isReportsOpen) {
      return (
        <ReportsScreen
          initialPatientId={reportsPatientId}
          onBack={() => {
            setIsReportsOpen(false);
            setReportsPatientId(undefined);
          }}
          onNavigateToProfile={() => {
            setIsReportsOpen(false);
            setIsProfileOpen(true);
          }}
        />
      );
    }

    // Caregiver Monitoring Experience (Phase 9.2.7)
    if (isCaregiver) {
      if (caregiverTab === "dashboard") {
        if (selectedPatient) {
          return (
            <PatientMonitoringDetailScreen
              patientId={selectedPatient.patientId}
              patientName={selectedPatient.fullName}
              relationship={selectedPatient.relationship}
              onBack={() => setSelectedPatient(null)}
              onViewAlerts={() => setCaregiverTab("alerts")}
              onViewReports={() => {
                setReportsPatientId(selectedPatient.patientId);
                setIsReportsOpen(true);
              }}
            />
          );
        }
        return (
          <CaregiverDashboardScreen
            onSelectPatient={(patient) => setSelectedPatient(patient)}
            onViewAlerts={() => setCaregiverTab("alerts")}
            onNavigateToProfile={() => setIsProfileOpen(true)}
            onNavigateToReports={(patient) => {
              setReportsPatientId(patient?.patientId);
              setIsReportsOpen(true);
            }}
          />
        );
      }

      if (caregiverTab === "alerts") {
        return (
          <CaregiverAlertsScreen
            initialPatientId={selectedPatient?.patientId}
            onBack={() => setCaregiverTab("dashboard")}
            onSelectPatient={(patient) => {
              setSelectedPatient(patient);
              setCaregiverTab("dashboard");
            }}
          />
        );
      }
    }

    // Dedicated Adherence Summary Experience
    if (isAdherenceOpen) {
      return (
        <AdherenceSummaryScreen
          onBack={() => setIsAdherenceOpen(false)}
          onNavigateToHistory={() => {
            setIsAdherenceOpen(false);
            setActiveTab("history");
          }}
          onNavigateToReports={() => {
            setReportsPatientId(undefined);
            setIsReportsOpen(true);
          }}
          hideBottomNav={true}
        />
      );
    }

    // Patient Experience
    if (activeTab === "dashboard") {
      return (
        <HomeScreen
          onNavigateToMedicines={handleNavigateToMedicines}
          onNavigateToCaregivers={() => setActiveTab("caregivers")}
          onNavigateToProfile={() => setIsProfileOpen(true)}
          onNavigateToReports={() => {
            setReportsPatientId(undefined);
            setIsReportsOpen(true);
          }}
          onNavigateToCalendar={() => setActiveTab("calendar")}
          onNavigateToHistory={() => setActiveTab("history")}
          onNavigateToAdherence={() => setIsAdherenceOpen(true)}
        />
      );
    }

    if (activeTab === "calendar") {
      return <CalendarScreen />;
    }

    if (activeTab === "history") {
      return <ActivityHistoryScreen onBack={() => setActiveTab("dashboard")} />;
    }

    if (activeTab === "caregivers") {
      return <CaregiverManagementScreen onBack={() => setActiveTab("dashboard")} />;
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
            onAddSchedule={(med) => {
              setSelectedMedicine(med);
              setMedicineMode("addSchedule");
            }}
            onEditSchedule={(sched) => {
              setSelectedSchedule(sched);
              setMedicineMode("editSchedule");
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

      case "addSchedule":
        return (
          <AddScheduleScreen
            initialMedicine={selectedMedicine || undefined}
            onBack={() => setMedicineMode(selectedMedicine ? "detail" : "list")}
            onSuccess={() => setMedicineMode(selectedMedicine ? "detail" : "list")}
          />
        );

      case "editSchedule":
        if (!selectedSchedule) {
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
          <EditScheduleScreen
            schedule={selectedSchedule}
            onBack={() => setMedicineMode("detail")}
            onSuccess={() => {
              setSelectedSchedule(null);
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

  // Hide bottom tab bar while user is actively filling out Add/Edit forms, viewing Profile, or viewing Reports
  const showTabBar = isProfileOpen || isReportsOpen
    ? false
    : isCaregiver
    ? true
    : activeTab === "dashboard" ||
      activeTab === "calendar" ||
      activeTab === "history" ||
      activeTab === "caregivers" ||
      (activeTab === "medicines" && (medicineMode === "list" || medicineMode === "detail"));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>{renderContent()}</View>

      {showTabBar && (
        isCaregiver ? (
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => {
                setCaregiverTab("dashboard");
                setSelectedPatient(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: caregiverTab === "dashboard" }}
              accessibilityLabel="Patients Dashboard Tab"
            >
              <Ionicons
                name={caregiverTab === "dashboard" ? "people" : "people-outline"}
                size={22}
                color={caregiverTab === "dashboard" ? colors.primary : "#94A3B8"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  caregiverTab === "dashboard"
                    ? styles.tabLabelActive
                    : styles.tabLabelInactive,
                ]}
              >
                Patients
              </Text>
              <View
                style={
                  caregiverTab === "dashboard"
                    ? styles.activeIndicator
                    : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => setCaregiverTab("alerts")}
              accessibilityRole="tab"
              accessibilityState={{ selected: caregiverTab === "alerts" }}
              accessibilityLabel="Caregiver Alerts Tab"
            >
              <Ionicons
                name={caregiverTab === "alerts" ? "notifications" : "notifications-outline"}
                size={22}
                color={caregiverTab === "alerts" ? colors.primary : "#94A3B8"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  caregiverTab === "alerts"
                    ? styles.tabLabelActive
                    : styles.tabLabelInactive,
                ]}
              >
                Alerts
              </Text>
              <View
                style={
                  caregiverTab === "alerts"
                    ? styles.activeIndicator
                    : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.tabBar}>
            {/* 1. Home */}
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => {
                setActiveTab("dashboard");
                setIsProfileOpen(false);
                setIsReportsOpen(false);
                setIsAdherenceOpen(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{
                selected: activeTab === "dashboard" && !isProfileOpen && !isReportsOpen,
              }}
              accessibilityLabel="Home Tab"
            >
              <Ionicons
                name={
                  activeTab === "dashboard" && !isProfileOpen && !isReportsOpen
                    ? "home"
                    : "home-outline"
                }
                size={22}
                color={
                  activeTab === "dashboard" && !isProfileOpen && !isReportsOpen
                    ? colors.primary
                    : "#94A3B8"
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "dashboard" && !isProfileOpen && !isReportsOpen
                    ? styles.tabLabelActive
                    : styles.tabLabelInactive,
                ]}
              >
                Home
              </Text>
              <View
                style={
                  activeTab === "dashboard" && !isProfileOpen && !isReportsOpen
                    ? styles.activeIndicator
                    : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>

            {/* 2. Medicines */}
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => {
                setActiveTab("medicines");
                setMedicineMode("list");
                setIsProfileOpen(false);
                setIsReportsOpen(false);
                setIsAdherenceOpen(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{
                selected: activeTab === "medicines" && !isProfileOpen && !isReportsOpen,
              }}
              accessibilityLabel="Medicines Tab"
            >
              <Ionicons
                name={
                  activeTab === "medicines" && !isProfileOpen && !isReportsOpen
                    ? "medkit"
                    : "medkit-outline"
                }
                size={22}
                color={
                  activeTab === "medicines" && !isProfileOpen && !isReportsOpen
                    ? colors.primary
                    : "#94A3B8"
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "medicines" && !isProfileOpen && !isReportsOpen
                    ? styles.tabLabelActive
                    : styles.tabLabelInactive,
                ]}
              >
                Medicines
              </Text>
              <View
                style={
                  activeTab === "medicines" && !isProfileOpen && !isReportsOpen
                    ? styles.activeIndicator
                    : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>

            {/* 3. Calendar */}
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => {
                setActiveTab("calendar");
                setIsProfileOpen(false);
                setIsReportsOpen(false);
                setIsAdherenceOpen(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{
                selected: activeTab === "calendar" && !isProfileOpen && !isReportsOpen,
              }}
              accessibilityLabel="Medication Calendar Tab"
            >
              <Ionicons
                name={
                  activeTab === "calendar" && !isProfileOpen && !isReportsOpen
                    ? "calendar"
                    : "calendar-outline"
                }
                size={22}
                color={
                  activeTab === "calendar" && !isProfileOpen && !isReportsOpen
                    ? colors.primary
                    : "#94A3B8"
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "calendar" && !isProfileOpen && !isReportsOpen
                    ? styles.tabLabelActive
                    : styles.tabLabelInactive,
                ]}
              >
                Calendar
              </Text>
              <View
                style={
                  activeTab === "calendar" && !isProfileOpen && !isReportsOpen
                    ? styles.activeIndicator
                    : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>

            {/* 4. Profile */}
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => {
                setIsProfileOpen(true);
                setIsReportsOpen(false);
                setIsAdherenceOpen(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isProfileOpen }}
              accessibilityLabel="Profile Tab"
            >
              <Ionicons
                name={isProfileOpen ? "person" : "person-outline"}
                size={22}
                color={isProfileOpen ? colors.primary : "#94A3B8"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isProfileOpen ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                Profile
              </Text>
              <View
                style={
                  isProfileOpen ? styles.activeIndicator : styles.inactiveIndicator
                }
              />
            </TouchableOpacity>
          </View>
        )
      )}

      {/* Prominent Medication Alarm Modal (Phase 10.2) */}
      <DoseAlarmModal
        visible={!!alarmData}
        data={alarmData}
        onDismiss={() => setAlarmData(null)}
        onActivityRecorded={(_action) => {
          setAlarmData(null);
        }}
      />
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
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  tabLabelInactive: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  activeIndicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
  inactiveIndicator: {
    width: 16,
    height: 3,
    backgroundColor: "transparent",
    marginTop: 3,
  },
});
