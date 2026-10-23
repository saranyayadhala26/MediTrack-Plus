/**
 * Reusable Decorative Mint Botanical Leaves for Auth Screens
 * Matches PDF Pages 1-5 MediTrack+ branding.
 */

import React from "react";
import { StyleSheet, View } from "react-native";

export const AuthBotanicalLeaves: React.FC = () => {
  return (
    <View style={styles.topRightBotanical} pointerEvents="none">
      <View style={styles.leafStem} />
      <View style={[styles.leafShape, styles.leaf1]} />
      <View style={[styles.leafShape, styles.leaf2]} />
      <View style={[styles.leafShape, styles.leaf3]} />
      <View style={[styles.leafShape, styles.leaf4]} />
    </View>
  );
};

const styles = StyleSheet.create({
  topRightBotanical: {
    position: "absolute",
    top: 0,
    right: -10,
    width: 140,
    height: 140,
    zIndex: 0,
    opacity: 0.5,
  },
  leafStem: {
    position: "absolute",
    top: 20,
    right: 55,
    width: 2,
    height: 85,
    backgroundColor: "#A7F3D0",
    transform: [{ rotate: "32deg" }],
  },
  leafShape: {
    position: "absolute",
    backgroundColor: "#99F6E4",
    borderTopLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  leaf1: {
    top: 14,
    right: 18,
    width: 36,
    height: 22,
    transform: [{ rotate: "-25deg" }],
  },
  leaf2: {
    top: 38,
    right: 34,
    width: 42,
    height: 24,
    transform: [{ rotate: "-40deg" }],
  },
  leaf3: {
    top: 64,
    right: 18,
    width: 40,
    height: 22,
    transform: [{ rotate: "-15deg" }],
  },
  leaf4: {
    top: 78,
    right: 48,
    width: 32,
    height: 18,
    transform: [{ rotate: "-55deg" }],
  },
});
