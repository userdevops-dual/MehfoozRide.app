// src/screens/driver/DriverAcceptRideScreen.js
// Driver ride flow:  Request (countdown) → Accept / Decline
//   → for each passenger (one, or up to 3 when pooled):
//      Navigate to pickup → Arrived → same-gender check → OTP → In progress → Complete
// The server offers/withdraws requests and tells passengers; this screen only
// shows what the server confirmed.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, TextInput, ActivityIndicator, Modal, Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';
import { rideAPI } from '../../services/api';
import {
  emitDriverArrived, emitOTPVerified, emitRideCompleted, emitOTPFailed, emitDriverLocation,
  onIncomingRide, onRequestWithdrawn, onRideCancelled,
} from '../../services/socket';
import OSMMap from '../../components/OSMMap';
import { C, GRAD } from '../../utils/theme';

const MOOD_LABEL = {
  talkative: '💬 Talkative — happy to chat',
  quiet:     '🤫 Quiet — little talk please',
  introvert: '🎧 Introvert — minimal conversation',
  friendly:  '😊 Friendly',
};

const STATUS_LABEL = {
  accepted:    { text: 'Go to pickup',  color: C.info },
  arrived:     { text: 'At pickup',     color: C.plum },
  in_progress: { text: 'On board',      color: C.success },
  completed:   { text: 'Dropped off',   color: C.success },
  cancelled:   { text: 'Cancelled',     color: C.muted },
};

