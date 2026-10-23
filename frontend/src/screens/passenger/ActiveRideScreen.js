// frontend/src/screens/passenger/ActiveRideScreen.js
// FIXED: OTP modal now ONLY shows the code — no manual entry box (passenger shows, driver enters)
// Full active ride: real GPS, live fare, route deviation, SOS, fake call, guardian notifications

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Modal, ScrollView,
} from 'react-native';
import OSMMap from '../../components/OSMMap';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';
import { rideAPI } from '../../services/api';
import {
  onEvent, onDriverLocation, onRouteDeviation, onRideStarted, onRideFinished, onRideCancelled,
  onGuardianNotified, onOTPWarning, onFakeRideAlert, offEvent,
} from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

const LIVE_FARE_REFRESH_MS = 20000;

export default function ActiveRideScreen({ navigation, route }) {
  const { ride, driver } = route?.params || {};

  const [rideTime,          setRideTime]          = useState(0);
  // ── FIXED: otpVerified starts false; becomes true when driver enters OTP ──
  // The passenger ONLY shows the OTP. The driver enters it on their screen.
  // We listen for the socket event 'ride:otp-verified' to unlock the ride.
  const [otpVerified,       setOtpVerified]        = useState(false);
  const [showOtpModal,      setShowOtpModal]       = useState(true);
  const [driverLoc,         setDriverLoc]          = useState(null);
  const [myLocation,        setMyLocation]         = useState(null);
  // Live fare comes from the server (same rules as the final fare): driver's GPS track + elapsed time
  const [liveFare,          setLiveFare]           = useState(ride?.farePerPassenger || ride?.estimatedFare || null);
  const [distanceTravelled, setDistanceTravelled]  = useState(0);
  const [safePoints,        setSafePoints]         = useState([]);   // marked on this ride
  const [guardianBanner,    setGuardianBanner]     = useState(null);
  // Route monitoring — the server compares the driver's GPS with the route chosen at booking
  const [offRoute,          setOffRoute]           = useState(null);   // { offRouteM } while off-route
  const [progress,          setProgress]           = useState(null);   // { remainingKm, etaMin, progressPct }
  const [toPickup,          setToPickup]           = useState(null);   // { distanceKm, etaMin } before pickup
  const [track,             setTrack]              = useState([]);     // driven path [[lat, lng], ...]
  const [plannedLine,       setPlannedLine]        = useState(
    (ride?.preferredRoute?.coordinates || []).map(([lng, lat]) => [lat, lng]));

  const { user } = useAuth();
  const startTime = useRef(null);
  const rideTimeRef = useRef(0); // latest values for socket callbacks registered once
  rideTimeRef.current = rideTime;
  const myLocationRef = useRef(null);
  myLocationRef.current = myLocation;

  // ── Passenger GPS (for the map and SOS) ──────────────────────────────────
  useEffect(() => {
    const watchId = Geolocation.watchPosition(
      pos => setMyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      // On GPS error keep the last real fix — never substitute a made-up location
      () => {},
      { enableHighAccuracy: true, distanceFilter: 10 }
    );
    return () => Geolocation.clearWatch(watchId);
  }, []);

  // ── Live fare from the server while the ride is in progress ──────────────
  useEffect(() => {
    if (!otpVerified || !ride?._id) return;
    const load = () => rideAPI.getLiveFare(ride._id)
      .then(res => { setLiveFare(res.liveFare); setDistanceTravelled(res.travelledKm || 0); })
      .catch(() => {});        // keep the last known value
    load();
    const t = setInterval(load, LIVE_FARE_REFRESH_MS);
    return () => clearInterval(t);
  }, [otpVerified]);

  // ── Sync with server on open — the ride may have started while we were on another screen
  useEffect(() => {
    if (!ride?._id) return;
    rideAPI.getById(ride._id).then(res => {
      const status = res.ride?.status;
      const r = res.ride || {};
      if (r.plannedRoute?.length > 1) setPlannedLine(r.plannedRoute.map(([lng, lat]) => [lat, lng]));
      if (r.routeCoordinates?.length) setTrack(r.routeCoordinates.map(p => [p.coordinates[1], p.coordinates[0]]));
      if (r.routeDeviationActive) setOffRoute({ offRouteM: r.lastProgress?.offRouteM });
      if (r.lastProgress?.remainingKm != null) setProgress(r.lastProgress);
      setSafePoints(r.safePoints || []);
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
      if (data?.rideId && String(data.rideId) !== String(ride?._id)) return;   // pooled: other passengers' updates
      if (!data?.coordinates) return;
      const [lng, lat] = data.coordinates;
      setDriverLoc({ latitude: lat, longitude: lng });
      if (data.toPickup) setToPickup(data.toPickup);
      if (data.progress) {
        setProgress(data.progress);
        setTrack(t => [...t.slice(-500), [lat, lng]]);
        setOffRoute(data.routeDeviationActive ? { offRouteM: data.progress.offRouteM } : null);
      }
    });

    onRouteDeviation(data => {
      if (data?.rideId && String(data.rideId) !== String(ride?._id)) return;
      if (data.status === 'back_on_route') {
        setOffRoute(null);
        setGuardianBanner(data.message);
        setTimeout(() => setGuardianBanner(null), 5000);
        return;
      }
      setOffRoute({ offRouteM: data.offRouteM });
      Alert.alert('⚠️ Unusual Route Detected', data.message, [
        { text: 'OK' },
        { text: '🆘 SOS', style: 'destructive', onPress: handleSOS },
      ]);
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

    // Safe points may have changed on the Safe Points screen
    const offFocus = navigation.addListener('focus', () => {
      if (ride?._id) rideAPI.getById(ride._id).then(r => setSafePoints(r.ride?.safePoints || [])).catch(() => {});
    });
    const offAck = onEvent('ride:safe-point-acknowledged', d => {
      if (String(d?.rideId) === String(ride?._id)) Alert.alert('✅ Driver acknowledged', `Your driver is taking you to ${d.point?.name || 'your safe point'}.`);
    });
    // The driver raised SOS on this ride
    const offSos = onEvent('sos:raised', d => {
      if (String(d?.rideId) === String(ride?._id) && d.byRole === 'driver') Alert.alert('🆘 Driver raised SOS', 'Your driver pressed SOS. The safety team has been alerted. Use SOS too if you need help.');
    });

    // The driver cancelled (e.g. could not reach the pickup)
    const offCancelled = onRideCancelled(data => {
      if (String(data?.rideId) !== String(ride?._id)) return;
      Alert.alert('Ride Cancelled', data.message || 'This ride was cancelled.', [
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
      offCancelled && offCancelled();
      offFocus && offFocus(); offAck && offAck(); offSos && offSos();
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

  // SOS screen starts the emergency session on the server (location, ride,
  // driver, vehicle, route and contacts are captured there) and keeps GPS live
  const handleSOS = () => {
    Alert.alert('🆘 SOS EMERGENCY', 'Start an emergency session? Your contacts get your live location and the dialer opens for Police 15.', [
      { text: 'Cancel', style: 'cancel' },
      { text: '🆘 YES, SOS', style: 'destructive', onPress: () => navigation.navigate('SOSScreen', { rideId: ride?._id }) },
    ]);
  };

  // Map shows you and the driver; zooms to fit both once the driver's location arrives
  const mapCenter  = myLocation || { latitude: 31.5204, longitude: 74.3587 };
  const [dropLng, dropLat] = ride?.dropoffLocation?.coordinates || [];
  // Route the passenger chose when booking ([lng, lat] on the server → [lat, lng] for the map)
  // Chosen route (pink) under the path actually driven (blue, red while off-route)
  const mapRoutes = [
    ...(plannedLine.length > 1 ? [{ id: 'planned', coordinates: plannedLine, color: C.rose, weight: 6, opacity: 0.55, dashed: ride?.preferredRoute?.source === 'straight_line' }] : []),
    ...(track.length > 1 ? [{ id: 'actual', coordinates: track, color: offRoute ? '#E74C3C' : '#2D7FF9', weight: 4, opacity: 0.9 }] : []),
  ];
  const mapMarkers = [
    ...(myLocation ? [{ id: 'me', ...myLocation, label: 'You', color: '#2D7FF9' }] : []),
    ...(dropLat != null ? [{ id: 'dropoff', latitude: dropLat, longitude: dropLng, label: 'Destination', emoji: '🏁' }] : []),
    ...(driverLoc  ? [{ id: 'driver', ...driverLoc, label: driver?.name || 'Your Driver', emoji: '🚗' }] : []),
    ...safePoints.map(s => ({ id: `safe-${s._id}`, latitude: s.coordinates[1], longitude: s.coordinates[0], label: `⭐ ${s.name}`, emoji: '⭐' })),
  ];

  return (
    <View style={styles.screen}>
      {/* Live Map */}
      <OSMMap
        style={styles.map}
        center={mapCenter}
        zoom={15}
        markers={mapMarkers}
        routes={mapRoutes}
        fitToContent={mapMarkers.length > 1 || mapRoutes.length > 0}
        fitKey={`${plannedLine.length}|${!!driverLoc}`}
      />

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

      {/* Guardian Notification Banner */}
      {guardianBanner && (
        <View style={styles.guardianBanner}>
          <Text style={styles.guardianBannerText}>🛡️ {guardianBanner}</Text>
        </View>
      )}

      {/* Route monitoring status */}
      {offRoute && (
        <TouchableOpacity style={styles.deviationBanner} onPress={handleSOS}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
            ⚠️ Unusual route — driver is {offRoute.offRouteM != null ? `about ${offRoute.offRouteM} m ` : ''}off your chosen route · tap for SOS
          </Text>
        </TouchableOpacity>
      )}

      {/* Top Info Bar */}
      <LinearGradient colors={[C.plum, C.rose]} style={styles.topBar}>
        <View>
          <Text style={styles.driverName}>🚗 {driver?.name || 'Your driver'}</Text>
          <Text style={styles.driverSub}>
            {driver?.driverDetails?.vehicleMake || driver?.vehicle || ''} ·{' '}
            {driver?.driverDetails?.licensePlate || driver?.licensePlate || ''}
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
            <Text style={styles.fareText}>💰 {liveFare != null ? `Rs. ${liveFare}` : '—'}</Text>
            {!!ride?.pool && <Text style={{ fontSize: 9, color: C.rose }}>pooled share</Text>}
          </View>
          <Text style={styles.fareText}>📍 {distanceTravelled.toFixed(1)} km</Text>
          <Text style={styles.fareText}>⏱️ {fmt(rideTime)}</Text>
          <Text style={styles.fareText}>🧮 Live Fare</Text>
        </View>
      )}

      {/* Trip progress (from the server, measured along your chosen route) */}
      <View style={styles.progressBar}>
        {otpVerified ? (
          progress ? (
            <>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, progress.progressPct || 0)}%` }]} /></View>
              <Text style={styles.progressText}>
                {progress.remainingKm} km to go · arriving in ~{progress.etaMin} min · {offRoute ? '⚠️ off route' : '✅ on your route'}
              </Text>
            </>
          ) : <Text style={styles.progressText}>Waiting for the driver's GPS…</Text>
        ) : (
          <Text style={styles.progressText}>
            {toPickup ? `🚗 Driver is ~${toPickup.distanceKm} km away · ~${toPickup.etaMin} min` : "Waiting for the driver's location…"}
          </Text>
        )}
      </View>

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
          { ico: '📍',  lbl: 'Safe Drop', color: C.info,    bg: C.infoBg,    fn: () => navigation.navigate('SafePoints', { rideId: ride?._id }) },
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
  progressBar:   { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden', marginBottom: 5 },
  progressFill:  { height: 6, borderRadius: 3, backgroundColor: C.success },
  progressText:  { fontSize: 11, color: C.text, fontWeight: '600' },
  deviationBanner:   { position: 'absolute', top: 110, left: 14, right: 14, backgroundColor: '#E74C3C', borderRadius: 14, padding: 12, zIndex: 10 },
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