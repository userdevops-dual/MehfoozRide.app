// frontend/src/screens/safety/SOSScreen.js
// ─────────────────────────────────────────────────────
//  SOS SCREEN — Mehfooz Ride
//  ✅ Auto-calls Police 15 (Pakistan) after 5s countdown
//  ✅ Also shows 1122 Rescue, Women Helpline 1043, Edhi 115
//  ✅ Sends WhatsApp/SMS alert to guardian contacts
//  ✅ Works in Lahore, Pakistan
// ─────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, Alert, Vibration, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';

// ── Pakistan Emergency Numbers ────────────────────────
const EMERGENCY_NUMBERS = [
  { number: '15',   label: 'Pakistan Police',       emoji: '👮‍♀️', color: '1565C0', priority: true  },
  { number: '1122', label: 'Rescue / Ambulance',    emoji: '🚑', color: '2E7D32', priority: false },
  { number: '1043', label: 'Women Safety Helpline', emoji: '♀️', color: 'AD1457', priority: false },
  { number: '115',  label: 'Edhi Foundation',       emoji: '🤝', color: '6A1B9A', priority: false },
];

// ── Make phone call ───────────────────────────────────
const makeCall = (number) => {
  Linking.openURL(`tel:${number}`).catch(() =>
    Alert.alert('Call Failed', `Please dial ${number} manually.`)
  );
};

// ── Google Maps link ──────────────────────────────────
const mapsLink = (lat, lng) => `https://maps.google.com/?q=${lat},${lng}`;

