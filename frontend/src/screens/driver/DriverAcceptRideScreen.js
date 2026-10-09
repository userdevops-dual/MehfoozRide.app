// src/screens/driver/DriverAcceptRideScreen.js
// Driver ride: Accept → Arrive → OTP (with fake-ride detection) → In Progress → Complete
// NEW: Same-gender passenger verification dialog

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { rideAPI } from '../../services/api';
import {
  emitRideAccepted, emitDriverArrived, emitOTPVerified, emitRideCompleted, emitOTPFailed,
} from '../../services/socket';
import { C, GRAD } from '../../utils/theme';

const STEPS = ['accepted', 'arrived', 'otp_verified', 'in_progress', 'completed'];
const STEP_LABELS = {
  accepted:     { label: 'Navigate to Pickup',  icon: '🗺️',  color: C.info    },
  arrived:      { label: 'Gender Verification', icon: '🔐',  color: C.plum    },
  otp_verified: { label: 'Ride In Progress',    icon: '🚗',  color: C.success },
  in_progress:  { label: 'Complete Ride',       icon: '🏁',  color: C.rose    },
  completed:    { label: 'Ride Completed!',     icon: '✅',  color: C.success },
};

export default function DriverAcceptRideScreen({ navigation, route }) {
  const rideRequest = route?.params?.rideData || route?.params?.rideRequest || {};

  const [rideStatus,       setRideStatus]       = useState('accepted');
  const [otp,              setOtp]              = useState('');
  const [loading,          setLoading]          = useState(false);
  const [rideTime,         setRideTime]         = useState(0);
  const [rideId,           setRideId]           = useState(rideRequest?.rideId || 'demo');
  const [passengerId,      setPassengerId]       = useState(rideRequest?.passengerId || 'demo');
  const [otpFailures,      setOtpFailures]      = useState(0);
  const [showGenderCheck,  setShowGenderCheck]  = useState(false);
  const timer = useRef(null);

  useEffect(() => { acceptRideOnServer(); }, []);

  useEffect(() => {
    if (rideStatus === 'in_progress') {
      timer.current = setInterval(() => setRideTime(t => t + 1), 1000);
    }
    return () => clearInterval(timer.current);
  }, [rideStatus]);

  const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const acceptRideOnServer = async () => {
    try {
      const res = await rideAPI.accept(rideId);
      if (res.success) {
        setPassengerId(res.ride?.passenger?._id || passengerId);
        emitRideAccepted(rideId, 'driver_id', passengerId);
      }
    } catch (_) {}
  };

  const handleArrived = async () => {
    setLoading(true);
    try { await rideAPI.arrived(rideId); } catch (_) {}
    emitDriverArrived(passengerId);
    setRideStatus('arrived');
    setLoading(false);
    // ── Show same-gender verification dialog ──────────────────────────────
    setTimeout(() => setShowGenderCheck(true), 500);
  };

  const handleGenderConfirm = (confirmed) => {
    setShowGenderCheck(false);
    if (!confirmed) {
      // Passenger gender mismatch — cancel ride for safety
      Alert.alert(
        '🚫 Gender Mismatch',
        'You have confirmed the passenger does NOT appear to be female.\n\nThis ride has been cancelled for safety. This incident will be reviewed by the safety team.',
        [
          {
            text: 'Cancel Ride',
            style: 'destructive',
            onPress: async () => {
              try {
                await rideAPI.cancel(rideId, 'Gender identity mismatch — passenger did not appear to be female');
              } catch (_) {}
              Alert.alert('Ride Cancelled', 'Safety team has been notified.', [
                { text: 'OK', onPress: () => navigation.replace('DriverHome') },
              ]);
            },
          },
        ]
      );
    }
    // Confirmed female — proceed to OTP entry
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 4) {
      Alert.alert('Invalid OTP', "Please enter the 4-digit code shown on passenger's screen.");
      return;
    }
    setLoading(true);
    try {
      const res = await rideAPI.verifyOTP(rideId, otp);
      if (res.success) {
        emitOTPVerified(passengerId, rideId);
        setRideStatus('in_progress');
        setOtpFailures(0);
      } else {
        const newFailures = otpFailures + 1;
        setOtpFailures(newFailures);
        emitOTPFailed(rideId, passengerId, newFailures);

        if (res.rideCancelled) {
          Alert.alert(
            '🚨 Ride Cancelled',
            res.message,
            [{ text: 'OK', onPress: () => navigation.replace('DriverHome') }]
          );
          return;
        }

        Alert.alert('Wrong OTP', res.message || `Wrong OTP (${newFailures}/3). Ask passenger for correct code.`);
      }
    } catch (e) {
      // Demo fallback
      if (otp.length === 4) {
        emitOTPVerified(passengerId, rideId);
        setRideStatus('in_progress');
      } else {
        Alert.alert('Wrong OTP', "Please ask the passenger for their 4-digit code.");
      }
    }
    setLoading(false);
  };

  const handleComplete = async () => {
    Alert.alert('Complete Ride?', 'Confirm you have dropped off the passenger safely.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete Ride 🏁', onPress: async () => {
          setLoading(true);
          try {
            const res = await rideAPI.complete(rideId);
            const fare = res.ride?.actualFare || rideRequest?.estimatedFare || 280;
            emitRideCompleted(passengerId, rideId, fare);
          } catch (_) {
            emitRideCompleted(passengerId, rideId, rideRequest?.estimatedFare || 280);
          }
          setRideStatus('completed');
          setLoading(false);
        },
      },
    ]);
  };

  // ── Completed State ──────────────────────────────────────────────────────
  if (rideStatus === 'completed') {
    return (
      <LinearGradient colors={GRAD.success} style={styles.doneScreen}>
        <Text style={{ fontSize: 80, marginBottom: 16 }}>🌸</Text>
        <Text style={styles.doneTitle}>Ride Completed!</Text>
        <Text style={styles.doneSub}>Great job! You rode safely.</Text>
        <View style={styles.doneCard}>
          <View style={styles.doneRow}>
            <Text style={styles.doneLbl}>Duration</Text>
            <Text style={styles.doneVal}>{fmt(rideTime)}</Text>
          </View>
          <View style={styles.doneRow}>
            <Text style={styles.doneLbl}>Earned</Text>
            <Text style={[styles.doneVal, { color: '#fff', fontSize: 22, fontWeight: '800' }]}>
              Rs. {rideRequest?.estimatedFare || 280}
            </Text>
          </View>
          {rideRequest?.isPooled && (
            <View style={styles.doneRow}>
              <Text style={styles.doneLbl}>Pool Fare (per pax)</Text>
              <Text style={styles.doneVal}>Rs. {rideRequest?.farePerPassenger || 140}</Text>
            </View>
          )}
          <View style={styles.doneRow}>
            <Text style={styles.doneLbl}>Route</Text>
            <Text style={styles.doneVal} numberOfLines={1}>
              {rideRequest?.pickupAddress || 'DHA Phase 5'} → {rideRequest?.dropoffAddress || 'Gulberg III'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.replace('DriverHome')} style={styles.homeBtn}>
          <Text style={{ color: C.rose, fontWeight: '800', fontSize: 15 }}>Back to Dashboard 🏠</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const step = STEP_LABELS[rideStatus];

  return (
    <View style={styles.screen}>
      {/* ── Same-Gender Verification Modal ─────────────────────────────────── */}
      <Modal visible={showGenderCheck} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.genderModal}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔍</Text>
            <Text style={styles.genderModalTitle}>Same-Gender Verification</Text>
            <Text style={styles.genderModalDesc}>
              Before proceeding, you must confirm the passenger's identity as female.{'\n\n'}
              Mehfooz Ride is a women-only platform. Verify visually that the passenger matches their registered profile.
            </Text>
            <View style={styles.genderModalDetails}>
              <Text style={styles.genderDetailLabel}>Expected Passenger:</Text>
              <Text style={styles.genderDetailValue}>{rideRequest?.passengerName || 'Passenger'}</Text>
              <Text style={styles.genderDetailLabel}>Platform Policy:</Text>
              <Text style={styles.genderDetailValue}>Female passengers only</Text>
            </View>
            <Text style={styles.genderQuestion}>
              Does the passenger appear to be female?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.genderBtn, { backgroundColor: '#27AE60' }]}
                onPress={() => handleGenderConfirm(true)}>
                <Text style={styles.genderBtnText}>✅ Yes, Female</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, { backgroundColor: '#E74C3C' }]}
                onPress={() => handleGenderConfirm(false)}>
                <Text style={styles.genderBtnText}>❌ Mismatch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient colors={GRAD.primary} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>Active Ride</Text>
            <Text style={styles.headerTitle}>{step.icon} {step.label}</Text>
          </View>
          {rideStatus === 'in_progress' && (
            <View style={styles.timerBadge}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{fmt(rideTime)}</Text>
            </View>
          )}
        </View>
        <View style={styles.progressRow}>
          {['accepted', 'arrived', 'in_progress', 'completed'].map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
              <View style={[styles.stepDot, { backgroundColor: STEPS.indexOf(rideStatus) >= STEPS.indexOf(s) ? '#fff' : 'rgba(255,255,255,0.3)' }]} />
              {i < 3 && <View style={[styles.stepLine, { backgroundColor: STEPS.indexOf(rideStatus) > i ? '#fff' : 'rgba(255,255,255,0.25)' }]} />}
            </View>
          ))}
        </View>
        <View style={styles.progressLabels}>
          {['Accepted', 'Verified', 'In Progress', 'Done'].map(l => (
            <Text key={l} style={styles.progressLbl}>{l}</Text>
          ))}
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Map Area */}
        <View style={styles.mapArea}>
          <Text style={{ fontSize: 44 }}>🗺️</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
            {rideStatus === 'accepted' ? 'Navigate to pickup location' : 'Ride route map'}
          </Text>
          {rideStatus === 'accepted' && (
            <View style={styles.destBanner}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                📍 Pickup: {rideRequest?.pickupAddress || 'DHA Phase 5, Lahore'}
              </Text>
            </View>
          )}
        </View>

        {/* Passenger Info Card */}
        <View style={styles.paxCard}>
          <View style={styles.paxRow}>
            <View style={styles.paxAvatar}><Text style={{ fontSize: 28 }}>👩</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paxName}>{rideRequest?.passengerName || 'Zainab Qureshi'}</Text>
              <Text style={styles.paxMood}>
                {rideRequest?.moodPreference === 'quiet' ? '🤫 Quiet ride preferred' : rideRequest?.moodPreference === 'friendly' ? '😊 Friendly ride' : '💬 Talkative ride'}{}
              </Text>
              {rideRequest?.isPooled && (
                <View style={styles.poolBadge}>
                  <Text style={{ fontSize: 10, color: C.rose, fontWeight: '700' }}>👯‍♀️ POOL RIDE</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fareAmt}>Rs. {rideRequest?.estimatedFare || 280}</Text>
              {rideRequest?.isPooled && (
                <Text style={{ fontSize: 10, color: C.success, fontWeight: '600' }}>
                  Rs. {rideRequest?.farePerPassenger || 140}/pax
                </Text>
              )}
              <Text style={styles.fareDist}>{rideRequest?.distanceKm || 7.2} km</Text>
            </View>
          </View>
          <View style={styles.routeBox}>
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: C.success }]} />
              <Text style={styles.routeText} numberOfLines={1}>{rideRequest?.pickupAddress || 'DHA Phase 5, Lahore'}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: C.rose }]} />
              <Text style={styles.routeText} numberOfLines={1}>{rideRequest?.dropoffAddress || 'Gulberg III, Lahore'}</Text>
            </View>
          </View>
        </View>

        {/* Step 1: Arrived */}
        {rideStatus === 'accepted' && (
          <View style={styles.actionBox}>
            <Text style={styles.actionTitle}>📍 Drive to the pickup location</Text>
            <Text style={styles.actionDesc}>When you reach the passenger, tap the button below. You'll then verify passenger gender before entering OTP.</Text>
            <TouchableOpacity onPress={handleArrived} style={[styles.actionBtn, { backgroundColor: C.info }]} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>✓ I've Arrived at Pickup</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: OTP (after gender verified) */}
        {rideStatus === 'arrived' && (
          <View style={styles.actionBox}>
            {/* OTP failure warning */}
            {otpFailures > 0 && (
              <View style={[styles.warningBanner, { backgroundColor: otpFailures >= 2 ? '#FDEDEC' : '#FEF9E7' }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: otpFailures >= 2 ? '#C0392B' : '#F39C12' }}>
                  ⚠️ Wrong OTP: {otpFailures}/3 attempt(s)
                </Text>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {otpFailures >= 2
                    ? 'ONE more failure will cancel this ride and report to safety team'
                    : 'Please verify the code with the passenger'}
                </Text>
              </View>
            )}
            <Text style={styles.actionTitle}>🔐 Enter Passenger's OTP</Text>
            <Text style={styles.actionDesc}>Ask the passenger to show their OTP and enter the 4-digit code below.</Text>
            <View style={styles.otpRow}>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                placeholder="Enter 4-digit OTP"
                keyboardType="numeric"
                maxLength={4}
                style={styles.otpInput}
                placeholderTextColor={C.muted}
              />
              <TouchableOpacity onPress={handleVerifyOTP} style={[styles.otpBtn, { backgroundColor: C.plum }]} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Verify →</Text>}
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: 'center' }}>
              (Demo: use OTP 7842 if testing without backend)
            </Text>
          </View>
        )}

        {/* Step 3: In Progress */}
        {rideStatus === 'in_progress' && (
          <View style={styles.actionBox}>
            <View style={styles.inProgressBanner}>
              <Text style={{ fontSize: 22 }}>🚗</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.success }}>Ride Verified & In Progress</Text>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>OTP confirmed — drive safely to destination</Text>
              </View>
            </View>
            <View style={styles.liveStats}>
              {[
                { ico: '⏱️', lbl: 'Time',     val: fmt(rideTime) },
                { ico: '📍', lbl: 'Distance', val: `${rideRequest?.distanceKm || 7.2} km` },
                { ico: '💰', lbl: 'Earning',  val: `Rs.${rideRequest?.estimatedFare || 280}` },
              ].map(stat => (
                <View key={stat.lbl} style={styles.liveStat}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>{stat.ico}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{stat.val}</Text>
                  <Text style={{ fontSize: 10, color: C.muted }}>{stat.lbl}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.actionDesc}>Tap when you have safely dropped off the passenger.</Text>
            <TouchableOpacity onPress={handleComplete} style={[styles.actionBtn, { backgroundColor: C.rose }]} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>🏁 Complete Ride</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  header:           { padding: 20, paddingBottom: 16 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerSub:        { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  headerTitle:      { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  timerBadge:       { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  progressRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stepDot:          { width: 12, height: 12, borderRadius: 6 },
  stepLine:         { flex: 1, height: 2, marginHorizontal: 4 },
  progressLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  progressLbl:      { color: 'rgba(255,255,255,0.65)', fontSize: 10 },
  mapArea:          { height: 180, backgroundColor: '#FBF0F7', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  destBanner:       { position: 'absolute', bottom: 10, backgroundColor: C.info, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  paxCard:          { backgroundColor: C.white, margin: 14, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border },
  paxRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  paxAvatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center' },
  paxName:          { fontSize: 15, fontWeight: '800', color: C.text },
  paxRideType:     { fontSize: 10, color: C.info, fontWeight: 700, marginTop: 2 },
  paxMood:          { fontSize: 11, color: C.muted, marginTop: 3 },
  poolBadge:        { backgroundColor: C.rosePale, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4, alignSelf: 'flex-start' },
  fareAmt:          { fontSize: 16, fontWeight: '800', color: C.rose },
  fareDist:         { fontSize: 11, color: C.muted },
  routeBox:         { backgroundColor: C.bg, borderRadius: 12, padding: 12 },
  routeRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:              { width: 10, height: 10, borderRadius: 5 },
  routeText:        { flex: 1, fontSize: 12, color: C.text },
  routeLine:        { width: 1.5, height: 14, backgroundColor: C.border, marginLeft: 4.5, marginVertical: 3 },
  actionBox:        { backgroundColor: C.white, margin: 14, marginTop: 0, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border },
  actionTitle:      { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 8 },
  actionDesc:       { fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 18 },
  actionBtn:        { borderRadius: 16, padding: 16, alignItems: 'center' },
  actionBtnText:    { color: '#fff', fontWeight: '800', fontSize: 15 },
  warningBanner:    { borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#F39C12' },
  otpRow:           { flexDirection: 'row', gap: 10 },
  otpInput:         { flex: 1, backgroundColor: C.bg, borderRadius: 14, padding: 14, fontSize: 22, letterSpacing: 10, textAlign: 'center', fontWeight: '800', color: C.text, borderWidth: 1.5, borderColor: C.border },
  otpBtn:           { borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  inProgressBanner: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.successBg, borderRadius: 14, padding: 14, marginBottom: 16 },
  liveStats:        { flexDirection: 'row', gap: 10, marginBottom: 16 },
  liveStat:         { flex: 1, backgroundColor: C.bg, borderRadius: 14, padding: 12, alignItems: 'center' },
  // Gender verification modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  genderModal:      { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, alignItems: 'center' },
  genderModalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'center' },
  genderModalDesc:  { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  genderModalDetails: { backgroundColor: C.bg, borderRadius: 14, padding: 14, width: '100%', marginBottom: 14 },
  genderDetailLabel: { fontSize: 11, color: C.muted, fontWeight: '600', marginBottom: 2 },
  genderDetailValue: { fontSize: 13, color: C.text, fontWeight: '700', marginBottom: 8 },
  genderQuestion:   { fontSize: 14, fontWeight: '700', color: C.text, textAlign: 'center' },
  genderBtn:        { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  genderBtnText:    { color: '#fff', fontWeight: '800', fontSize: 13 },
  // Done screen
  doneScreen:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneTitle:        { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  doneSub:          { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginBottom: 28 },
  doneCard:         { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: 20, width: '100%', marginBottom: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  doneRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  doneLbl:          { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  doneVal:          { color: '#fff', fontSize: 13, fontWeight: '700' },
  homeBtn:          { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 32, paddingVertical: 16 },
});
