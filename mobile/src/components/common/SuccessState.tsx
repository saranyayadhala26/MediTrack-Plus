/**
 * MediTrack+ Reusable Success / Confirmation State System
 * Visual Reference: PDF Page 6 (Success / Confirmation State System)
 *
 * Supports:
 * - 1. Medicine Created ("Medicine added", info card, "Done", "View Medicine")
 * - 2. Profile / Settings Updated ("Changes saved", "Done")
 * - 3. Caregiver Request Sent ("Request sent", info card, "Done")
 * - 4. Password Changed ("Password changed", info card, "Done")
 * - 5. Authentication Success ("Verification code sent", "Email verified!", CTA)
 * - 6. Custom success confirmations
 */

import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "../../constants/theme";

export type SuccessStateVariant =
  | "medicine_added"
  | "changes_saved"
  | "request_sent"
  | "password_changed"
  | "auth_code_sent"
  | "email_verified"
  | "custom";

export interface SuccessInfoCardProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
}

export interface SuccessStateProps {
  /**
   * Pre-packaged variant matching PDF Page 6 specifications.
   */
  variant?: SuccessStateVariant;
  /**
   * Primary title.
   */
  title?: string;
  /**
   * Secondary description / message.
   */
  message?: string;
  /**
   * Optional info card displayed below the message.
   */
  infoCard?: SuccessInfoCardProps;
  /**
   * Primary CTA button title (e.g. "Done", "Go to Verify Code", "Continue to Sign In").
   */
  actionTitle?: string;
  /**
   * Primary CTA callback.
   */
  onActionPress?: () => void;
  /**
   * Optional secondary action title (e.g. "View Medicine").
   */
  secondaryActionTitle?: string;
  /**
   * Secondary action callback.
   */
  onSecondaryActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  variant = "custom",
  title,
  message,
  infoCard,
  actionTitle = "Done",
  onActionPress,
  secondaryActionTitle,
  onSecondaryActionPress,
  style,
}) => {
  // Resolve defaults based on variant
  let resolvedTitle = title || "Success!";
  let resolvedMessage =
    message || "Your action was completed successfully.";
  let resolvedActionTitle = actionTitle;
  let resolvedSecondaryTitle = secondaryActionTitle;
  let resolvedInfoCard = infoCard;
  let resolvedMainIcon: keyof typeof Ionicons.glyphMap = "checkmark";
  let isEnvelopeAuthIllustration = false;

  switch (variant) {
    case "medicine_added":
      resolvedTitle = title || "Medicine added";
      resolvedMessage =
        message || "Your medicine has been added to your medication list.";
      resolvedActionTitle = actionTitle || "Done";
      if (!resolvedSecondaryTitle && onSecondaryActionPress) {
        resolvedSecondaryTitle = "View Medicine";
      }
      break;

    case "changes_saved":
      resolvedTitle = title || "Changes saved";
      resolvedMessage =
        message || "Your profile and settings were saved successfully.";
      resolvedActionTitle = actionTitle || "Done";
      break;

    case "request_sent":
      resolvedTitle = title || "Request sent";
      resolvedMessage =
        message || "Your caregiver linking request has been sent successfully.";
      resolvedActionTitle = actionTitle || "Done";
      if (!resolvedInfoCard) {
        resolvedInfoCard = {
          iconName: "person-outline",
          subtitle:
            "The caregiver will be notified and can accept your request from their MediTrack+ account.",
        };
      }
      break;

    case "password_changed":
      resolvedTitle = title || "Password changed";
      resolvedMessage =
        message || "Your password has been updated successfully.";
      resolvedActionTitle = actionTitle || "Done";
      if (!resolvedInfoCard) {
        resolvedInfoCard = {
          iconName: "lock-closed-outline",
          subtitle:
            "You can now use your new password to log in to your MediTrack+ account.",
        };
      }
      break;

    case "auth_code_sent":
      resolvedTitle = title || "Verification code sent";
      resolvedMessage =
        message || "We sent a password reset code to your email address.";
      resolvedActionTitle = actionTitle || "Go to Verify Code";
      isEnvelopeAuthIllustration = true;
      break;

    case "email_verified":
      resolvedTitle = title || "Email verified!";
      resolvedMessage =
        message ||
        "Your email has been successfully verified. You can now sign in to MediTrack+.";
      resolvedActionTitle = actionTitle || "Continue to Sign In";
      isEnvelopeAuthIllustration = true;
      break;

    case "custom":
    default:
      if (title) resolvedTitle = title;
      if (message) resolvedMessage = message;
      break;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Main Illustration (PDF Page 6 Anatomy) */}
      {isEnvelopeAuthIllustration ? (
        /* Envelope Illustration with Green Success Badge */
        <View style={styles.authIconCircle}>
          <Ionicons name="mail" size={44} color="#0D9488" />
          <View style={styles.authCheckBadge}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        </View>
      ) : (
        /* 88x88px Soft Mint Circular Container with Green Checkmark */
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={44} color="#16A34A" />
        </View>
      )}

      {/* Primary Title (22-24px, Bold, #0F172A) */}
      <Text style={styles.titleText}>{resolvedTitle}</Text>

      {/* Description Text (14-15px, Regular, #64748B) */}
      <Text style={styles.messageText}>{resolvedMessage}</Text>

      {/* Optional Info Card (Matching PDF Page 6 variants) */}
      {resolvedInfoCard ? (
        <TouchableOpacity
          style={styles.infoCard}
          onPress={resolvedInfoCard.onPress}
          disabled={!resolvedInfoCard.onPress}
          activeOpacity={resolvedInfoCard.onPress ? 0.75 : 1}
        >
          {resolvedInfoCard.iconName ? (
            <View style={styles.infoCardIconBox}>
              <Ionicons
                name={resolvedInfoCard.iconName}
                size={20}
                color="#0D9488"
              />
            </View>
          ) : null}
          <View style={styles.infoCardTextCol}>
            {resolvedInfoCard.title ? (
              <Text style={styles.infoCardTitle}>
                {resolvedInfoCard.title}
              </Text>
            ) : null}
            {resolvedInfoCard.subtitle ? (
              <Text style={styles.infoCardSubtitle}>
                {resolvedInfoCard.subtitle}
              </Text>
            ) : null}
          </View>
          {resolvedInfoCard.onPress ? (
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          ) : null}
        </TouchableOpacity>
      ) : null}

      {/* Primary Action Button (Full-width, 48-52px height, 12px radius, #0D9488) */}
      {onActionPress ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onActionPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={resolvedActionTitle}
        >
          <Text style={styles.primaryButtonText}>{resolvedActionTitle}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Optional Secondary Action Button (Outline / Link) */}
      {resolvedSecondaryTitle && onSecondaryActionPress ? (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondaryActionPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={resolvedSecondaryTitle}
        >
          <Text style={styles.secondaryButtonText}>
            {resolvedSecondaryTitle}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  /* 88x88px Soft Mint Circular Container (PDF Page 6 Anatomy) */
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  /* Auth Envelope Illustration with Green Badge */
  authIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    position: "relative",
  },
  authCheckBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  /* Title Text (22-24px, Bold, #0F172A) */
  titleText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  /* Description Text (14-15px, Regular, #64748B) */
  messageText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 24,
  },
  /* Info / Confirmation Card */
  infoCard: {
    width: "100%",
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  infoCardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  infoCardTextCol: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  infoCardSubtitle: {
    fontSize: 13,
    color: "#0F766E",
    lineHeight: 18,
  },
  /* Full-width Primary CTA Button (48-52px height, 12px radius, #0D9488) */
  primaryButton: {
    width: "100%",
    height: 50,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  /* Optional Secondary Action Button */
  secondaryButton: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#0D9488",
  },
  secondaryButtonText: {
    color: "#0D9488",
    fontSize: 15,
    fontWeight: "600",
  },
});
