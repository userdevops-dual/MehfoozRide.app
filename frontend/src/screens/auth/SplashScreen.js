// frontend/src/screens/auth/SplashScreen.js
// FIXED: Was in screens/SplashScreen.js — AppNavigator expects screens/auth/SplashScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { GRAD, C } from '../../utils/theme';

const CHIPS = ['🚺 Female Only', '✅ Verified Drivers', '🛡️ Always Safe'];

export default function SplashScreen({ navigation }) {
  const [dot, setDot] = useState(0);
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 800, useNativeDriver: true,
    }).start();

    // Cycling dots
    const dotTimer = setInterval(() => setDot(d => (d + 1) % 4), 400);

    // Navigate to Login after 3.2 seconds
    const navTimer = setTimeout(() => {
      navigation.replace('Login');
    }, 3200);

    return () => {
      clearInterval(dotTimer);
      clearTimeout(navTimer);
    };
  }, []);

  return (
    <LinearGradient
      colors={['#5C1448', '#C84B7A', '#F08090']}
      style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        {/* Logo */}
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🛡️</Text>
        </View>

        <Text style={styles.appName}>Mehfooz Ride</Text>
        <Text style={styles.tagline}>Where Safety Meets Sisterhood</Text>

        {/* Feature chips */}
        <View style={styles.chipsRow}>
          {CHIPS.map(chip => (
            <View key={chip} style={styles.chip}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>

        {/* Loading dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                { width: i === dot ? 24 : 8, backgroundColor: i === dot ? '#fff' : 'rgba(255,255,255,0.4)' },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  inner:     { alignItems: 'center', width: '100%' },
  logoBox:   { width: 110, height: 110, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  logoEmoji: { fontSize: 54 },
  appName:   { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  tagline:   { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginBottom: 40, fontStyle: 'italic' },
  chipsRow:  { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 50 },
  chip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chipText:  { color: '#fff', fontSize: 12, fontWeight: '600' },
  dotsRow:   { flexDirection: 'row', gap: 6 },
  dot:       { height: 8, borderRadius: 4 },
});