const ACTIVE = ['accepted', 'arrived', 'in_progress'];
const errorMessage = (err) => err?.response?.data?.message || 'Server error. Check your connection and try again.';
const latLng = (c) => (Array.isArray(c) ? { latitude: c[1], longitude: c[0] } : null);
const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export default function DriverAcceptRideScreen({ navigation, route }) {
  const initialOffer = route?.params?.rideData || route?.params?.rideRequest || {};
  const requestId = initialOffer?.rideId;

  const [phase,    setPhase]    = useState('incoming');   // incoming | active | done
  const [offer,    setOffer]    = useState(initialOffer);
  const [stops,    setStops]    = useState([]);           // one per passenger after accepting
  const [current,  setCurrent]  = useState(null);         // rideId of the passenger being handled
  const [otp,      setOtp]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [now,      setNow]      = useState(Date.now());
  const [genderCheckFor, setGenderCheckFor] = useState(null);
  const [myLoc,    setMyLoc]    = useState(null);
  const closed = useRef(false);
  const accepting = useRef(false);

  const stop = stops.find(s => String(s.rideId) === String(current)) || null;
  const updateStop = (rideId, patch) =>
    setStops(list => list.map(s => (String(s.rideId) === String(rideId) ? { ...s, ...patch } : s)));

  const leave = (title, message) => {
    if (closed.current) return;
    closed.current = true;
    if (title) Alert.alert(title, message, [{ text: 'OK', onPress: () => navigation.replace('DriverHome') }]);
    else navigation.replace('DriverHome');
  };

  useEffect(() => { if (!requestId) navigation.replace('DriverHome'); }, []);

  // Clock for the request countdown and trip timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // While deciding: the request can change (pool grew/shrank) or be withdrawn
  useEffect(() => {
    if (phase !== 'incoming') return;
    const offs = [
      onIncomingRide(data => { if (String(data?.rideId) === String(requestId)) setOffer(data); }),
      onRequestWithdrawn(data => {
        if (String(data?.rideId) !== String(requestId)) return;
        if (accepting.current) return;   // our own accept is in progress — the server decides
        const why = data.reason === 'accepted_by_other_driver' ? 'Another driver accepted this ride.'
                  : data.reason === 'expired' ? 'This request expired.' : 'The passenger cancelled this request.';
        leave('Request No Longer Available', why);
      }),
    ];
    return () => offs.forEach(off => off && off());
  }, [phase]);

  const secondsLeft = offer?.expiresAt ? Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - now) / 1000)) : null;
  useEffect(() => {
    if (phase === 'incoming' && secondsLeft === 0) leave('Request Expired', 'This ride request is no longer available.');
  }, [secondsLeft, phase]);

  // During the trip: a passenger may cancel before pickup
  useEffect(() => {
    if (phase !== 'active') return;
    const off = onRideCancelled(data => {
      const s = stops.find(x => String(x.rideId) === String(data?.rideId));
      if (!s) return;
      updateStop(data.rideId, { status: 'cancelled' });
      Alert.alert('Passenger Cancelled', `${s.passengerName} cancelled her ride.`);
    });
    return () => off && off();
  }, [phase, stops]);

  // Live location for every active passenger's ride (several when pooled)
  const activeIds = useMemo(() => stops.filter(s => ACTIVE.includes(s.status)).map(s => s.rideId), [stops]);
  useEffect(() => {
    const send = () => Geolocation.getCurrentPosition(
      pos => {
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setMyLoc(c);
        emitDriverLocation([c.longitude, c.latitude], activeIds, pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
    );
    send();
    const interval = setInterval(send, 5000);
    return () => clearInterval(interval);
  }, [activeIds.join(',')]);

  // All passengers finished → summary
  useEffect(() => {
    if (phase === 'active' && stops.length && stops.every(s => !ACTIVE.includes(s.status))) setPhase('done');
  }, [stops, phase]);

  // Next passenger to handle: someone on board first, then pickups in order
  useEffect(() => {
    if (phase !== 'active') return;
    if (stop && ACTIVE.includes(stop.status)) return;
    const next = stops.find(s => s.status === 'in_progress') || stops.find(s => ACTIVE.includes(s.status));
    if (next) { setCurrent(next.rideId); setOtp(''); }
  }, [stops, phase]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    setLoading(true);
    accepting.current = true;
    try {
      const res = await rideAPI.accept(requestId);
      const list = (res.stops || [res.ride]).map(s => ({ ...s, status: s.status || 'accepted', otpFailures: 0 }));
      setStops(list);
      setCurrent(list[0]?.rideId);
      setPhase('active');
    } catch (err) {
      leave('Could Not Accept', errorMessage(err));
    }
    accepting.current = false;
    setLoading(false);
  };

  const handleDecline = async () => {
    try { await rideAPI.decline(requestId); } catch { /* already gone — nothing to undo */ }
    leave();
  };

  const handleArrived = async () => {
    setLoading(true);
    try {
      await rideAPI.arrived(stop.rideId);
      emitDriverArrived(stop.rideId);
      updateStop(stop.rideId, { status: 'arrived' });
      setTimeout(() => setGenderCheckFor(stop.rideId), 400);
    } catch (err) {
      Alert.alert('Error', errorMessage(err));
    }
    setLoading(false);
  };

  const handleGenderConfirm = (confirmed) => {
    const rideId = genderCheckFor;
    const s = stops.find(x => String(x.rideId) === String(rideId));
    setGenderCheckFor(null);
    if (confirmed || !s) return;      // confirmed female → proceed to OTP
    Alert.alert(
      '🚫 Gender Mismatch',
      `You have confirmed that ${s.passengerName} does NOT appear to be female.\n\nHer ride will be cancelled for safety and reviewed by the safety team.`,
      [{
        text: 'Cancel Her Ride', style: 'destructive',
        onPress: async () => {
          try {
            await rideAPI.cancel(rideId, 'Gender identity mismatch — passenger did not appear to be female');
            updateStop(rideId, { status: 'cancelled' });
            Alert.alert('Ride Cancelled', 'The safety team has been notified.');
          } catch (err) {
            Alert.alert('Could Not Cancel', errorMessage(err));
          }
        },
      }]
    );
  };

  const handleVerifyOTP = async () => {
    if (!/^\d{4}$/.test(otp)) {
      Alert.alert('Invalid OTP', "Enter the 4-digit code shown on the passenger's phone."); return;
    }
    setLoading(true);
    try {
      await rideAPI.verifyOTP(stop.rideId, otp);
      emitOTPVerified(stop.rideId);
      updateStop(stop.rideId, { status: 'in_progress', startedAt: Date.now() });
      setOtp('');
    } catch (err) {
      const data = err?.response?.data;
      if (!data) {
        // Network problem — the OTP was NOT verified, so the ride must not start
        Alert.alert('Connection Error', 'Could not reach the server. The ride has not started — please try again.');
      } else {
        updateStop(stop.rideId, { otpFailures: data.failureCount || stop.otpFailures });
        emitOTPFailed(stop.rideId);
        if (data.rideCancelled) {
          updateStop(stop.rideId, { status: 'cancelled' });
          Alert.alert('🚨 Ride Cancelled', data.message);
        } else {
          Alert.alert('Wrong OTP', data.message || 'Ask the passenger for the correct code.');
        }
      }
      setOtp('');
    }
    setLoading(false);
  };

  const handleComplete = () => {
    Alert.alert('Complete Ride?', `Confirm you have dropped off ${stop.passengerName} safely.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete 🏁', onPress: async () => {
          setLoading(true);
          try {
            const res = await rideAPI.complete(stop.rideId);
            updateStop(stop.rideId, {
              status: 'completed',
              finalFare: res.ride?.actualFare,
              billedKm: res.ride?.distanceKm,
              distanceSource: res.ride?.distanceSource,
              minutes: res.ride?.durationMinutes,
            });
            emitRideCompleted(stop.rideId);
          } catch (err) {
            Alert.alert('Could Not Complete', errorMessage(err));
          }
          setLoading(false);
        },
      },
    ]);
  };

  const callPassenger = (phone) => phone && Linking.openURL(`tel:${phone}`).catch(() => {});

  // ── Map ──────────────────────────────────────────────────────────────────
  const shown = phase === 'incoming' ? (offer?.stops || [offer]) : stops.filter(s => s.status !== 'cancelled');
  const markers = [
    ...(myLoc ? [{ id: 'me', ...myLoc, emoji: '🚗', label: 'You' }] : []),
    ...shown.flatMap((s, i) => {
      const p = latLng(s.pickupCoordinates), d = latLng(s.dropoffCoordinates);
      const done = s.status === 'completed';
      return [
        ...(p && !['in_progress', 'completed'].includes(s.status) ? [{ id: `p${i}`, ...p, color: C.success, label: `Pickup ${i + 1}: ${s.passengerName}` }] : []),
        ...(d && !done ? [{ id: `d${i}`, ...d, color: C.rose, label: `Drop-off ${i + 1}: ${s.passengerName}` }] : []),
      ];
    }),
  ];
  const mapFitKey = `${phase}|${shown.map(s => s.status).join(',')}`;

  // ── Done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const completed = stops.filter(s => s.status === 'completed');
    const total = completed.reduce((n, s) => n + (s.finalFare || 0), 0);
    return (
      <LinearGradient colors={GRAD.success} style={styles.doneScreen}>
        <Text style={{ fontSize: 80, marginBottom: 16 }}>🌸</Text>
        <Text style={styles.doneTitle}>{completed.length ? 'Trip Completed!' : 'Trip Ended'}</Text>
        <Text style={styles.doneSub}>{completed.length ? 'Great job! You drove safely.' : 'No passengers were dropped off.'}</Text>
        <View style={styles.doneCard}>
          {stops.map(s => (
            <View key={s.rideId} style={styles.doneRow}>
              <Text style={styles.doneLbl} numberOfLines={1}>{s.passengerName}{s.status === 'cancelled' ? ' (cancelled)' : ''}</Text>
              <Text style={styles.doneVal}>
                {s.status === 'completed' ? `Rs ${s.finalFare} · ${s.billedKm} km${s.distanceSource === 'gps' ? ' (GPS)' : ''}` : '—'}
              </Text>
            </View>
          ))}
          <View style={styles.doneRow}>
            <Text style={styles.doneLbl}>Total fare collected</Text>
            <Text style={[styles.doneVal, { fontSize: 20, fontWeight: '800' }]}>Rs {total}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.replace('DriverHome')} style={styles.homeBtn}>
          <Text style={{ color: C.rose, fontWeight: '800', fontSize: 15 }}>Back to Dashboard 🏠</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const genderStop = stops.find(s => String(s.rideId) === String(genderCheckFor));
  const onBoard = stop?.startedAt ? Math.max(0, Math.round((now - stop.startedAt) / 1000)) : 0;

  return (
    <View style={styles.screen}>
      {/* ── Same-Gender Verification Modal ─────────────────────────────────── */}
      <Modal visible={!!genderCheckFor} transparent animationType="slide" onRequestClose={() => setGenderCheckFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.genderModal}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔍</Text>
            <Text style={styles.genderModalTitle}>Same-Gender Verification</Text>
            <Text style={styles.genderModalDesc}>
              Before proceeding, confirm the passenger is female.{'\n\n'}
              Mehfooz Ride is a women-only platform. Check that the passenger matches her registered profile.
            </Text>
            <View style={styles.genderModalDetails}>
              <Text style={styles.genderDetailLabel}>Expected Passenger:</Text>
              <Text style={styles.genderDetailValue}>{genderStop?.passengerName || 'Passenger'}</Text>
              <Text style={styles.genderDetailLabel}>Platform Policy:</Text>
              <Text style={styles.genderDetailValue}>Female passengers only</Text>
            </View>
            <Text style={styles.genderQuestion}>Does the passenger appear to be female?</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.genderBtn, { backgroundColor: '#27AE60' }]} onPress={() => handleGenderConfirm(true)}>
                <Text style={styles.genderBtnText}>✅ Yes, Female</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, { backgroundColor: '#E74C3C' }]} onPress={() => handleGenderConfirm(false)}>
                <Text style={styles.genderBtnText}>❌ Mismatch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient colors={GRAD.primary} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>{phase === 'incoming' ? 'New ride request' : 'Active trip'}</Text>
            <Text style={styles.headerTitle}>
              {phase === 'incoming'
                ? (offer?.isPooled ? `👯‍♀️ Pooled ride · ${offer.passengers} passengers` : '🔔 Ride request')
                : stop ? `${STATUS_LABEL[stop.status]?.text || ''} · ${stop.passengerName}` : 'Trip'}
            </Text>
          </View>
          {phase === 'incoming' && secondsLeft != null && (
            <View style={styles.timerBadge}><Text style={styles.timerText}>⏳ {fmt(secondsLeft)}</Text></View>
          )}
          {phase === 'active' && stop?.status === 'in_progress' && (
            <View style={styles.timerBadge}><Text style={styles.timerText}>{fmt(onBoard)}</Text></View>
          )}
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false}>
        <OSMMap style={styles.map} center={myLoc || latLng(shown[0]?.pickupCoordinates)} zoom={14}
          markers={markers} fitToContent={markers.length > 1} fitKey={mapFitKey} />

        {/* ── Request: review, accept or decline ─────────────────────────── */}
        {phase === 'incoming' && (
          <>
            {(offer?.stops || [offer]).map((s, i) => (
              <View key={String(s.rideId || i)} style={styles.paxCard}>
                <View style={styles.paxRow}>
                  <View style={styles.paxAvatar}><Text style={{ fontSize: 26 }}>👩</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paxName}>{s.passengerName || 'Passenger'}{offer?.isPooled ? ` · stop ${i + 1}` : ''}</Text>
                    <Text style={styles.paxMood}>{MOOD_LABEL[s.moodPreference] || MOOD_LABEL.quiet}</Text>
                    {s.passengerRating ? <Text style={styles.paxMood}>⭐ {Number(s.passengerRating).toFixed(1)}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.fareAmt}>Rs {s.fare}</Text>
                    <Text style={styles.fareDist}>{s.distanceKm} km · ~{s.durationMin} min</Text>
                  </View>
                </View>
                <View style={styles.routeBox}>
                  <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: C.success }]} /><Text style={styles.routeText} numberOfLines={2}>{s.pickupAddress}</Text></View>
                  <View style={styles.routeLine} />
                  <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: C.rose }]} /><Text style={styles.routeText} numberOfLines={2}>{s.dropoffAddress}</Text></View>
                </View>
              </View>
            ))}
            <View style={styles.actionBox}>
              <Text style={styles.actionTitle}>
                {offer?.isPooled ? `Total for ${offer.passengers} passengers: Rs ${offer.totalFare}` : `Fare: Rs ${offer?.fare}`}
              </Text>
              <Text style={styles.actionDesc}>
                {offer?.driverDistanceKm != null ? `Pickup is about ${offer.driverDistanceKm} km from you. ` : ''}
                {offer?.isPooled ? 'Accepting takes every passenger in this pool. ' : ''}Estimated fare — the final fare uses the actual trip.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={handleDecline} style={[styles.actionBtn, { flex: 1, backgroundColor: C.muted }]} disabled={loading}>
                  <Text style={styles.actionBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAccept} style={[styles.actionBtn, { flex: 2, backgroundColor: C.success }]} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>✓ Accept{offer?.isPooled ? ' Pool' : ' Ride'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── Active trip ────────────────────────────────────────────────── */}
        {phase === 'active' && (
          <>
            {/* Passenger list (several when pooled) */}
            {stops.length > 1 && (
              <View style={styles.stopTabs}>
                {stops.map((s, i) => (
                  <TouchableOpacity key={s.rideId} onPress={() => { setCurrent(s.rideId); setOtp(''); }}
                    style={[styles.stopTab, String(s.rideId) === String(current) && styles.stopTabActive]}>
                    <Text style={styles.stopTabName} numberOfLines={1}>{i + 1}. {s.passengerName}</Text>
                    <Text style={[styles.stopTabStatus, { color: STATUS_LABEL[s.status]?.color }]}>{STATUS_LABEL[s.status]?.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {stop && (
              <View style={styles.paxCard}>
                <View style={styles.paxRow}>
                  <View style={styles.paxAvatar}><Text style={{ fontSize: 26 }}>👩</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paxName}>{stop.passengerName}</Text>
                    <Text style={styles.paxMood}>{MOOD_LABEL[stop.moodPreference] || MOOD_LABEL.quiet}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.fareAmt}>Rs {stop.finalFare ?? stop.fare}</Text>
                    {!!stop.passengerPhone && ACTIVE.includes(stop.status) && (
                      <TouchableOpacity onPress={() => callPassenger(stop.passengerPhone)}><Text style={styles.callLink}>📞 Call</Text></TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.routeBox}>
                  <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: C.success }]} /><Text style={styles.routeText} numberOfLines={2}>{stop.pickupAddress}</Text></View>
                  <View style={styles.routeLine} />
                  <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: C.rose }]} /><Text style={styles.routeText} numberOfLines={2}>{stop.dropoffAddress}</Text></View>
                </View>
              </View>
            )}

            {stop?.status === 'accepted' && (
              <View style={styles.actionBox}>
                <Text style={styles.actionTitle}>📍 Drive to {stop.passengerName}'s pickup</Text>
                <Text style={styles.actionDesc}>When you reach her, tap below. You'll then confirm she is female and enter her OTP.</Text>
                <TouchableOpacity onPress={handleArrived} style={[styles.actionBtn, { backgroundColor: C.info }]} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>✓ I've Arrived at Pickup</Text>}
                </TouchableOpacity>
              </View>
            )}

            {stop?.status === 'arrived' && (
              <View style={styles.actionBox}>
                {stop.otpFailures > 0 && (
                  <View style={[styles.warningBanner, { backgroundColor: stop.otpFailures >= 2 ? '#FDEDEC' : '#FEF9E7' }]}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: stop.otpFailures >= 2 ? '#C0392B' : '#F39C12' }}>
                      ⚠️ Wrong OTP: {stop.otpFailures}/3 attempt(s)
                    </Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                      {stop.otpFailures >= 2 ? 'ONE more failure will cancel this ride and report it to the safety team' : 'Please check the code with the passenger'}
                    </Text>
                  </View>
                )}
                <Text style={styles.actionTitle}>🔐 Enter {stop.passengerName}'s OTP</Text>
                <Text style={styles.actionDesc}>Ask her to show the 4-digit code on her phone. The ride starts only if it matches.</Text>
                <View style={styles.otpRow}>
                  <TextInput value={otp} onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit OTP" keyboardType="number-pad" maxLength={4}
                    style={styles.otpInput} placeholderTextColor={C.muted} />
                  <TouchableOpacity onPress={handleVerifyOTP} style={[styles.otpBtn, { backgroundColor: C.plum }]} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Verify →</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {stop?.status === 'in_progress' && (
              <View style={styles.actionBox}>
                <View style={styles.inProgressBanner}>
                  <Text style={{ fontSize: 22 }}>🚗</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.success }}>{stop.passengerName} is on board</Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>OTP confirmed — drive safely to her drop-off</Text>
                  </View>
                </View>
                <Text style={styles.actionDesc}>Tap when she has been dropped off safely. The final fare is calculated from the actual trip.</Text>
                <TouchableOpacity onPress={handleComplete} style={[styles.actionBtn, { backgroundColor: C.rose }]} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>🏁 Complete {stop.passengerName}'s Ride</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
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
  // Phase 3
  map:              { height: 220 },
  timerText:        { color: '#fff', fontWeight: '800', fontSize: 15 },
  callLink:         { color: C.info, fontWeight: '700', fontSize: 12, marginTop: 4 },
  stopTabs:         { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 14 },
  stopTab:          { flex: 1, padding: 10, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.white },
  stopTabActive:    { borderColor: C.rose, backgroundColor: C.rosePale },
  stopTabName:      { fontSize: 12, fontWeight: '700', color: C.text },
  stopTabStatus:    { fontSize: 10, fontWeight: '700', marginTop: 2 },
});
