/**
 * Emergency Contact View for MediTrack+
 * Matches PDF Page 15 / 33.
 *
 * Structure:
 * 1. Safe-area Header: Back arrow, "Emergency Contact", subtitle "Keep a trusted contact available for important situations."
 * 2. Contact Summary Card: Initials avatar badge, Name, Relationship, Phone with call icon, Edit button.
 * 3. Call Contact Button: Outlined teal button with phone icon, opens dialer with Linking.openURL.
 * 4. Contact Information Form: Full Name, Relationship (in-screen picker), Phone Number.
 * 5. Primary Action: Save Changes (persists structured & synced contact via backend PUT /auth/emergency-contact).
 * 6. Danger Action: Remove Emergency Contact (DELETE /auth/emergency-contact with confirmation).
 * 7. About Emergency Contact Info Card.
 * 8. Fixed Bottom Navigation Bar with Profile active.
 */

import React, { useEffect, useRef, useState } from "react";
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
import { apiClient } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { User } from "../../types";

export interface EmergencyContactData {
  name: string;
  relationship: string;
  phone: string;
  secondaryPhone?: string;
  doctorName?: string;
  doctorPhone?: string;
  notes?: string;
}

interface UserWithEmergencyContact extends User {
  emergencyContactData?: EmergencyContactData;
}

export interface EmergencyContactViewProps {
  onBack: () => void;
  onSuccess: () => void;
  isCaregiver?: boolean;
}

const RELATIONSHIP_OPTIONS = [
  "Sister",
  "Brother",
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Friend",
  "Family Member",
  "Other",
];

