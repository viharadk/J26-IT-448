import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import LeftSliderNav from '@/components/LeftSliderNav';
import { NavSliderProvider } from '@/context/NavSliderContext';
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function TabLayoutInner() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* 
        Bottom tabs are completely hidden to avoid overlapping or blocking access
        on mobile & web. Navigation is handled via the left-side Slider panel!
      */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        {/* Hidden screen */}
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs>

      {/* Left-Side Slider Navigation */}
      <LeftSliderNav />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavSliderProvider>
          <TabLayoutInner />
        </NavSliderProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
});