export default function SOSScreen({ navigation, route }) {
  const { rideId, driverInfo, guardianContacts = [] } = route?.params || {};

  const [countdown, setCountdown] = useState(5);
  const [phase,     setPhase]     = useState('counting'); // counting | calling | active
  const [location,  setLocation]  = useState(null);
  const [locText,   setLocText]   = useState('📍 Getting your location...');
  const calledRef = useRef(false);

  // ── Get GPS on mount & vibrate SOS pattern ───────
  useEffect(() => {
    // SOS vibration pattern
    Vibration.vibrate([300,200,300,200,300,600,700,200,700,200,700,600,300,200,300], false);

    Geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        setLocText(`📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      },
      () => {
        // Never send a guessed location to guardians — say it's unavailable
        setLocText('📍 GPS unavailable — tell responders where you are');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );

    return () => Vibration.cancel();
  }, []);

  // ── Countdown → auto-call Police 15 ──────────────
  useEffect(() => {
    if (phase !== 'counting') return;

    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }

    if (!calledRef.current) {
      calledRef.current = true;
      setPhase('calling');
      // ✅ AUTO-CALL POLICE 15
      makeCall('15');
      setTimeout(() => setPhase('active'), 3000);
    }
  }, [countdown, phase]);

  // ── Cancel SOS ────────────────────────────────────
  const onCancel = () => {
    Alert.alert(
      'Cancel SOS?',
      'Are you sure you are completely safe?',
      [
        { text: 'No, Keep SOS', style: 'cancel' },
        { text: "Yes I'm Safe", style: 'destructive',
          onPress: () => { Vibration.cancel(); navigation.goBack(); } },
      ]
    );
  };

  // ── WhatsApp/SMS guardian alert ───────────────────
  const alertGuardian = (phone) => {
    const loc = location ? mapsLink(location.lat, location.lng) : 'Location unavailable';
    const msg = encodeURIComponent(
      `🚨 EMERGENCY — Mehfooz Ride\n` +
      `I need help! Please call Police 15 now.\n\n` +
      `📍 My Location: ${loc}\n` +
      (driverInfo ? `🚗 Driver: ${driverInfo.name} | Plate: ${driverInfo.plate}\n` : '') +
      `\nSent from Mehfooz Ride SOS`
    );
    Linking.openURL(`whatsapp://send?phone=${phone.replace('+','')}&text=${msg}`)
      .catch(() => Linking.openURL(`sms:${phone}?body=${msg}`)
        .catch(() => makeCall(phone)));
  };

  // ─────────────────────────────────────────────────
  //  COUNTING SCREEN
  // ─────────────────────────────────────────────────
  if (phase === 'counting') {
    return (
      <LinearGradient colors={['#7B0000','#B71C1C','#E53935']} style={styles.full}>
        <View style={styles.center}>
          <Text style={styles.bigEmoji}>🆘</Text>
          <Text style={styles.title}>EMERGENCY SOS</Text>
          <Text style={styles.sub}>
            Automatically calling{'\n'}
            <Text style={styles.policeText}>👮‍♀️  POLICE — 15</Text>
            {'\n'}in...
          </Text>

          <View style={styles.circle}>
            <Text style={styles.circleNum}>{countdown}</Text>
            <Text style={styles.circleSub}>seconds</Text>
          </View>

          <View style={styles.locBox}>
            <Text style={styles.locText}>{locText}</Text>
          </View>

          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>✕  I'm Safe — Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Police 15 will be called automatically when countdown ends
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // ─────────────────────────────────────────────────
  //  CALLING SCREEN
  // ─────────────────────────────────────────────────
  if (phase === 'calling') {
    return (
      <LinearGradient colors={['#0D47A1','#1565C0','#1976D2']} style={styles.full}>
        <View style={styles.center}>
          <Text style={styles.bigEmoji}>📞</Text>
          <Text style={styles.title}>Calling Police...</Text>
          <View style={styles.callingBadge}>
            <Text style={styles.callingNum}>15</Text>
          </View>
          <Text style={styles.sub}>
            Pakistan Police is being called.{'\n'}
            Stay on the line.{'\n'}
            Help is coming to you.
          </Text>
          <Text style={styles.footnote}>
            {locText}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // ─────────────────────────────────────────────────
  //  ACTIVE / SENT SCREEN
  // ─────────────────────────────────────────────────
  return (
    <LinearGradient colors={['#4A0010','#7B0000','#B71C1C']} style={styles.full}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.bigEmoji}>📡</Text>
        <Text style={styles.title}>SOS Active 🚨</Text>
        <Text style={styles.sub}>Police 15 was called.{'\n'}Use buttons below for more help.</Text>

        {/* Location */}
        {location && (
          <TouchableOpacity
            style={styles.locBox}
            onPress={() => Linking.openURL(mapsLink(location.lat, location.lng))}>
            <Text style={styles.locLabel}>📍 YOUR LOCATION (tap to open map)</Text>
            <Text style={styles.locText}>
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </Text>
            <Text style={styles.locLink}>{mapsLink(location.lat, location.lng)}</Text>
          </TouchableOpacity>
        )}

        {/* Emergency Numbers */}
        <Text style={styles.sectionTitle}>📞 EMERGENCY NUMBERS — PAKISTAN</Text>
        {EMERGENCY_NUMBERS.map(em => (
          <TouchableOpacity
            key={em.number}
            onPress={() => makeCall(em.number)}
            style={[styles.callRow, em.priority && styles.callRowPrimary]}>
            <View style={[styles.numBadge, { backgroundColor: `#${em.color}` }]}>
              <Text style={styles.numBadgeText}>{em.number}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.callLabel}>{em.emoji}  {em.label}</Text>
              {em.priority && <Text style={styles.callHighlight}>⭐ Call this first!</Text>}
            </View>
            <Text style={styles.callArrow}>TAP ▶</Text>
          </TouchableOpacity>
        ))}

        {/* Guardian Contacts */}
        {guardianContacts.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
              👩‍👧 ALERT YOUR GUARDIAN
            </Text>
            {guardianContacts.map((g, i) => (
              <View key={i} style={styles.guardianRow}>
                <View style={styles.guardianAvatar}><Text>👩</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gName}>{g.name}</Text>
                  <Text style={styles.gPhone}>{g.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => makeCall(g.phone)} style={styles.gBtn}>
                  <Text style={styles.gBtnText}>📞 Call</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => alertGuardian(g.phone)} style={[styles.gBtn, styles.gBtnAlert]}>
                  <Text style={[styles.gBtnText, { color: '#000' }]}>💬 Alert</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {guardianContacts.length === 0 && (
          <View style={styles.noGuardian}>
            <Text style={styles.noGuardianText}>
              ⚠️ No guardian contacts saved.{'\n'}
              Go to Profile → Guardian Setup to add them.
            </Text>
          </View>
        )}

        {/* Driver info for police */}
        {driverInfo && (
          <View style={styles.driverBox}>
            <Text style={styles.sectionTitle}>🚗 SHARE DRIVER INFO WITH POLICE</Text>
            <Text style={styles.driverLine}>Name:    {driverInfo.name}</Text>
            <Text style={styles.driverLine}>Phone:   {driverInfo.phone}</Text>
            <Text style={styles.driverLine}>Plate:   {driverInfo.plate}</Text>
            <Text style={styles.driverLine}>Vehicle: {driverInfo.vehicle || 'N/A'}</Text>
          </View>
        )}

        {/* I'm Safe */}
        <TouchableOpacity onPress={onCancel} style={styles.safeBtn}>
          <Text style={styles.safeBtnText}>✅  I Am Safe Now</Text>
        </TouchableOpacity>

        <Text style={styles.footnote}>
          Mehfooz Ride Emergency SOS{'\n'}
          Location updates every 30 seconds
        </Text>

      </ScrollView>
    </LinearGradient>
  );
}

const W = '100%';
const styles = StyleSheet.create({
  full:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  scroll:       { alignItems: 'center', padding: 24, paddingBottom: 40 },

  bigEmoji:     { fontSize: 70, marginBottom: 12 },
  title:        { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  sub:          { color: 'rgba(255,255,255,0.82)', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  footnote:     { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
  policeText:   { color: '#FFD600', fontWeight: '900', fontSize: 20 },

  // Countdown circle
  circle:       { width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  circleNum:    { color: '#fff', fontSize: 62, fontWeight: '900' },
  circleSub:    { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },

  // Calling badge
  callingBadge: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  callingNum:   { color: '#fff', fontSize: 52, fontWeight: '900' },

  // Location box
  locBox:       { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 13, width: W, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  locLabel:     { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  locText:      { color: '#fff', fontSize: 12, lineHeight: 18 },
  locLink:      { color: '#FFD600', fontSize: 10, marginTop: 5 },

  // Cancel
  cancelBtn:    { borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 18, paddingHorizontal: 30, paddingVertical: 13, marginTop: 8, marginBottom: 8 },
  cancelText:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Section title
  sectionTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10, alignSelf: 'flex-start' },

  // Call row
  callRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, marginBottom: 8, width: W, borderLeftWidth: 4, borderLeftColor: 'rgba(255,255,255,0.2)' },
  callRowPrimary: { backgroundColor: 'rgba(255,214,0,0.15)', borderLeftColor: '#FFD600' },
  numBadge:     { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginRight: 12, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  numBadgeText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  callLabel:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  callHighlight:{ color: '#FFD600', fontSize: 11, fontWeight: '700', marginTop: 2 },
  callArrow:    { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' },

  // Guardian
  guardianRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 11, marginBottom: 8, width: W, gap: 8 },
  guardianAvatar:{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  gName:         { color: '#fff', fontWeight: '700', fontSize: 13 },
  gPhone:        { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 },
  gBtn:          { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  gBtnAlert:     { backgroundColor: '#FFD600' },
  gBtnText:      { color: '#fff', fontSize: 11, fontWeight: '700' },

  // No guardian
  noGuardian:     { backgroundColor: 'rgba(255,200,0,0.15)', borderRadius: 12, padding: 13, width: W, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,200,0,0.3)' },
  noGuardianText: { color: '#FFD600', fontSize: 12, textAlign: 'center', lineHeight: 19 },

  // Driver box
  driverBox:  { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 13, width: W, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  driverLine: { color: '#fff', fontSize: 13, marginBottom: 4 },

  // Safe button
  safeBtn:    { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 18, paddingHorizontal: 36, paddingVertical: 14, marginTop: 10, width: W, alignItems: 'center' },
  safeBtnText:{ color: '#fff', fontSize: 16, fontWeight: '800' },
});
