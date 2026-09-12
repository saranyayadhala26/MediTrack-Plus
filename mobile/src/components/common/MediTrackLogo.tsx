/**
 * Reusable MediTrack+ Brand Logo Component
 *
 * Displays the canonical MediTrack+ healthcare trinity emblem:
 * - Heart (compassion, cardiovascular wellness, patient care)
 * - Medical Cross (clinical accuracy, medication adherence)
 * - Vitality Leaf (healing, recovery, natural health)
 *
 * High-resolution vector-rendered asset scalable across all device densities.
 */

import React from "react";
import {
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

export interface MediTrackLogoProps {
  /**
   * Width and height of the logo emblem in density-independent pixels.
   * Defaults to 64 (standard header icon dimension).
   */
  size?: number;
  /**
   * Optional custom container style.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Optional custom image style.
   */
  imageStyle?: StyleProp<ImageStyle>;
  /**
   * Optional test identifier for automated testing.
   */
  testID?: string;
  /**
   * Accessibility label for screen readers.
   */
  accessibilityLabel?: string;
}

export const MediTrackLogo: React.FC<MediTrackLogoProps> = ({
  size = 64,
  style,
  imageStyle,
  testID = "meditrack-logo",
  accessibilityLabel = "MediTrack+ logo: heart, medical cross, and leaf emblem",
}) => {
  return (
    <View
      style={[
        styles.container,
        { width: size, height: size },
        style,
      ]}
      testID={testID}
      accessibilityRole="image"
      accessible={true}
      accessibilityLabel={accessibilityLabel}
    >
      <Image
        source={require("../../../assets/logo.png")}
        style={[
          styles.image,
          { width: size, height: size },
          imageStyle,
        ]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    // Hardware accelerated scaling
  },
});
