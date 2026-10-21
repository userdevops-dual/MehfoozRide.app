// src/screens/auth/RoleSelectScreen.js — "Continue as Passenger / Driver"
// Shown after login or signup. The same female-only account is used for both;
// driver mode needs a driver account (license + vehicle + admin approval).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuth, allowedModes } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

export default function RoleSelectScreen() {
  const { user, setMode, logout } = useAuth();
  const canDrive  = allowedModes(user).includes('driver');
  const approved  = user?.isVerified === true;

  const chooseDriver = () => {
    if (!canDrive) {
      Alert.alert(
        'Driver account needed',
        'Your account is registered as a passenger. To drive with Mehfooz Ride you need a driver account with your license and vehicle details, approved by our team.\n\nFor now, please continue as a passenger.',
        [{ text: 'OK' }]
      );
      return;
    }
    setMode('driver');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ flexGrow: 1 }}>
      <LinearGradient colors={GRAD.primary} style={styles.banner}>
        <Text style={styles.hello}>Assalam o Alaikum 🌸</Text>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.sub}>How would you like to use محفوظ رائیڈ today?</Text>
      </LinearGradient>

      <View style={styles.body}>
        <TouchableOpacity onPress={() => setMode('passenger')} style={styles.card} accessibilityRole="button">
          <Text style={styles.icon}>👩</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Continue as Passenger</Text>
            <Text style={styles.desc}>Book safe rides with verified female drivers</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={chooseDriver} style={[styles.card, !canDrive && styles.cardDisabled]} accessibilityRole="button">
          <Text style={styles.icon}>🚗</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Continue as Driver</Text>
            <Text style={styles.desc}>
              {!canDrive
                ? 'Requires a driver account'
                : approved ? 'Go online and accept ride requests' : 'Your driver account is waiting for admin approval'}
            </Text>
          </View>
          {canDrive && !approved && <View style={styles.pending}><Text style={styles.pendingText}>PENDING</Text></View>}
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <Text style={styles.note}>🛡️ Both modes are for verified female users only. You can switch later from your Profile.</Text>

        <TouchableOpacity onPress={logout} style={styles.logout}>
          <Text style={styles.logoutText}>Not you? Log out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.bg },
  banner:       { padding: 28, paddingTop: 70, paddingBottom: 40 },
  hello:        { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  name:         { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 4 },
  sub:          { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 8 },
  body:         { padding: 20, gap: 14 },
  card:         { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 20, backgroundColor: C.white, borderWidth: 2, borderColor: C.border },
  cardDisabled: { opacity: 0.6 },
  icon:         { fontSize: 34 },
  title:        { fontSize: 16, fontWeight: '800', color: C.text },
  desc:         { fontSize: 12, color: C.muted, marginTop: 3 },
  arrow:        { fontSize: 20, color: C.rose, fontWeight: '800' },
  pending:      { backgroundColor: C.goldLight, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  pendingText:  { fontSize: 9, fontWeight: '800', color: '#A0601A' },
  note:         { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  logout:       { alignSelf: 'center', padding: 10 },
  logoutText:   { color: C.rose, fontWeight: '700', fontSize: 13 },
});
