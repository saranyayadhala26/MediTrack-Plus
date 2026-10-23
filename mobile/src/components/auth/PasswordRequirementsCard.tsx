/**
 * Password Requirements Card Component
 * Matches PDF Page 1 & Page 4 references:
 * - Subtle mint container background (#F0FDFA) with #CCFBF1 border
 * - Header instruction
 * - Real-time validation checklist with checkmark/cross indicators:
 *   1. At least 8 characters
 *   2. Include one uppercase letter
 *   3. Include one number
 *   4. Include one special character
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface PasswordRequirementsCardProps {
  password: string;
  showErrors?: boolean;
}

export const PasswordRequirementsCard: React.FC<PasswordRequirementsCardProps> = ({
  password,
  showErrors = false,
}) => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const rules = [
    { label: "At least 8 characters", valid: hasMinLength },
    { label: "Include one uppercase letter", valid: hasUppercase },
    { label: "Include one number", valid: hasNumber },
    { label: "Include one special character", valid: hasSpecial },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.headerText}>
        Your password should be secure and meet the required password rules.
      </Text>

      <View style={styles.rulesList}>
        {rules.map((rule, idx) => {
          const isMet = rule.valid;
          const isError = !isMet && showErrors && password.length > 0;

          return (
            <View key={idx} style={styles.ruleRow}>
              <Ionicons
                name={
                  isMet
                    ? "checkmark-circle"
                    : isError
                    ? "close-circle"
                    : "ellipse-outline"
                }
                size={16}
                color={
                  isMet
                    ? "#16A34A"
                    : isError
                    ? "#DC2626"
                    : "#94A3B8"
                }
                style={styles.ruleIcon}
              />
              <Text
                style={[
                  styles.ruleText,
                  isMet && styles.ruleTextValid,
                  isError && styles.ruleTextInvalid,
                ]}
              >
                {rule.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
  },
  headerText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 10,
  },
  rulesList: {
    gap: 6,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ruleIcon: {
    marginRight: 8,
  },
  ruleText: {
    fontSize: 13,
    color: "#64748B",
  },
  ruleTextValid: {
    color: "#0F766E",
    fontWeight: "500",
  },
  ruleTextInvalid: {
    color: "#DC2626",
  },
});
