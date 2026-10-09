// src/screens/passenger/DriverFoundScreen.js
// Passenger verifies driver identity + vehicle before entering car
// REQ 6: "Passenger must also verify driver identity and vehicle details"

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Badge, PrimaryBtn, GhostBtn, Card } from '../../components/UI';
import { rideAPI } from '../../services/api';
import { C, GRAD } from '../../utils/theme';

const dial = (number) => {
  Linking.openURL(`tel:${number}`).catch(() => Alert.alert('Call Failed', `Please dial ${number} manually.`));
};

export default function DriverFoundScreen({ navigation, route }) {
  const { ride, driver } = route.params || { ride: DEMO_RIDE, driver: DEMO_DRIVER };

  const cancelForSafety = async () => {
    try {
      await rideAPI.cancel(ride?._id, 'Driver identity or vehicle did not match');
      Alert.alert('Ride Cancelled', 'Ride cancelled for safety. You will not be charged.', [
        { text: 'OK', onPress: () => navigation.replace('PassengerHome') },
      ]);
    } catch (err) {
      Alert.alert('Could Not Cancel', `${err.response?.data?.message || 'Server error.'}\n\nDo NOT enter the vehicle. Use SOS if you feel unsafe.`);
    }
  };

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [plateConfirmed,  setPlateConfirmed]  = useState(false);
  const [faceConfirmed,   setFaceConfirmed]   = useState(false);
  const [verified,        setVerified]         = useState(false);

  const driverName    = driver?.name          || 'Fatima Malik';
  const driverRating  = driver?.rating        || driver?.averageRating || '4.9';
  const driverVehicle = driver?.vehicle       || `${driver?.driverDetails?.vehicleMake || 'Toyota'} ${driver?.driverDetails?.vehicleModel || 'Corolla'}`;
  const driverPlate   = driver?.licensePlate  || driver?.driverDetails?.licensePlate || 'LHR-1234';
  const driverColor   = driver?.vehicleColor  || driver?.driverDetails?.vehicleColor || 'White';

  // ── Passenger confirms driver identity before entering car ────────────────
  const handleConfirmDriver = () => {
    if (!plateConfirmed) {
      Alert.alert('Confirm Vehicle', 'Please confirm the vehicle license plate matches before proceeding.'); return;
    }
    if (!faceConfirmed) {
      Alert.alert('Confirm Driver', 'Please confirm the driver matches the photo shown.'); return;
    }
    setVerified(true);
    setShowVerifyModal(false);
    Alert.alert(
      '✅ Driver Verified!',
      `You have confirmed:\n✓ Driver: ${driverName}\n✓ Vehicle plate: ${driverPlate}\n\nYou can now safely enter the vehicle.`,
      [{ text: 'Enter Vehicle →' }]
    );
  };

  const handleIdentityMismatch = () => {
    setShowVerifyModal(false);
    Alert.alert(
      '🚨 Identity Mismatch',
      'Do NOT enter the vehicle.\n\nOptions:',
      [
        {
          text: '🆘 Call Police (15)',
          style: 'destructive',
          onPress: () => dial('15'),
        },
        {
          text: '❌ Cancel Ride',
          onPress: cancelForSafety,
        },
      ]
    );
  };

  const proceedToRide = () => {
    if (!verified) {
      Alert.alert(
        '⚠️ Verify Driver First',
        'For your safety, please verify the driver identity and vehicle plate before entering the car.',
        [
          { text: 'Verify Now', onPress: () => setShowVerifyModal(true) },
          { text: 'Skip (Not Recommended)', style: 'destructive', onPress: () => navigation.replace('ActiveRide', { ride, driver }) },
        ]
      );
      return;
    }
    navigation.replace('ActiveRide', { ride, driver });
  };

  return (
    <View style={styles.screen}>

      {/* ── Driver Identity Verification Modal ──────────────────────────────── */}
      <Modal visible={showVerifyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.verifyModal}>
            <Text style={styles.verifyTitle}>🔍 Verify Driver Identity</Text>
            <Text style={styles.verifyDesc}>
              Before entering the vehicle, confirm the driver and car match what's shown in the app. This is your safety checkpoint.
            </Text>

            {/* Driver photo placeholder */}
            <View style={styles.driverPhotoBox}>
              <View style={styles.driverPhotoAvatar}><Text style={{ fontSize: 48 }}>👩</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.verifyDriverName}>{driverName}</Text>
                <Text style={styles.verifyDriverSub}>⭐ {driverRating} · Verified Female Driver</Text>
                <Text style={styles.verifyDriverSub}>🛡️ Background checked</Text>
              </View>
            </View>

            {/* Vehicle info to match */}
            <View style={styles.vehicleBox}>
              <Text style={styles.vehicleBoxTitle}>🚗 Vehicle to Look For</Text>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleLbl}>Car</Text>
                <Text style={styles.vehicleVal}>{driverVehicle}</Text>
              </View>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleLbl}>Color</Text>
                <Text style={styles.vehicleVal}>{driverColor}</Text>
              </View>
              <View style={[styles.vehicleRow, { backgroundColor: C.rose + '15', borderRadius: 10, padding: 8 }]}>
                <Text style={[styles.vehicleLbl, { fontWeight: '800' }]}>License Plate</Text>
                <Text style={[styles.vehicleVal, { color: C.rose, fontSize: 20, fontWeight: '900', letterSpacing: 2 }]}>{driverPlate}</Text>
              </View>
            </View>

            {/* Checkboxes */}
            <Text style={styles.checkTitle}>✅ Confirm Before Entering</Text>

            <TouchableOpacity onPress={() => setPlateConfirmed(!plateConfirmed)} style={styles.checkRow}>
              <View style={[styles.checkbox, plateConfirmed && styles.checkboxChecked]}>
                {plateConfirmed && <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>✓</Text>}
              </View>
              <Text style={styles.checkText}>
                The vehicle plate <Text style={{ fontWeight: '800', color: C.rose }}>{driverPlate}</Text> matches what I see
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFaceConfirmed(!faceConfirmed)} style={styles.checkRow}>
              <View style={[styles.checkbox, faceConfirmed && styles.checkboxChecked]}>
                {faceConfirmed && <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>✓</Text>}
              </View>
              <Text style={styles.checkText}>
                The driver matches the photo — <Text style={{ fontWeight: '800', color: C.rose }}>{driverName}</Text>
              </Text>
            </TouchableOpacity>

            {/* Action buttons */}
            <View style={{ gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={handleConfirmDriver}
                style={[styles.confirmBtn, (!plateConfirmed || !faceConfirmed) && { opacity: 0.5 }]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>✅ Everything Matches — Enter Car</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleIdentityMismatch} style={styles.mismatchBtn}>
                <Text style={{ color: '#E74C3C', fontWeight: '700', fontSize: 14 }}>🚨 Something Doesn't Match — Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Map */}
      <View style={styles.mapArea}>
        <Text style={{ fontSize: 40 }}>🗺️</Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Driver navigating to you</Text>
        <View style={styles.etaBanner}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>🚗 Driver Found! ETA 4 min</Text>
        </View>
      </View>

      <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>

        {/* Driver Info */}
        <View style={styles.driverRow}>
          <View style={styles.driverAvatar}><Text style={{ fontSize: 32 }}>👩</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{driverName}</Text>
            <Text style={styles.driverRating}>⭐ {driverRating} · Verified Driver</Text>
            <Text style={styles.driverCar}>{driverVehicle} · <Text style={{ fontWeight: '800', color: C.rose }}>{driverPlate}</Text> · {driverColor}</Text>
          </View>
          {!!driver?.phone && (
            <TouchableOpacity onPress={() => dial(driver.phone)} style={styles.callBtn}><Text style={{ fontSize: 20 }}>📞</Text></TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge text="✅ ID Verified"         color={C.success} bg={C.successBg} />
          <Badge text="🛡️ Background Checked"  color={C.rose}    bg={C.rosePale}  />
          <Badge text="⭐ Top Rated"            color="#B07030"   bg={C.goldLight} />
          <Badge text="♀ Female Driver"        color={C.plum}    bg="#F5E4F5"     />
        </View>

        {/* ── PASSENGER VERIFY DRIVER CARD ─────────────────────────────────── */}
        <View style={[styles.verifyCard, verified && styles.verifyCardDone]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 24 }}>{verified ? '✅' : '🔍'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyCardTitle}>
                {verified ? 'Driver Verified ✓' : 'Verify Driver Before Entering'}
              </Text>
              <Text style={styles.verifyCardSub}>
                {verified
                  ? 'You confirmed the driver and vehicle match'
                  : 'Confirm the driver photo and vehicle plate match before you enter the car'}
              </Text>
            </View>
          </View>

          {/* Quick plate reminder */}
          <View style={styles.plateBanner}>
            <Text style={{ fontSize: 11, color: C.muted }}>Look for plate number:</Text>
            <Text style={styles.plateNumber}>{driverPlate}</Text>
            <Text style={{ fontSize: 11, color: C.muted }}>on a {driverColor} {driverVehicle}</Text>
          </View>

          {!verified && (
            <TouchableOpacity onPress={() => setShowVerifyModal(true)} style={styles.verifyBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>🔍 Verify Driver Identity</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* OTP */}
        <Card style={{ marginBottom: 16, backgroundColor: `${C.plum}15` }}>
          <Text style={styles.otpTitle}>🔐 YOUR OTP — SHOW TO DRIVER</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 10 }}>
            {(ride?.otp || '----').split('').map((d, i) => (
              <View key={i} style={styles.otpDigit}><Text style={styles.otpNum}>{d}</Text></View>
            ))}
          </View>
          <Text style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>⚠️ Only share with YOUR verified driver</Text>
        </Card>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[
            { ico: '⏱️', lbl: 'ETA',      v: '4 min'  },
            { ico: '📍', lbl: 'Distance', v: `${ride?.distanceKm || 7.2} km` },
            { ico: '💰', lbl: 'Fare',     v: `Rs.${ride?.estimatedFare || 280}` },
          ].map(s => (
            <View key={s.lbl} style={styles.stat}>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>{s.ico}</Text>
              <Text style={styles.statVal}>{s.v}</Text>
              <Text style={styles.statLbl}>{s.lbl}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 30 }}>
          <GhostBtn title="📤 Share Ride" onPress={() => navigation.navigate('GuardianSetup')} style={{ flex: 1 }} />
          <TouchableOpacity onPress={proceedToRide} style={[styles.trackBtn, verified && { backgroundColor: C.success }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
              {verified ? '✅ Enter Car →' : '📍 Track Live →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const DEMO_RIDE   = { otp: '7842', estimatedFare: 280, distanceKm: 7.2 };
const DEMO_DRIVER = { name: 'Fatima Malik', rating: '4.9', vehicle: 'Toyota Corolla', licensePlate: 'LHR-1234', vehicleColor: 'White' };

const styles = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: C.bg },
  mapArea:         { height: 200, backgroundColor: '#FBF0F7', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  etaBanner:       { position: 'absolute', top: 12, backgroundColor: C.success, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 22 },
  sheet:           { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, padding: 20 },
  driverRow:       { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  driverAvatar:    { width: 70, height: 70, borderRadius: 35, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.rosePale },
  driverName:      { fontSize: 17, fontWeight: '800', color: C.text },
  driverRating:    { fontSize: 13, color: C.text, marginTop: 3 },
  driverCar:       { fontSize: 11, color: C.muted, marginTop: 2 },
  callBtn:         { backgroundColor: C.rosePale, borderRadius: 21, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  // Verify Card
  verifyCard:      { backgroundColor: '#FEF9E7', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: '#F39C12' },
  verifyCardDone:  { backgroundColor: '#D5F5E3', borderColor: '#27AE60' },
  verifyCardTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  verifyCardSub:   { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 16 },
  plateBanner:     { backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  plateNumber:     { fontSize: 26, fontWeight: '900', color: C.rose, letterSpacing: 3, marginVertical: 4 },
  verifyBtn:       { backgroundColor: C.rose, borderRadius: 14, padding: 14, alignItems: 'center' },
  // OTP
  otpTitle:        { fontSize: 12, color: C.muted, textAlign: 'center', fontWeight: '700', marginBottom: 4 },
  otpDigit:        { width: 52, height: 60, borderRadius: 14, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center', shadowColor: C.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, elevation: 6 },
  otpNum:          { color: '#fff', fontSize: 28, fontWeight: '800' },
  stat:            { flex: 1, backgroundColor: C.bg, borderRadius: 14, padding: 12, alignItems: 'center' },
  statVal:         { fontSize: 15, fontWeight: '800', color: C.text },
  statLbl:         { fontSize: 10, color: C.muted, marginTop: 2 },
  trackBtn:        { flex: 2, backgroundColor: C.rose, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 13 },
  // Verify Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  verifyModal:     { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  verifyTitle:     { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  verifyDesc:      { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  driverPhotoBox:  { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: C.rosePale, borderRadius: 16, padding: 14, marginBottom: 14 },
  driverPhotoAvatar:{ width: 70, height: 70, borderRadius: 35, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  verifyDriverName:{ fontSize: 16, fontWeight: '800', color: C.text },
  verifyDriverSub: { fontSize: 11, color: C.muted, marginTop: 3 },
  vehicleBox:      { backgroundColor: C.bg, borderRadius: 16, padding: 14, marginBottom: 14, gap: 8 },
  vehicleBoxTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  vehicleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleLbl:      { fontSize: 12, color: C.muted },
  vehicleVal:      { fontSize: 13, fontWeight: '700', color: C.text },
  checkTitle:      { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  checkRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  checkbox:        { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.rose, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: C.rose, borderColor: C.rose },
  checkText:       { flex: 1, fontSize: 13, color: C.text, lineHeight: 20 },
  confirmBtn:      { backgroundColor: '#27AE60', borderRadius: 16, padding: 16, alignItems: 'center' },
  mismatchBtn:     { borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E74C3C', backgroundColor: '#FFF5F5' },
});
