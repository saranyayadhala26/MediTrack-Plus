/**
 * 6-Digit OTP Code Input Component
 * Matches PDF Page 2 / Page 3 / Page 4 references:
 * - Six separate visual input boxes
 * - Seamless keyboard / paste support on Android and iOS
 * - Active teal border on focused box
 * - Red border in error state
 * - "Enter the 6-digit code" descriptive caption
 */

import React, { useRef, useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";

export interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  onComplete?: (code: string) => void;
  style?: StyleProp<ViewStyle>;
}

export const OtpCodeInput: React.FC<OtpCodeInputProps> = ({
  value,
  onChange,
  hasError = false,
  disabled = false,
  onComplete,
  style,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const digits = [0, 1, 2, 3, 4, 5];

  const handlePress = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 6);
    onChange(cleaned);
    if (cleaned.length === 6 && onComplete) {
      onComplete(cleaned);
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Hidden native input handling keyboard & clipboard paste */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        maxLength={6}
        textContentType="oneTimeCode"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={styles.hiddenInput}
        accessibilityLabel="6-digit verification code input"
      />

      {/* 6 Visual Box Containers */}
      <Pressable onPress={handlePress} style={styles.boxesRow}>
        {digits.map((index) => {
          const char = value[index] || "";
          const isCurrentActive = isFocused && index === Math.min(value.length, 5);

          return (
            <View
              key={index}
              style={[
                styles.box,
                Boolean(char) && styles.boxFilled,
                isCurrentActive && styles.boxActive,
                hasError && styles.boxError,
              ]}
            >
              {char ? (
                <Text
                  style={[
                    styles.digitText,
                    hasError && styles.digitTextError,
                  ]}
                >
                  {char}
                </Text>
              ) : isCurrentActive ? (
                <Text style={styles.cursorText}>|</Text>
              ) : null}
            </View>
          );
        })}
      </Pressable>

      {/* Caption text */}
      <Text style={styles.captionText}>Enter the 6-digit code</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
    alignItems: "center",
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  boxesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 320,
    gap: 8,
  },
  box: {
    flex: 1,
    height: 54,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFilled: {
    borderColor: "#CBD5E1",
  },
  boxActive: {
    borderColor: "#0D9488",
    borderWidth: 2,
    backgroundColor: "#FFFFFF",
  },
  boxError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  digitText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  digitTextError: {
    color: "#DC2626",
  },
  cursorText: {
    fontSize: 22,
    fontWeight: "300",
    color: "#0D9488",
  },
  captionText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 10,
    textAlign: "center",
  },
});
