// frontend/src/screens/safety/SOSScreen.js
// SOS: starts an emergency session on the server (location, ride, passenger,
// driver, vehicle, route and destination are captured there), keeps sending
// live GPS while the session is active, shows what was really done for each
// emergency contact and for the police, and shares a live-location link.
//
// Honesty rules: a "simulated" contact message was NOT sent; the police are
// NOT dispatched by the app — the app opens the dialer for 15.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert, Vibration, ScrollView, Share, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';
import { emergencyAPI, BACKEND_URL } from '../../services/api';
import { emitSOS } from '../../services/socket';
import { requestLocationPermission } from '../../services/location';

const EMERGENCY_NUMBERS = [
  { number: '15',   label: 'Police',                emoji: '👮‍♀️', color: '#1565C0', priority: true },
  { number: '1122', label: 'Rescue / Ambulance',    emoji: '🚑', color: '#2E7D32' },
  { number: '1043', label: 'Women Safety Helpline', emoji: '♀️', color: '#AD1457' },
  { number: '115',  label: 'Edhi Foundation',       emoji: '🤝', color: '#6A1B9A' },
];
const SEND_EVERY_MS = 10000;      // live location to the server
const DIAL_COUNTDOWN = 5;

const dial = (n) => Linking.openURL(`tel:${n}`).catch(() => Alert.alert('Could not open the dialer', `Please dial ${n} manually.`));
const mapsLink = (c) => `https://maps.google.com/?q=${c[1]},${c[0]}`;
const ago = (d) => { const s = Math.round((Date.now() - new Date(d).getTime()) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

const CONTACT_STATUS = {
  simulated:      { text: 'Demo — not actually sent', color: '#FFD600' },
  sent:           { text: 'SMS sent',                  color: '#69F0AE' },
  failed:         { text: 'Sending failed',            color: '#FF8A80' },
  not_configured: { text: 'SMS not configured',        color: '#FF8A80' },
};
const POLICE_STATUS = {
  not_integrated: 'No police system is connected to the app. Call 15 yourself.',
  simulated:      'Demo: the incident report is prepared, but no police system is connected. Call 15 yourself.',
  sent:           'Incident report sent to the police system.',
  failed:         'The police system could not be reached. Call 15 yourself.',
};

export default function SOSScreen({ navigation, route }) {
  const { rideId } = route?.params || {};

  const [session,   setSession]   = useState(null);
  const [starting,  setStarting]  = useState(true);
  const [startErr,  setStartErr]  = useState(null);
  const [gps,       setGps]       = useState({ state: 'searching' });   // searching | live | denied | unavailable
  const [lastFix,   setLastFix]   = useState(null);                     // { coordinates, accuracy, at }
  const [lastSent,  setLastSent]  = useState(null);
  const [offline,   setOffline]   = useState(false);
  const [countdown, setCountdown] = useState(DIAL_COUNTDOWN);
  const [, tick] = useState(0);

  const sessionRef = useRef(null);
  const fixRef = useRef(null);
  const dialed = useRef(false);

  // Refresh the "x seconds ago" labels
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);

  // ── 1. Start the session immediately (with or without a GPS fix) ──────────
  const startSession = async (coordinates, accuracy) => {
    setStarting(true); setStartErr(null);
    try {
      const res = await emergencyAPI.start({ rideId, coordinates, accuracy });
      sessionRef.current = res.session; setSession(res.session);
      if (coordinates) setLastSent(new Date());
      setOffline(false);
    } catch (e) {
      // Network down: also try the realtime channel, and keep retrying below
      emitSOS(rideId, coordinates || null);
      setStartErr(e.response?.data?.message || 'Could not reach the server. Retrying… Call 15 now if you are in danger.');
      setOffline(true);
    }
    setStarting(false);
  };

  useEffect(() => {
    Vibration.vibrate([0, 300, 200, 300, 200, 300, 600, 700, 200, 700, 200, 700], false);
    let watchId = null;
    (async () => {
      // Reuse an active session (e.g. the app was reopened)
      try {
        const a = await emergencyAPI.active();
        if (a.session) { sessionRef.current = a.session; setSession(a.session); setStarting(false); }
      } catch {}

      const perm = await requestLocationPermission();
      if (perm.error) {
        setGps({ state: 'denied', message: perm.error.message });
        if (!sessionRef.current) startSession(null);
        return;
      }
      let firstFix = true;
      // Don't wait long for the first fix — the SOS must start now
      const noFixYet = setTimeout(() => { if (!sessionRef.current && firstFix) startSession(null); }, 4000);
      watchId = Geolocation.watchPosition(
        pos => {
          const fix = { coordinates: [pos.coords.longitude, pos.coords.latitude], accuracy: pos.coords.accuracy, at: new Date() };
          fixRef.current = fix; setLastFix(fix); setGps({ state: 'live' });
          if (firstFix) { firstFix = false; clearTimeout(noFixYet); if (!sessionRef.current) startSession(fix.coordinates, fix.accuracy); }
        },
        err => setGps({ state: err?.code === 1 ? 'denied' : 'unavailable', message: err?.message }),
        { enableHighAccuracy: true, distanceFilter: 5, interval: 5000, fastestInterval: 3000 }
      );
    })();
    return () => { if (watchId != null) Geolocation.clearWatch(watchId); Vibration.cancel(); };
  }, []);

  // ── 2. Keep the server updated; retry start if it failed ──────────────────
  useEffect(() => {
    const t = setInterval(async () => {
      const fix = fixRef.current;
      if (!sessionRef.current) {
        if (!starting) startSession(fix?.coordinates, fix?.accuracy);
        return;
      }
      if (sessionRef.current.status !== 'active' || !fix) return;
      try {
        await emergencyAPI.location(sessionRef.current._id, fix.coordinates, fix.accuracy);
        setLastSent(new Date()); setOffline(false);
      } catch (e) {
        if (e.response?.status === 409) { sessionRef.current = { ...sessionRef.current, status: 'resolved' }; setSession(sessionRef.current); }
        else setOffline(true);    // kept locally; the next tick sends the newest fix
      }
    }, SEND_EVERY_MS);
    return () => clearInterval(t);
  }, [starting]);

  // ── 3. Countdown, then open the dialer for 15 (she still presses call) ────
  useEffect(() => {
    if (dialed.current || countdown < 0) return;
    if (countdown === 0) { dialed.current = true; dial('15'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const fullLink = session?.liveLink?.startsWith('http') ? session.liveLink : session ? `${BACKEND_URL}${session.liveLink}` : null;

  const shareLink = () => {
    if (!fullLink) return;
    const where = lastFix ? `\nLast location: ${mapsLink(lastFix.coordinates)}` : '';
    Share.share({ message: `🆘 I pressed SOS on Mehfooz Ride. Follow my live location: ${fullLink}${where}\nIf you can't reach me, call Police 15.` });
  };

  const imSafe = () => Alert.alert('Mark yourself safe?', 'Live location sharing will stop and your contacts will be told you are safe.', [
    { text: 'Keep SOS on', style: 'cancel' },
    { text: "Yes, I'm safe", onPress: async () => {
      try {
        if (sessionRef.current?._id) await emergencyAPI.resolve(sessionRef.current._id, 'Marked safe in app');
        Vibration.cancel(); navigation.goBack();
      } catch (e) {
        Alert.alert('Not updated', e.response?.data?.message || 'Could not reach the server. Try again.');
      }
    } },
  ]);

  const loc = lastFix || session?.lastLocation;
  const live = gps.state === 'live' && lastFix && Date.now() - new Date(lastFix.at).getTime() < 30000;

  return (
    <LinearGradient colors={['#4A0010', '#7B0000', '#B71C1C']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.big}>🆘</Text>
        <Text style={styles.title}>SOS ACTIVATED</Text>
        <Text style={styles.sub}>
          {starting ? 'Starting emergency session…'
            : session ? `Emergency session active since ${new Date(session.startedAt).toLocaleTimeString()}`
            : startErr}
        </Text>
        {starting && <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />}

        {/* Police — the app opens the dialer; it does not dispatch anyone */}
        <TouchableOpacity onPress={() => { dialed.current = true; setCountdown(-1); dial('15'); }} style={styles.policeBtn}>
          <Text style={styles.policeNum}>📞 Call Police 15</Text>
          <Text style={styles.policeSub}>
            {countdown > 0 ? `Opening the dialer in ${countdown}s…` : 'Opens your phone dialer'}
          </Text>
        </TouchableOpacity>
        {countdown > 0 && (
          <TouchableOpacity onPress={() => { dialed.current = true; setCountdown(-1); }}>
            <Text style={styles.link}>Don't open the dialer</Text>
          </TouchableOpacity>
        )}

        {/* Location status: live vs last known */}
        <View style={styles.box}>
          <Text style={styles.label}>{live ? '🟢 LIVE LOCATION — tracking active' : loc ? '🟡 LAST KNOWN LOCATION' : '📍 LOCATION'}</Text>
          {loc ? (
            <TouchableOpacity onPress={() => Linking.openURL(mapsLink(loc.coordinates))}>
              <Text style={styles.text}>{loc.coordinates[1].toFixed(5)}, {loc.coordinates[0].toFixed(5)}{loc.accuracy ? `  (±${Math.round(loc.accuracy)} m)` : ''}</Text>
              <Text style={styles.small}>Fix {ago(loc.at)} · tap to open map</Text>
            </TouchableOpacity>
          ) : <Text style={styles.text}>Waiting for GPS…</Text>}
          {gps.state === 'denied' && <Text style={styles.warn}>Location permission is off — your location cannot be shared. Tell responders where you are.</Text>}
          {gps.state === 'unavailable' && <Text style={styles.warn}>GPS signal lost — showing the last known location.</Text>}
          {lastSent && <Text style={styles.small}>Last sent to server {ago(lastSent)}</Text>}
          {offline && <Text style={styles.warn}>No connection — will keep retrying. Keep the app open.</Text>}
          <Text style={styles.small}>Location updates continue while this screen is open.</Text>
        </View>

        {/* Live link for contacts */}
        {fullLink && (
          <TouchableOpacity style={styles.shareBtn} onPress={shareLink}>
            <Text style={styles.shareText}>📤 Share live location link</Text>
            <Text style={styles.small}>WhatsApp, SMS — anyone with the link can follow you for {12} hours</Text>
          </TouchableOpacity>
        )}

        {/* What happened for each contact — real statuses from the server */}
        <Text style={styles.section}>👩‍👧 EMERGENCY CONTACTS</Text>
        {session?.contactNotifications?.length ? session.contactNotifications.slice(0, session.incident?.reporter?.emergencyContacts?.length || 5).map((c, i) => (
          <View key={i} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}{c.relation ? ` · ${c.relation}` : ''}</Text>
              <Text style={[styles.small, { color: CONTACT_STATUS[c.status]?.color }]}>{CONTACT_STATUS[c.status]?.text || c.status}</Text>
            </View>
            <TouchableOpacity onPress={() => dial(c.phone)} style={styles.smallBtn}><Text style={styles.smallBtnText}>📞 Call</Text></TouchableOpacity>
          </View>
        )) : session ? (
          <Text style={styles.warn}>No emergency contacts saved — add them in Guardian Setup so they are alerted next time.</Text>
        ) : null}
        {session?.demo && <Text style={styles.small}>Demo mode: messages are logged on the server instead of being sent. Use “Share live location link” to send it yourself.</Text>}

        {session?.police && <Text style={[styles.small, { marginTop: 10 }]}>👮 {POLICE_STATUS[session.police.status]}</Text>}

        {/* Driver / trip details to read out to the police */}
        {session?.incident?.driver?.name && (
          <View style={styles.box}>
            <Text style={styles.label}>🚗 DRIVER & TRIP — read this to the police</Text>
            <Text style={styles.text}>Driver: {session.incident.driver.name}{session.incident.driver.verified ? ' (verified)' : ''}</Text>
            <Text style={styles.text}>Vehicle: {session.incident.driver.vehicle} {session.incident.driver.vehicleColor} · {session.incident.driver.licensePlate}</Text>
            {!!session.incident.driver.phone && <Text style={styles.text}>Driver phone: {session.incident.driver.phone}</Text>}
            {session.incident.trip?.dropoff?.address && <Text style={styles.text}>Going to: {session.incident.trip.dropoff.address}</Text>}
            {session.incident.trip?.routeDeviated && <Text style={styles.warn}>⚠️ The driver left the chosen route during this trip</Text>}
          </View>
        )}

        <Text style={styles.section}>📞 OTHER EMERGENCY NUMBERS</Text>
        {EMERGENCY_NUMBERS.slice(1).map(n => (
          <TouchableOpacity key={n.number} onPress={() => dial(n.number)} style={styles.row}>
            <View style={[styles.badge, { backgroundColor: n.color }]}><Text style={styles.badgeText}>{n.number}</Text></View>
            <Text style={[styles.name, { flex: 1 }]}>{n.emoji}  {n.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={imSafe} style={styles.safeBtn}>
          <Text style={styles.safeText}>✅  I Am Safe Now</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll:     { alignItems: 'center', padding: 22, paddingTop: 44, paddingBottom: 40 },
  big:        { fontSize: 60, marginBottom: 6 },
  title:      { color: '#fff', fontSize: 26, fontWeight: '900' },
  sub:        { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginVertical: 10 },
  policeBtn:  { backgroundColor: '#FFD600', borderRadius: 18, paddingVertical: 14, width: '100%', alignItems: 'center' },
  policeNum:  { color: '#000', fontSize: 20, fontWeight: '900' },
  policeSub:  { color: '#333', fontSize: 11, marginTop: 2 },
  link:       { color: 'rgba(255,255,255,0.7)', fontSize: 12, textDecorationLine: 'underline', marginTop: 8 },
  box:        { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 13, width: '100%', marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  label:      { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  text:       { color: '#fff', fontSize: 13, lineHeight: 19 },
  small:      { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 3, alignSelf: 'stretch' },
  warn:       { color: '#FFD600', fontSize: 12, marginTop: 6, alignSelf: 'stretch' },
  shareBtn:   { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 13, width: '100%', marginTop: 12, borderWidth: 1.5, borderColor: '#fff' },
  shareText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  section:    { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 18, marginBottom: 8, alignSelf: 'flex-start' },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 11, marginBottom: 8, width: '100%', gap: 10 },
  name:       { color: '#fff', fontWeight: '700', fontSize: 13 },
  smallBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnText:{ color: '#fff', fontSize: 11, fontWeight: '700' },
  badge:      { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, minWidth: 52, alignItems: 'center' },
  badgeText:  { color: '#fff', fontWeight: '900', fontSize: 15 },
  safeBtn:    { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 18, paddingVertical: 14, marginTop: 20, width: '100%', alignItems: 'center' },
  safeText:   { color: '#fff', fontSize: 16, fontWeight: '800' },
});
