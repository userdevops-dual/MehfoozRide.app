// frontend/src/screens/auth/SplashScreen.js
// Welcome screen — محفوظ رائیڈ with Create Account and Sign In
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const CHIPS = ['🚺 Female Only', '✅ Verified Drivers', '🛡️ Always Safe'];

export default function SplashScreen({ navigation }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#5C1448', '#C84B7A', '#F08090']} style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🛡️</Text>
        </View>

        <Text style={styles.appNameUrdu}>محفوظ رائیڈ</Text>
        <Text style={styles.appName}>Mehfooz Ride</Text>
        <Text style={styles.tagline}>Where Safety Meets Sisterhood</Text>

        <View style={styles.chipsRow}>
          {CHIPS.map(chip => (
            <View key={chip} style={styles.chip}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.actions, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.secondaryBtn} accessibilityRole="button">
          <Text style={styles.secondaryText}>I already have an account — Sign In</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>For women in Lahore · CNIC-verified accounts</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 30, paddingTop: 90, paddingBottom: 40 },
  inner:       { alignItems: 'center', width: '100%' },
  logoBox:     { width: 110, height: 110, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  logoEmoji:   { fontSize: 54 },
  appNameUrdu: { color: '#fff', fontSize: 38, fontWeight: '800', marginBottom: 2 },
  appName:     { color: 'rgba(255,255,255,0.9)', fontSize: 20, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  tagline:     { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginBottom: 28, fontStyle: 'italic' },
  chipsRow:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chipText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  actions:     { width: '100%', gap: 12 },
  primaryBtn:  { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#8E2A5C', fontSize: 16, fontWeight: '800' },
  secondaryBtn:{ borderRadius: 18, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  secondaryText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  footer:      { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center', marginTop: 4 },
});
