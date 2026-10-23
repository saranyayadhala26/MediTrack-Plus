/**
 * Caregiver Management View for MediTrack+
 * Matches PDF Page 14 / 33 (Caregiver Management) & Page 13 / 33 (Link Caregiver).
 *
 * Architecture:
 * - Internal view toggle: viewMode === "management" (Page 14) vs "link" (Page 13)
 * - Safe area handling guarantees header begins below Android status bar.
 * - Reuses existing API helpers: getCaregivers("active"), createCaregiver(), revokeCaregiver().
 * - Real data only: NO synthetic or fake caregiver data.
 * - Android hardware back press handled gracefully across all states.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createCaregiver,
  getCaregivers,
  revokeCaregiver,
} from "../../api/caregivers";
import { Caregiver } from "../../types";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessState,
} from "../../components/common";

export interface CaregiverManagementViewProps {
  onBack: () => void;
  isCaregiver?: boolean;
}

type ViewMode = "management" | "link";

export const CaregiverManagementView: React.FC<CaregiverManagementViewProps> = ({
  onBack,
  isCaregiver = false,
}) => {
  // Safe area insets handling
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("management");
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<boolean>(false);

  // Link form state (Page 13)
  const [email, setEmail] = useState<string>("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Details modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  // Fetch active caregivers from authoritative backend API
  const loadCaregivers = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const data = await getCaregivers("active");
      setCaregivers(data || []);
    } catch (err: any) {
      setFetchError("Unable to load caregivers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaregivers();
  }, [loadCaregivers]);

  // Android hardware back press handler
  useEffect(() => {
    const handleHardwareBack = () => {
      if (isDetailsModalOpen) {
        setIsDetailsModalOpen(false);
        return true;
      }
      if (viewMode === "link") {
        if (email.trim().length > 0) {
          Alert.alert(
            "Discard link request?",
            "You have unsaved changes. Are you sure you want to discard this request?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Discard",
                style: "destructive",
                onPress: () => {
                  setEmail("");
                  setEmailError(null);
                  setViewMode("management");
                },
              },
            ]
          );
          return true;
        }
        setViewMode("management");
        return true;
      }
      onBack();
      return true;
    };

    const backSub = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );
    return () => backSub.remove();
  }, [viewMode, email, isDetailsModalOpen, onBack]);

  // Handle Page 13 Back button press
  const handlePage13Back = () => {
    if (email.trim().length > 0) {
      Alert.alert(
        "Discard link request?",
        "You have unsaved changes. Are you sure you want to discard this request?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setEmail("");
              setEmailError(null);
              setViewMode("management");
            },
          },
        ]
      );
    } else {
      setEmailError(null);
      setViewMode("management");
    }
  };

  // Submit caregiver link request (PDF Page 13)
  const handleSubmitLink = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError("Please enter caregiver email.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      setEmailError(null);

      // Send ONLY caregiverEmail; backend authoritatively derives name & phone from registered account
      await createCaregiver({
        caregiverEmail: trimmedEmail,
      });

      setEmail("");
      await loadCaregivers();
      setRequestSent(true);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 404) {
        setEmailError("No registered caregiver account was found with this email.");
      } else if (status === 400) {
        if (typeof detail === "string" && detail.toLowerCase().includes("themselves")) {
          setEmailError("You cannot link yourself as your own caregiver.");
        } else {
          setEmailError("Please use the email address of a registered caregiver account.");
        }
      } else if (status === 409) {
        setEmailError("This caregiver is already linked to your account.");
      } else {
        setEmailError("Unable to link caregiver right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Contact Caregiver via native dialer
  const handleContactCaregiver = (phone?: string) => {
    if (phone && phone.trim().length > 0) {
      const sanitized = phone.replace(/[^0-9+]/g, "");
      Linking.openURL(`tel:${sanitized}`).catch(() => {
        Alert.alert("Unable to Call", "Device dialer could not be opened.");
      });
    } else {
      Alert.alert(
        "Phone Unavailable",
        "This caregiver does not have a registered phone number on file."
      );
    }
  };

  // Remove Caregiver with confirmation
  const handleRemoveCaregiver = (caregiver: Caregiver) => {
    Alert.alert(
      "Remove Caregiver",
      "Are you sure you want to remove this caregiver's access?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setIsRevoking(true);
              await revokeCaregiver(caregiver.id);
              await loadCaregivers();
            } catch (err: any) {
              Alert.alert(
                "Error",
                "Failed to remove caregiver. Please try again."
              );
            } finally {
              setIsRevoking(false);
            }
          },
        },
      ]
    );
  };

  // Active caregiver record (first active linked caregiver)
  const activeCaregiver = caregivers.length > 0 ? caregivers[0] : null;

  // Helper to extract 2-letter initials
  const getInitials = (fullName: string): string => {
    if (!fullName) return "CG";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  // =========================================================================
  // RENDER: PDF PAGE 6 — CAREGIVER REQUEST SENT SUCCESS
  // =========================================================================
  if (requestSent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setRequestSent(false);
              setViewMode("management");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to Caregiver Management"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.screenTitle}>Request Sent</Text>
            <Text style={styles.screenSubtitle}>
              Caregiver linking request has been sent.
            </Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { justifyContent: "center", alignItems: "center", minHeight: 400 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SuccessState
            variant="request_sent"
            actionTitle="Done"
            onActionPress={() => {
              setRequestSent(false);
              setViewMode("management");
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // RENDER: PDF PAGE 13 — LINK CAREGIVER
  // =========================================================================
  if (viewMode === "link") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* Screen Header Bar */}
        <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handlePage13Back}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to Caregiver Management"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.screenTitle}>Link Caregiver</Text>
            <Text style={styles.screenSubtitle}>
              Link someone you trust to help monitor your medication care.
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Hero Section */}
            <View style={styles.heroSection}>
              <View style={styles.heroBadge}>
                <Ionicons name="people" size={36} color="#0D9488" />
                <View style={styles.heroSubBadge}>
                  <Ionicons name="link" size={14} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.heroTitle}>Connect a Caregiver</Text>
              <Text style={styles.heroSubtitle}>
                Link someone you trust to help monitor your medication care.
              </Text>
            </View>

            {/* Caregiver Information Form */}
            <View style={styles.formCard}>
              <Text style={styles.formCardTitle}>Caregiver Information</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Caregiver Email</Text>
                <View
                  style={[
                    styles.fieldInputContainer,
                    emailError ? styles.fieldInputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color="#0D9488"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.fieldTextInput}
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="Enter caregiver email address"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                  />
                </View>
                {emailError ? (
                  <View style={styles.inlineErrorRow}>
                    <Ionicons name="alert-circle" size={14} color="#DC2626" />
                    <Text style={styles.inlineErrorText}>{emailError}</Text>
                  </View>
                ) : null}
              </View>

              {/* Information Note Card */}
              <View style={styles.linkInfoCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#0D9488"
                  style={styles.linkInfoIcon}
                />
                <View style={styles.linkInfoTextCol}>
                  <Text style={styles.linkInfoTitle}>
                    Your caregiver will receive a request to connect with your account.
                  </Text>
                  <Text style={styles.linkInfoDescription}>
                    Once they accept, they will be able to view the medication
                    information you have chosen to share.
                  </Text>
                </View>
              </View>

              {/* Primary Submit Button */}
              <TouchableOpacity
                style={[
                  styles.sendRequestBtn,
                  isSubmitting && styles.btnDisabled,
                ]}
                onPress={handleSubmitLink}
                disabled={isSubmitting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send Link Request"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="link-outline"
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.sendRequestBtnText}>
                      Send Link Request
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handlePage13Back}
                disabled={isSubmitting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Fixed Bottom Navigation Bar */}
        <View style={styles.bottomTabBar}>
          <TouchableOpacity
            style={styles.bottomTabButton}
            onPress={onBack}
            accessibilityRole="tab"
            accessibilityLabel="Home Tab"
          >
            <Ionicons name="home-outline" size={22} color="#94A3B8" />
            <Text style={styles.bottomTabLabel}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomTabButton}
            onPress={onBack}
            accessibilityRole="tab"
            accessibilityLabel="Medicines Tab"
          >
            <Ionicons name="medkit-outline" size={22} color="#94A3B8" />
            <Text style={styles.bottomTabLabel}>Medicines</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomTabButton}
            onPress={onBack}
            accessibilityRole="tab"
            accessibilityLabel="Calendar Tab"
          >
            <Ionicons name="calendar-outline" size={22} color="#94A3B8" />
            <Text style={styles.bottomTabLabel}>Calendar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomTabButton}
            activeOpacity={1}
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            accessibilityLabel="Profile Tab"
          >
            <Ionicons name="person" size={22} color="#0D9488" />
            <Text style={[styles.bottomTabLabel, styles.bottomTabLabelActive]}>
              Profile
            </Text>
            <View style={styles.activeTabIndicator} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // RENDER: PDF PAGE 14 — CAREGIVER MANAGEMENT
  // =========================================================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header Bar */}
      <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Caregiver Management</Text>
          <Text style={styles.screenSubtitle}>
            Manage who can help monitor your medication care.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading State */}
        {isLoading ? (
          <LoadingState message="Loading caregiver information..." />
        ) : fetchError ? (
          /* Error State */
          <ErrorState
            variant="data_load"
            title="Couldn't load caregivers"
            message={fetchError}
            onRetry={loadCaregivers}
          />
        ) : activeCaregiver ? (
          /* CONNECTED CAREGIVER PRESENTATION (Matching Page 14) */
          <>
            {/* Top Status Banner */}
            <View style={styles.statusBanner}>
              <View style={styles.statusBannerIconCircle}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.statusBannerTextCol}>
                <Text style={styles.statusBannerTitle}>Caregiver Connected</Text>
                <Text style={styles.statusBannerDescription}>
                  Your caregiver can view the medication information you have
                  chosen to share.
                </Text>
              </View>
            </View>

            {/* Caregiver Card */}
            <View style={styles.caregiverCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {getInitials(activeCaregiver.caregiverName)}
                </Text>
              </View>
              <View style={styles.caregiverInfoCol}>
                <Text style={styles.caregiverName} numberOfLines={1}>
                  {activeCaregiver.caregiverName}
                </Text>
                <Text style={styles.caregiverSubtitle}>
                  {activeCaregiver.relationship || "Caregiver"}
                </Text>
                <View style={styles.connectedBadgeRow}>
                  <View style={styles.statusDotGreen} />
                  <Text style={styles.connectedBadgeText}>Connected</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewDetailsBtn}
                onPress={() => setIsDetailsModalOpen(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View Details"
              >
                <Text style={styles.viewDetailsBtnText}>View Details</Text>
                <Ionicons name="chevron-forward" size={14} color="#0D9488" />
              </TouchableOpacity>
            </View>

            {/* Shared Access Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shared Access</Text>
              <Text style={styles.sectionSubtitle}>
                Your caregiver can access the following information in MediTrack+.
              </Text>
            </View>

            <View style={styles.sharedAccessCard}>
              {/* Scope 1: Medication Schedule */}
              <View style={styles.sharedAccessRow}>
                <View style={styles.sharedAccessIconCircle}>
                  <Ionicons name="calendar-outline" size={18} color="#0D9488" />
                </View>
                <View style={styles.sharedAccessTextCol}>
                  <Text style={styles.sharedAccessRowTitle}>
                    Medication Schedule
                  </Text>
                  <Text style={styles.sharedAccessRowSubtitle}>
                    View your scheduled medicines
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
              </View>

              <View style={styles.rowDivider} />

              {/* Scope 2: Adherence Information */}
              <View style={styles.sharedAccessRow}>
                <View style={styles.sharedAccessIconCircle}>
                  <Ionicons name="bar-chart-outline" size={18} color="#0D9488" />
                </View>
                <View style={styles.sharedAccessTextCol}>
                  <Text style={styles.sharedAccessRowTitle}>
                    Adherence Information
                  </Text>
                  <Text style={styles.sharedAccessRowSubtitle}>
                    View your medication adherence
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
              </View>

              <View style={styles.rowDivider} />

              {/* Scope 3: Missed Dose Alerts */}
              <View style={styles.sharedAccessRow}>
                <View style={styles.sharedAccessIconCircle}>
                  <Ionicons name="notifications-outline" size={18} color="#0D9488" />
                </View>
                <View style={styles.sharedAccessTextCol}>
                  <Text style={styles.sharedAccessRowTitle}>
                    Missed Dose Alerts
                  </Text>
                  <Text style={styles.sharedAccessRowSubtitle}>
                    Receive alerts when a dose is missed
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              {/* Contact Caregiver */}
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => handleContactCaregiver(activeCaregiver.caregiverPhone)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Contact Caregiver"
              >
                <Ionicons
                  name="call-outline"
                  size={18}
                  color="#0D9488"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.contactBtnText}>Contact Caregiver</Text>
              </TouchableOpacity>

              {/* Remove Caregiver */}
              <TouchableOpacity
                style={[
                  styles.removeBtn,
                  isRevoking && styles.btnDisabled,
                ]}
                onPress={() => handleRemoveCaregiver(activeCaregiver)}
                disabled={isRevoking}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Remove Caregiver"
              >
                {isRevoking ? (
                  <ActivityIndicator color="#DC2626" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color="#DC2626"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.removeBtnText}>Remove Caregiver</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyCard}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color="#0D9488"
                style={styles.privacyIcon}
              />
              <View style={styles.privacyTextCol}>
                <Text style={styles.privacyTitle}>Your privacy matters</Text>
                <Text style={styles.privacyDescription}>
                  Only the information supported by your caregiver connection is
                  shared with your caregiver. Caregivers have read-only monitoring
                  access and cannot change your medicines or medication schedules.
                </Text>
              </View>
            </View>
          </>
        ) : (
          /* EMPTY STATE (When no active caregiver is connected) */
          <>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={40} color="#0D9488" />
              </View>
              <Text style={styles.emptyTitle}>No Caregiver Connected</Text>
              <Text style={styles.emptySubtitle}>
                Link a trusted caregiver to help monitor your medication adherence.
              </Text>
              <TouchableOpacity
                style={styles.linkCaregiverBtn}
                onPress={() => {
                  setEmail("");
                  setEmailError(null);
                  setViewMode("link");
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Link Caregiver"
              >
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.linkCaregiverBtnText}>Link Caregiver</Text>
              </TouchableOpacity>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyCard}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color="#0D9488"
                style={styles.privacyIcon}
              />
              <View style={styles.privacyTextCol}>
                <Text style={styles.privacyTitle}>Your privacy matters</Text>
                <Text style={styles.privacyDescription}>
                  Only the information supported by your caregiver connection is
                  shared with your caregiver. Caregivers have read-only monitoring
                  access and cannot change your medicines or medication schedules.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* =================================================================== */}
      {/* IN-COMPONENT DETAILS MODAL                                          */}
      {/* =================================================================== */}
      <Modal
        visible={isDetailsModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDetailsModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsDetailsModalOpen(false)}
        >
          <View
            style={styles.detailsModalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Caregiver Details</Text>
              <TouchableOpacity
                onPress={() => setIsDetailsModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {activeCaregiver && (
              <View style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Full Name</Text>
                  <Text style={styles.detailValue}>
                    {activeCaregiver.caregiverName}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Relationship</Text>
                  <Text style={styles.detailValue}>
                    {activeCaregiver.relationship || "Caregiver"}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>
                    {activeCaregiver.caregiverEmail}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>
                    {activeCaregiver.caregiverPhone || "Not provided"}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={styles.statusPillActive}>
                    <Text style={styles.statusPillActiveText}>Active</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Linked Date</Text>
                  <Text style={styles.detailValue}>
                    {new Date(activeCaregiver.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.permissionsCard}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color="#0D9488"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.permissionsText}>
                    Read-only monitoring access. Caregivers cannot alter
                    prescriptions or schedules.
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setIsDetailsModalOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fixed Bottom Navigation Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.bottomTabButton}
          onPress={onBack}
          accessibilityRole="tab"
          accessibilityLabel="Home Tab"
        >
          <Ionicons name="home-outline" size={22} color="#94A3B8" />
          <Text style={styles.bottomTabLabel}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabButton}
          onPress={onBack}
          accessibilityRole="tab"
          accessibilityLabel="Medicines Tab"
        >
          <Ionicons name="medkit-outline" size={22} color="#94A3B8" />
          <Text style={styles.bottomTabLabel}>Medicines</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabButton}
          onPress={onBack}
          accessibilityRole="tab"
          accessibilityLabel="Calendar Tab"
        >
          <Ionicons name="calendar-outline" size={22} color="#94A3B8" />
          <Text style={styles.bottomTabLabel}>Calendar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabButton}
          activeOpacity={1}
          accessibilityRole="tab"
          accessibilityState={{ selected: true }}
          accessibilityLabel="Profile Tab"
        >
          <Ionicons name="person" size={22} color="#0D9488" />
          <Text style={[styles.bottomTabLabel, styles.bottomTabLabelActive]}>
            Profile
          </Text>
          <View style={styles.activeTabIndicator} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardContainer: {
    flex: 1,
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: -2,
    backgroundColor: "#F8FAFC",
  },
  headerTitleContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 26,
  },
  screenSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },

  /* Center / Loading / Error */
  centerBox: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  errorBox: {
    padding: 24,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 20,
  },
  errorBoxTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#991B1B",
    marginTop: 8,
  },
  errorBoxText: {
    fontSize: 13,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#DC2626",
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },

  /* Status Banner (Page 14 Top) */
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  statusBannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  statusBannerTextCol: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#166534",
    marginBottom: 2,
  },
  statusBannerDescription: {
    fontSize: 12,
    color: "#15803D",
    lineHeight: 16,
  },

  /* Caregiver Card (Page 14) */
  caregiverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  caregiverInfoCol: {
    flex: 1,
  },
  caregiverName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  caregiverSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 1,
  },
  connectedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
    marginRight: 5,
  },
  connectedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F0FDFA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  viewDetailsBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
    marginRight: 2,
  },

  /* Shared Access Section */
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  sharedAccessCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    marginBottom: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sharedAccessRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  sharedAccessIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sharedAccessTextCol: {
    flex: 1,
  },
  sharedAccessRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  sharedAccessRowSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  /* Actions Container */
  actionsContainer: {
    marginBottom: 20,
    gap: 10,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#0D9488",
  },
  contactBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D9488",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  removeBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },

  /* Privacy Note */
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 14,
    marginBottom: 20,
  },
  privacyIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  privacyTextCol: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 3,
  },
  privacyDescription: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 17,
  },

  /* Empty State */
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  linkCaregiverBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D9488",
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 10,
  },
  linkCaregiverBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  /* Page 13: Hero Section */
  heroSection: {
    alignItems: "center",
    paddingVertical: 18,
    marginBottom: 10,
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    position: "relative",
  },
  heroSubBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0D9488",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },

  /* Page 13: Form Card */
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  fieldInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
  },
  fieldInputContainerError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldTextInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    height: "100%",
  },
  inlineErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  inlineErrorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  linkInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0FDFA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 12,
    marginBottom: 18,
  },
  linkInfoIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  linkInfoTextCol: {
    flex: 1,
  },
  linkInfoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
    marginBottom: 2,
  },
  linkInfoDescription: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 16,
  },
  sendRequestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#0D9488",
    marginBottom: 8,
  },
  sendRequestBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 42,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  /* Details Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  detailsModalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalBody: {
    marginBottom: 18,
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },
  statusPillActive: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillActiveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },
  permissionsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  permissionsText: {
    flex: 1,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 15,
  },
  modalCloseBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  /* Fixed Bottom Tab Bar */
  bottomTabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: Platform.OS === "ios" ? 14 : 0,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  bottomTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  bottomTabLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  bottomTabLabelActive: {
    color: "#0D9488",
    fontWeight: "700",
  },
  activeTabIndicator: {
    position: "absolute",
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#0D9488",
  },
});
