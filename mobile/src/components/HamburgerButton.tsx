import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useNavSlider } from '../context/NavSliderContext';

interface HamburgerButtonProps {
  color?: string;
}

export default function HamburgerButton({ color = '#ffffff' }: HamburgerButtonProps) {
  const { openSlider } = useNavSlider();

  return (
    <Pressable
      onPress={openSlider}
      style={({ pressed }) => [
        styles.button,
        { opacity: pressed ? 0.6 : 1 },
      ]}
      hitSlop={14}
      accessibilityLabel="Open Navigation Menu"
      accessibilityRole="button"
    >
      <View style={[styles.line, { backgroundColor: color }]} />
      <View style={[styles.line, { backgroundColor: color }]} />
      <View style={[styles.line, { backgroundColor: color }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    gap: 4.5,
  },
  line: {
    width: 22,
    height: 2.5,
    borderRadius: 2,
  },
});
