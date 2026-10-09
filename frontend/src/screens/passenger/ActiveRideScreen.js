// frontend/src/screens/passenger/ActiveRideScreen.js
// FIXED: OTP modal now ONLY shows the code — no manual entry box (passenger shows, driver enters)
// Full active ride: real GPS, live fare, route deviation, SOS, fake call, guardian notifications

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Modal, ScrollView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';
import { rideAPI } from '../../services/api';
import {
  emitSOS, onDriverLocation, onRouteDeviation, onRideStarted, onRideFinished,
  onGuardianNotified, onOTPWarning, onFakeRideAlert, offEvent,
} from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

const BASE_FARE    = 80;
const RATE_PER_KM  = 25;
const RATE_PER_MIN = 5;

export default function ActiveRideScreen({ navigation, route }) {
  const { ride, driver } = route?.params || { ride: DEMO_RIDE, driver: DEMO_DRIVER };

  const [rideTime,          setRideTime]          = useState(0);
  // ── FIXED: otpVerified starts false; becomes true when driver enters OTP ──
  // The passenger ONLY shows the OTP. The driver enters it on their screen.
  // We listen for the socket event 'ride:otp-verified' to unlock the ride.
  const [otpVerified,       setOtpVerified]        = useState(false);
  const [showOtpModal,      setShowOtpModal]       = useState(true);
  const [driverLoc,         setDriverLoc]          = useState(null);
  const [myLocation,        setMyLocation]         = useState(null);
  const [liveFare,          setLiveFare]           = useState(ride?.estimatedFare || 280);
  const [distanceTravelled, setDistanceTravelled]  = useState(0);
  const [showSafeDropMenu,  setShowSafeDropMenu]   = useState(false);
  const [guardianBanner,    setGuardianBanner]     = useState(null);
  const [deviationAlert,    setDeviationAlert]     = useState(false);
  const [poolFarePerPax,    setPoolFarePerPax]     = useState(ride?.farePerPassenger || 0);

  const { user } = useAuth();
  const mapRef    = useRef(null);
  const prevLoc   = useRef(null);
  const startTime = useRef(null);
  const rideTimeRef = useRef(0); // latest values for socket callbacks registered once
  rideTimeRef.current = rideTime;
  const myLocationRef = useRef(null);
  myLocationRef.current = myLocation;

  // ── Passenger GPS tracking ────────────────────────────────────────────────
  useEffect(() => {
    const watchId = Geolocation.watchPosition(
      pos => {
        const newLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setMyLocation(newLoc);
        if (prevLoc.current && otpVerified) {
          const d = haversine(prevLoc.current, newLoc);
          setDistanceTravelled(prev => {
            const total   = prev + d;
            const elapsed = startTime.current ? Math.round((Date.now() - startTime.current) / 60000) : 0;
            const fare    = BASE_FARE + total * RATE_PER_KM + elapsed * RATE_PER_MIN;
            const final   = Math.round(Math.max(fare, 50));
            setLiveFare(ride?.isPooled ? Math.ceil(final / 2) : final);
            setPoolFarePerPax(ride?.isPooled ? Math.ceil(final / 2) : 0);
            return total;
          });
        }
        prevLoc.current = newLoc;
      },
      // On GPS error keep the last real fix — never substitute a made-up location
      () => {},
      { enableHighAccuracy: true, distanceFilter: 10 }
    );
    return () => Geolocation.clearWatch(watchId);
  }, [otpVerified]);

  // ── Sync with server on open — the ride may have started while we were on another screen
  useEffect(() => {
    if (!ride?._id) return;
    rideAPI.getById(ride._id).then(res => {
      const status = res.ride?.status;
      if (status === 'in_progress' && !startTime.current) {
        startTime.current = res.ride.startedAt ? new Date(res.ride.startedAt).getTime() : Date.now();
        setRideTime(Math.max(0, Math.round((Date.now() - startTime.current) / 1000)));
        setOtpVerified(true);
        setShowOtpModal(false);
      } else if (status === 'completed') {
        navigation.replace('RideComplete', { ride: res.ride, driver, rideTime: (res.ride.durationMinutes || 0) * 60 });
      } else if (status === 'cancelled') {
        Alert.alert('Ride Cancelled', res.ride.cancelReason || 'This ride was cancelled.', [
          { text: 'OK', onPress: () => navigation.replace('PassengerHome') },
        ]);
      }
    }).catch(() => {});
  }, []);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    onDriverLocation(data => {
      if (data?.coordinates)
        setDriverLoc({ latitude: data.coordinates[1], longitude: data.coordinates[0] });
    });

    onRouteDeviation(data => {
      setDeviationAlert(true);
      Alert.alert(
        '⚠️ Route Deviation Detected',
        `${data.message}\n\nYour guardian contacts have been automatically notified.`,
        [
          { text: 'Dismiss', onPress: () => setDeviationAlert(false) },
          { text: '🆘 SOS', style: 'destructive', onPress: handleSOS },
        ]
      );
    });

    onGuardianNotified(data => {
      setGuardianBanner(data.message);
      setTimeout(() => setGuardianBanner(null), 5000);
    });

    onOTPWarning(data => {
      Alert.alert('⚠️ Safety Alert', data.message, [
        { text: 'OK' },
        { text: '🆘 SOS', style: 'destructive', onPress: handleSOS },
      ]);
    });

    // When the driver enters the correct OTP the server emits 'ride:started'
    // Ride is now officially started — hide OTP modal, start timer
    onRideStarted(() => {
      setOtpVerified(true);
      setShowOtpModal(false);
      startTime.current = Date.now();
    });

    // Driver completed the ride — the server sends the final fare
    onRideFinished(data => {
      navigation.replace('RideComplete', {
        ride: { ...ride, actualFare: data.fare, farePerPassenger: data.farePerPassenger },
        driver,
        rideTime: rideTimeRef.current,
      });
    });

    onFakeRideAlert(data => {
      Alert.alert('🚨 Ride Cancelled', data.message, [
        { text: 'OK', onPress: () => navigation.replace('PassengerHome') },
      ]);
    });

    return () => {
      offEvent('driver:location:update');
      offEvent('ride:route-deviation');
      offEvent('guardian:notified');
      offEvent('ride:otp-warning');
      offEvent('ride:started');
      offEvent('ride:finished');
      offEvent('ride:fake-ride-alert');
    };
  }, []);

  // ── Ride timer starts only after OTP verified by driver ──────────────────
  useEffect(() => {
    if (!otpVerified) return;
    if (!startTime.current) startTime.current = Date.now();
    const t = setInterval(() => setRideTime(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [otpVerified]);

  const fmt = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleSOS = () => {
    Alert.alert('🆘 SOS EMERGENCY', 'This will alert your emergency contacts and Police (15).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: '🆘 YES, SEND SOS', style: 'destructive', onPress: () => {
          // Always raise the alert, with or without a GPS fix
          const loc = myLocationRef.current;
          emitSOS(ride?._id, loc ? [loc.longitude, loc.latitude] : null);
          rideAPI.sos(ride?._id).catch(() => {}); // REST backup in case the socket is down
          navigation.navigate('SOSScreen', {
            rideId: ride?._id,
            guardianContacts: (user?.guardianContacts || []).filter(g => g.isActive),
            driverInfo: driver ? {
              name:    driver.name,
              phone:   driver.phone || '',
              plate:   driver.licensePlate || driver.driverDetails?.licensePlate || '',
              vehicle: driver.vehicle || `${driver.driverDetails?.vehicleMake || ''} ${driver.driverDetails?.vehicleModel || ''}`.trim(),
            } : null,
          });
        },
      },
    ]);
  };

  const mapRegion = myLocation
    ? { latitude: myLocation.latitude, longitude: myLocation.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 31.5204, longitude: 74.3587, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  const SAFE_LOCATIONS = [
    { name: 'CMH Lahore (Hospital)',      addr: 'Jail Road, Lahore' },
    { name: 'Model Town Police Station',  addr: 'Model Town Link Road' },
    { name: 'Packages Mall',              addr: 'Walton Road, Lahore' },
    { name: 'Jinnah Hospital',            addr: 'Jail Road, Lahore' },
  ];

  return (
    <View style={styles.screen}>
      {/* Live Map */}
      <MapView ref={mapRef} style={styles.map} region={mapRegion} showsUserLocation>
        {myLocation && <Marker coordinate={myLocation} title="You" pinColor={C.rose} />}
        {driverLoc  && (
          <Marker coordinate={driverLoc} title={driver?.name || 'Your Driver'}>
            <Text style={{ fontSize: 28 }}>🚗</Text>
          </Marker>
        )}
      </MapView>

      {/* ── FIXED OTP MODAL ─────────────────────────────────────────────────
          Passenger ONLY sees and shows this code.
          The driver enters it on THEIR screen.
          No manual entry field here — clear and simple.       ──────────── */}
      <Modal visible={showOtpModal && !otpVerified} transparent animationType="slide">
        <View style={styles.otpOverlay}>
          <View style={styles.otpCard}>
            {/* Header */}
            <View style={styles.otpHeaderBadge}>
              <Text style={styles.otpHeaderText}>🔐 SHOW THIS TO YOUR DRIVER</Text>
            </View>

            <Text style={styles.otpTitle}>Your Ride OTP</Text>
            <Text style={styles.otpDesc}>
              When your driver arrives, show them this 4-digit code.{'\n'}
              The driver will enter it on their phone to start the ride.
            </Text>

            {/* Big OTP digits */}
            <View style={styles.otpDigitsRow}>
              {(ride?.otp || '----').split('').map((d, i) => (
                <View key={i} style={styles.otpDigit}>
                  <Text style={styles.otpNum}>{d}</Text>
                </View>
              ))}
            </View>

            {/* How it works explanation */}
            <View style={styles.otpStepsBox}>
              <View style={styles.otpStep}>
                <View style={styles.otpStepNum}><Text style={styles.otpStepNumTxt}>1</Text></View>
                <Text style={styles.otpStepTxt}>Driver arrives at your location</Text>
              </View>
              <View style={styles.otpStep}>
                <View style={styles.otpStepNum}><Text style={styles.otpStepNumTxt}>2</Text></View>
                <Text style={styles.otpStepTxt}>Show your driver this OTP screen</Text>
              </View>
              <View style={styles.otpStep}>
                <View style={styles.otpStepNum}><Text style={styles.otpStepNumTxt}>3</Text></View>
                <Text style={styles.otpStepTxt}>Driver enters the code on their app → ride starts</Text>
              </View>
            </View>

            <Text style={styles.otpWarning}>⚠️ Never share this code with anyone other than your verified driver</Text>

            <TouchableOpacity onPress={() => setShowOtpModal(false)} style={styles.otpDismissBtn}>
              <Text style={styles.otpDismissTxt}>Waiting for driver to scan... (tap to minimise)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Safe Drop Modal */}
      <Modal visible={showSafeDropMenu} transparent animationType="slide">
        <View style={styles.otpOverlay}>
          <View style={[styles.otpCard, { paddingBottom: 20 }]}>
            <Text style={styles.otpTitle}>📍 Drop Me at a Safe Location</Text>
            <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 16 }}>
              Your driver will be guided to a safe nearby location
            </Text>
            {SAFE_LOCATIONS.map(loc => (
              <TouchableOpacity key={loc.name} style={styles.safeLocRow}
                onPress={() => {
                  setShowSafeDropMenu(false);
                  Alert.alert('✅ Safe Drop Requested', `Driver has been asked to drop you at:\n\n${loc.name}\n${loc.addr}`);
                }}>
                <Text style={{ fontSize: 16 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{loc.name}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>{loc.addr}</Text>
                </View>
                <Text style={{ color: C.rose, fontWeight: '700' }}>Select →</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowSafeDropMenu(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Guardian Notification Banner */}
      {guardianBanner && (
        <View style={styles.guardianBanner}>
          <Text style={styles.guardianBannerText}>🛡️ {guardianBanner}</Text>
        </View>
      )}

      {/* Route Deviation Banner */}
      {deviationAlert && (
        <View style={styles.deviationBanner}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
            ⚠️ Route deviation detected! Guardian contacts notified.
          </Text>
        </View>
      )}

      {/* Top Info Bar */}
      <LinearGradient colors={[C.plum, C.rose]} style={styles.topBar}>
        <View>
          <Text style={styles.driverName}>🚗 {driver?.name || 'Fatima Malik'}</Text>
          <Text style={styles.driverSub}>
            {driver?.driverDetails?.vehicleMake || driver?.vehicle || 'Toyota'} ·{' '}
            {driver?.driverDetails?.licensePlate || driver?.licensePlate || 'ABC-1234'}
          </Text>
        </View>
        {otpVerified
          ? <Text style={styles.timer}>{fmt(rideTime)}</Text>
          : (
            <TouchableOpacity onPress={() => setShowOtpModal(true)} style={styles.showOtpBtn}>
              <Text style={{ color: C.rose, fontWeight: '700', fontSize: 12 }}>Show OTP 🔐</Text>
            </TouchableOpacity>
          )
        }
      </LinearGradient>

      {/* Live Fare Bar — only visible after OTP verified */}
      {otpVerified && (
        <View style={styles.fareBar}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.fareText}>💰 Rs. {liveFare}</Text>
            {ride?.isPooled && <Text style={{ fontSize: 9, color: C.rose }}>Rs.{poolFarePerPax}/pax</Text>}
          </View>
          <Text style={styles.fareText}>📍 {distanceTravelled.toFixed(1)} km</Text>
          <Text style={styles.fareText}>⏱️ {fmt(rideTime)}</Text>
          <Text style={styles.fareText}>🧮 Live Fare</Text>
        </View>
      )}

      {/* Route Bar */}
      <View style={styles.routeBar}>
        <Text style={styles.routeText} numberOfLines={1}>
          📍 {ride?.pickupLocation?.address || 'Pickup'} → 🏁 {ride?.dropoffLocation?.address || 'Dropoff'}
          {ride?.isPooled ? ' · 👯‍♀️ POOL' : ''}
        </Text>
      </View>

      {/* Safety Action Buttons */}
      <View style={styles.actions}>
        {[
          { ico: '🆘',  lbl: 'SOS',       color: C.danger,  bg: C.dangerBg,  fn: handleSOS },
          { ico: '🤙',  lbl: 'Fake Call', color: '#D4376A', bg: '#FFE4EF',   fn: () => navigation.navigate('FakeCall') },
          { ico: '📍',  lbl: 'Safe Drop', color: C.info,    bg: C.infoBg,    fn: () => setShowSafeDropMenu(true) },
          { ico: '👁️', lbl: 'Guardian',  color: C.plum,    bg: C.plumLight, fn: () => navigation.navigate('GuardianSetup') },
        ].map(b => (
          <TouchableOpacity key={b.lbl} onPress={b.fn}
            style={[styles.actionBtn, { backgroundColor: b.bg }]}>
            <Text style={{ fontSize: 22 }}>{b.ico}</Text>
            <Text style={[styles.actionLbl, { color: b.color }]}>{b.lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cancel before pickup — once started, the driver completes the ride */}
      {otpVerified ? (
        <View style={styles.endBtn}>
          <Text style={styles.endBtnText}>🏁 Your driver will end the ride at your destination</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={() =>
          Alert.alert('Cancel Ride', 'Are you sure you want to cancel this ride?', [
            { text: 'Keep Ride', style: 'cancel' },
            { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
              try {
                await rideAPI.cancel(ride?._id, 'Cancelled by passenger before pickup');
                navigation.replace('PassengerHome');
              } catch (err) {
                Alert.alert('Could Not Cancel', err.response?.data?.message || 'Server error. Please try again.');
              }
            }},
          ])} style={styles.endBtn}>
          <Text style={styles.endBtnText}>✕ Cancel Ride</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function haversine(a, b) {
  const R    = 6371;
  const dLat = (b.latitude  - a.latitude)  * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const s    = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const DEMO_RIDE   = { otp: '7842', estimatedFare: 280, isPooled: false, pickupLocation: { address: 'DHA Phase 5' }, dropoffLocation: { address: 'Gulberg III' } };
const DEMO_DRIVER = { name: 'Fatima Malik', driverDetails: { vehicleMake: 'Toyota', licensePlate: 'LHR-1234' } };

const styles = StyleSheet.create({
  screen:              { flex: 1, backgroundColor: C.bg },
  map:                 { flex: 1 },
  topBar:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingTop: 50 },
  driverName:          { color: '#fff', fontSize: 15, fontWeight: '800' },
  driverSub:           { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  timer:               { color: '#fff', fontSize: 20, fontWeight: '900' },
  showOtpBtn:          { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  fareBar:             { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: C.rosePale, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  fareText:            { fontSize: 11, fontWeight: '700', color: C.rose },
  routeBar:            { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  routeText:           { fontSize: 12, color: C.muted },
  actions:             { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff' },
  actionBtn:           { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center' },
  actionLbl:           { fontSize: 10, fontWeight: '700', marginTop: 4 },
  endBtn:              { backgroundColor: C.rose, margin: 12, borderRadius: 16, padding: 16, alignItems: 'center' },
  endBtnText:          { color: '#fff', fontWeight: '800', fontSize: 15 },
  guardianBanner:      { position: 'absolute', top: 110, left: 14, right: 14, backgroundColor: '#27AE60', borderRadius: 14, padding: 12, zIndex: 10 },
  guardianBannerText:  { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  deviationBanner:     { position: 'absolute', top: 110, left: 14, right: 14, backgroundColor: '#E74C3C', borderRadius: 14, padding: 12, zIndex: 10 },
  // ── OTP Modal (show-only — no entry field) ────────────────────────────────
  otpOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  otpCard:             { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, alignItems: 'center' },
  otpHeaderBadge:      { backgroundColor: C.rose, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 14 },
  otpHeaderText:       { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  otpTitle:            { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6, textAlign: 'center' },
  otpDesc:             { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  otpDigitsRow:        { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 24 },
  otpDigit:            { width: 60, height: 70, borderRadius: 16, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center', shadowColor: C.rose, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, elevation: 8 },
  otpNum:              { color: '#fff', fontSize: 32, fontWeight: '900' },
  otpStepsBox:         { backgroundColor: C.rosePale, borderRadius: 16, padding: 14, width: '100%', marginBottom: 14, gap: 10 },
  otpStep:             { flexDirection: 'row', alignItems: 'center', gap: 10 },
  otpStepNum:          { width: 24, height: 24, borderRadius: 12, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  otpStepNumTxt:       { color: '#fff', fontWeight: '800', fontSize: 12 },
  otpStepTxt:          { flex: 1, fontSize: 12, color: C.text, lineHeight: 17 },
  otpWarning:          { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 14 },
  otpDismissBtn:       { padding: 10 },
  otpDismissTxt:       { fontSize: 12, color: C.rose, fontWeight: '600', textAlign: 'center' },
  safeLocRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.bg, marginBottom: 8, width: '100%' },
});