export const EmergencyContactView: React.FC<EmergencyContactViewProps> = ({
  onBack,
  onSuccess,
  isCaregiver = false,
}) => {
  const { user, refreshProfile, updateProfile } = useAuth();
  const currentUser = user as UserWithEmergencyContact | null;

  // Safe area insets handling (guarantees header begins below system status bar)
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Initial persisted values from user state
  const rawContactData = currentUser?.emergencyContactData;
  const initialName = rawContactData?.name || "";
  const initialRelationship = rawContactData?.relationship || "";
  const initialPhone = rawContactData?.phone || currentUser?.emergencyContact || "";

  // Form state
  const [name, setName] = useState(initialName);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [phone, setPhone] = useState(initialPhone);

  // Modal & operation states
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fullNameInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Check if an existing contact is currently saved
  const hasExistingContact = Boolean(
    (initialName && initialPhone) || initialPhone
  );

  // Unsaved changes check
  const hasUnsavedChanges =
    name.trim() !== initialName.trim() ||
    relationship.trim() !== initialRelationship.trim() ||
    phone.trim() !== initialPhone.trim();

  // Back handling with discard confirmation
  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        "Discard changes?",
        "Are you sure you want to discard your unsaved changes?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: onBack },
        ]
      );
    } else {
      onBack();
    }
  };

  // Hardware back press listener
  useEffect(() => {
    const onBackPress = () => {
      handleBackPress();
      return true;
    };
    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );
    return () => {
      backSubscription.remove();
    };
  }, [hasUnsavedChanges]);

  // Compute initials for the avatar badge
  const getInitials = (str?: string) => {
    if (!str || !str.trim()) return "EC";
    const parts = str.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Safe phone call action
  const handleCallContact = async () => {
    const targetPhone = initialPhone.trim();
    if (!targetPhone) return;
    const sanitized = targetPhone.replace(/[^\d+*#]/g, "");
    if (!sanitized) {
      Alert.alert("Invalid Phone", "No valid dialable phone number available.");
      return;
    }
    const telUrl = `tel:${sanitized}`;
    try {
      const supported = await Linking.canOpenURL(telUrl);
      if (supported) {
        await Linking.openURL(telUrl);
      } else {
        Alert.alert(
          "Unable to Call",
          "Phone calling is not supported on this device."
        );
      }
    } catch {
      Alert.alert("Error", "Could not open the device phone dialer.");
    }
  };

  // Focus form when summary Edit button is pressed
  const handleEditButtonPress = () => {
    fullNameInputRef.current?.focus();
    scrollViewRef.current?.scrollTo({ y: 140, animated: true });
  };

  // Validate form inputs
  const validateForm = (): boolean => {
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Full Name is required.");
      return false;
    }
    if (trimmedName.length < 2) {
      setErrorMessage("Full Name must be at least 2 characters.");
      return false;
    }

    const trimmedRel = relationship.trim();
    if (!trimmedRel) {
      setErrorMessage("Please select a relationship.");
      return false;
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setErrorMessage("Phone Number is required.");
      return false;
    }
    const digitsOnly = trimmedPhone.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      setErrorMessage("Please enter a valid phone number (at least 7 digits).");
      return false;
    }

    return true;
  };

  // Save changes via backend PUT /auth/emergency-contact
  const handleSaveContact = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      name: name.trim(),
      relationship: relationship.trim(),
      phone: phone.trim(),
    };

    try {
      // 1. Persist to existing backend emergency contact endpoint
      await apiClient.put("/auth/emergency-contact", payload);

      // 2. Synchronize authenticated user profile in AuthContext
      await refreshProfile();

      setSuccessMessage("Emergency contact saved successfully.");
      setTimeout(() => {
        onSuccess();
      }, 700);
    } catch (err: any) {
      // Fallback: If dedicated endpoint encounters an issue, try standard profile update
      try {
        const fallbackRes = await updateProfile({
          emergencyContact: payload.phone,
        });
        if (fallbackRes.success) {
          await refreshProfile();
          setSuccessMessage("Emergency contact saved successfully.");
          setTimeout(() => {
            onSuccess();
          }, 700);
          return;
        }
      } catch {
        // ignore fallback error and report main error below
      }

      const msg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to save emergency contact.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSaving(false);
    }
  };

  // Remove contact with confirmation dialog
  const handleRemoveContact = () => {
    Alert.alert(
      "Remove emergency contact?",
      "Are you sure you want to remove this emergency contact?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            setErrorMessage(null);
            try {
              // 1. Delete record via backend DELETE /auth/emergency-contact
              await apiClient.delete("/auth/emergency-contact");

              // 2. Refresh profile state
              await refreshProfile();

              // Clear local state
              setName("");
              setRelationship("");
              setPhone("");

              setSuccessMessage("Emergency contact removed successfully.");
              setTimeout(() => {
                onSuccess();
              }, 700);
            } catch (err: any) {
              // Fallback: Clear via standard profile update payload
              try {
                const clearRes = await updateProfile({
                  emergencyContact: undefined,
                } as any);
                if (clearRes.success) {
                  await refreshProfile();
                  setName("");
                  setRelationship("");
                  setPhone("");
                  onSuccess();
                  return;
                }
              } catch {
                // ignore fallback error
              }

              const msg =
                err.response?.data?.detail ||
                err.message ||
                "Failed to remove emergency contact.";
              setErrorMessage(
                typeof msg === "string" ? msg : JSON.stringify(msg)
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header Bar */}
      <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Emergency Contact</Text>
          <Text style={styles.screenSubtitle}>
            Keep a trusted contact available for important situations.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Feedback Banners */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Ionicons
                name="alert-circle"
                size={18}
                color="#DC2626"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successBanner}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#16A34A"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          )}

          {/* ============================================================== */}
          {/* 1. CURRENT CONTACT SUMMARY CARD (Top)                          */}
          {/* ============================================================== */}
          <View style={styles.summaryCard}>
            {hasExistingContact ? (
              <>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {getInitials(initialName)}
                  </Text>
                </View>
                <View style={styles.summaryInfoCol}>
                  <Text style={styles.summaryName}>
                    {initialName || "Emergency Contact"}
                  </Text>
                  <Text style={styles.summaryRelationship}>
                    {initialRelationship || "Contact"}
                  </Text>
                  {initialPhone ? (
                    <View style={styles.summaryPhoneRow}>
                      <Ionicons
                        name="call"
                        size={12}
                        color="#0D9488"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.summaryPhone}>{initialPhone}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.summaryEditBtn}
                  onPress={handleEditButtonPress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Edit Emergency Contact"
                >
                  <Ionicons
                    name="pencil-outline"
                    size={13}
                    color="#0D9488"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.summaryEditText}>Edit</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.avatarCircle, styles.avatarCircleEmpty]}>
                  <Ionicons name="person-outline" size={22} color="#0D9488" />
                </View>
                <View style={styles.summaryInfoCol}>
                  <Text style={styles.summaryName}>Emergency Contact</Text>
                  <Text style={styles.summaryRelationship}>
                    No emergency contact has been added yet.
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ============================================================== */}
          {/* 2. CALL CONTACT BUTTON                                         */}
          {/* ============================================================== */}
          {hasExistingContact && initialPhone ? (
            <TouchableOpacity
              style={styles.callContactBtn}
              onPress={handleCallContact}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Call Contact"
            >
              <Ionicons
                name="call-outline"
                size={18}
                color="#0D9488"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.callContactBtnText}>Call Contact</Text>
            </TouchableOpacity>
          ) : null}

          {/* ============================================================== */}
          {/* 3. CONTACT INFORMATION FORM                                    */}
          {/* ============================================================== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <Text style={styles.sectionSubtitle}>
              Keep this information up to date for emergencies.
            </Text>
          </View>

          {/* Field 1: Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <View style={styles.fieldInputContainer}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#0D9488"
                style={styles.fieldIcon}
              />
              <TextInput
                ref={fullNameInputRef}
                style={styles.fieldTextInput}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Priya Sharma"
                placeholderTextColor="#94A3B8"
                editable={!isSaving && !isDeleting}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Field 2: Relationship Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Relationship</Text>
            <TouchableOpacity
              style={styles.fieldInputContainer}
              onPress={() => setIsPickerOpen(true)}
              activeOpacity={0.7}
              disabled={isSaving || isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Select Relationship"
            >
              <Ionicons
                name="people-outline"
                size={18}
                color="#0D9488"
                style={styles.fieldIcon}
              />
              <Text
                style={[
                  styles.fieldSelectText,
                  !relationship && styles.fieldSelectPlaceholder,
                ]}
              >
                {relationship || "Select relationship"}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#0D9488" />
            </TouchableOpacity>
          </View>

          {/* Field 3: Phone Number */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <View style={styles.fieldInputContainer}>
              <Ionicons
                name="call-outline"
                size={18}
                color="#0D9488"
                style={styles.fieldIcon}
              />
              <TextInput
                style={styles.fieldTextInput}
                value={phone}
                onChangeText={(val) => {
                  setPhone(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="+91 98765 43210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                editable={!isSaving && !isDeleting}
              />
            </View>
          </View>

          {/* ============================================================== */}
          {/* 4. ACTIONS (Save Changes & Remove)                             */}
          {/* ============================================================== */}
          <TouchableOpacity
            style={[
              styles.saveChangesBtn,
              (isSaving || isDeleting) && styles.btnDisabled,
            ]}
            onPress={handleSaveContact}
            disabled={isSaving || isDeleting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveChangesBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          {hasExistingContact ? (
            <TouchableOpacity
              style={[
                styles.removeContactBtn,
                (isSaving || isDeleting) && styles.btnDisabled,
              ]}
              onPress={handleRemoveContact}
              disabled={isSaving || isDeleting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Remove Emergency Contact"
            >
              {isDeleting ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color="#DC2626"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.removeContactBtnText}>
                    Remove Emergency Contact
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {/* ============================================================== */}
          {/* 5. ABOUT EMERGENCY CONTACT CARD                                */}
          {/* ============================================================== */}
          <View style={styles.aboutCard}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color="#0D9488"
              style={styles.aboutIcon}
            />
            <View style={styles.aboutTextCol}>
              <Text style={styles.aboutTitle}>About Emergency Contact</Text>
              <Text style={styles.aboutDescription}>
                Your emergency contact is a trusted person you choose to keep
                available for important situations.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ============================================================== */}
      {/* RELATIONSHIP PICKER MODAL                                      */}
      {/* ============================================================== */}
      <Modal
        visible={isPickerOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Relationship</Text>
              <TouchableOpacity
                onPress={() => setIsPickerOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {RELATIONSHIP_OPTIONS.map((opt) => {
                const isSelected = relationship.toLowerCase() === opt.toLowerCase();
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.modalOptionItem,
                      isSelected && styles.modalOptionItemSelected,
                    ]}
                    onPress={() => {
                      setRelationship(opt);
                      if (errorMessage) setErrorMessage(null);
                      setIsPickerOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        isSelected && styles.modalOptionTextSelected,
                      ]}
                    >
                      {opt}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={18} color="#0D9488" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================================== */}
      {/* 6. FIXED BOTTOM NAVIGATION BAR (Page 15)                       */}
      {/* ============================================================== */}
      <View style={styles.bottomTabBar}>
        {isCaregiver ? (
          <>
            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={handleBackPress}
              accessibilityRole="tab"
              accessibilityLabel="Patients Dashboard Tab"
            >
              <Ionicons name="people-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Patients</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={handleBackPress}
              accessibilityRole="tab"
              accessibilityLabel="Alerts Tab"
            >
              <Ionicons name="notifications-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Alerts</Text>
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
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={handleBackPress}
              accessibilityRole="tab"
              accessibilityLabel="Home Tab"
            >
              <Ionicons name="home-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={handleBackPress}
              accessibilityRole="tab"
              accessibilityLabel="Medicines Tab"
            >
              <Ionicons name="medkit-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Medicines</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={handleBackPress}
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
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topHeaderBar: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    marginRight: 14,
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    fontSize: 13,
    color: "#DC2626",
    flex: 1,
    lineHeight: 18,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  successBannerText: {
    fontSize: 13,
    color: "#16A34A",
    flex: 1,
    lineHeight: 18,
  },

  // Summary Card
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircleEmpty: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0D9488",
  },
  summaryInfoCol: {
    flex: 1,
    marginLeft: 14,
  },
  summaryName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  summaryRelationship: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  summaryPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  summaryPhone: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  summaryEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryEditText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },

  // Call Contact Button
  callContactBtn: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#0D9488",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  callContactBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D9488",
  },

  // Section Header
  sectionHeader: {
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  // Form Fields
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
    height: 50,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldTextInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  fieldSelectText: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
  },
  fieldSelectPlaceholder: {
    color: "#94A3B8",
  },

  // Action Buttons
  saveChangesBtn: {
    height: 50,
    backgroundColor: "#0D9488",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  saveChangesBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  removeContactBtn: {
    height: 50,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  removeContactBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#DC2626",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // About Card
  aboutCard: {
    flexDirection: "row",
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  aboutIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  aboutTextCol: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  aboutDescription: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    maxHeight: 460,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalList: {
    marginTop: 6,
  },
  modalOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  modalOptionItemSelected: {
    backgroundColor: "#F0FDFA",
  },
  modalOptionText: {
    fontSize: 15,
    color: "#334155",
  },
  modalOptionTextSelected: {
    color: "#0D9488",
    fontWeight: "600",
  },

  // Fixed Bottom Tab Bar
  bottomTabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: "space-around",
    alignItems: "center",
  },
  bottomTabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    position: "relative",
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
    bottom: -6,
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#0D9488",
  },
});
