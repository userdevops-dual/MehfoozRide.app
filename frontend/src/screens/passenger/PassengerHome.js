// src/screens/passenger/PassengerHome.js
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import OSMMap from '../../components/OSMMap';
import { watchLocation, openLocationSettings, LocationError, LOW_ACCURACY_METERS } from '../../services/location';
import { Badge } from '../../components/UI';
import { C, GRAD } from '../../utils/theme';

export default function PassengerHome({ navigation }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('home');

  // Live GPS for the home map
  const [myLoc,    setMyLoc]    = useState(null);
  const [locError, setLocError] = useState(null);
  const stopRef = useRef(null);

  const startWatching = () => {
    stopRef.current?.();
    setLocError(null);
    stopRef.current = watchLocation(({ coords, error }) => {
      if (error) { setLocError(error); return; }
      setLocError(null);
      setMyLoc(coords);
    });
  };

  // Track only while this screen is visible (saves battery)
  useFocusEffect(useCallback(() => {
    startWatching();
    return () => stopRef.current?.();
  }, []));

  const quickActions = [
    { icon: '🤙', label: 'Fake Call',   sub: 'Safety trick',       bg: '#FFE4EF',   color: C.rose,   screen: 'FakeCall' },
    { icon: '👁️', label: 'Guardian',    sub: 'Share live ride',    bg: C.plumLight, color: C.plum,   screen: 'GuardianSetup' },
    { icon: '🆘', label: 'SOS Alert',   sub: 'One-tap emergency',  bg: C.dangerBg,  color: C.danger, screen: 'SOSScreen' },
    { icon: '📍', label: 'Safe Points', sub: 'Nearby safety',      bg: C.infoBg,    color: C.info,   screen: 'SafePoints' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning ✨' : hour < 17 ? 'Good Afternoon ☀️' : 'Good Evening 🌙';

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={GRAD.primary} style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.name}>{user?.name?.split(' ')[0] || 'Ayesha'} 🌸</Text>
              <Text style={styles.subtext}>Your safety is our mission 🛡️</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}>
                <Text style={{ fontSize: 17 }}>🔔</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatar}>
                <Text style={{ fontSize: 24 }}>👩</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <Badge text="🛡️ Safe Zone ON" color="#fff" bg="rgba(255,255,255,0.2)" />
            <Badge text="✅ Verified Female" color="#fff" bg="rgba(255,255,255,0.2)" />
            {!!user?.totalRatings && <Badge text={`⭐ ${user.averageRating.toFixed(1)}`} color="#fff" bg="rgba(255,255,255,0.2)" />}
          </View>
        </LinearGradient>

        {/* Search Card */}
        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>🚗 Where would you like to go?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Booking')} style={styles.searchBox}>
            <Text style={{ fontSize: 17 }}>🔍</Text>
            <Text style={styles.searchPlaceholder}>Search your destination...</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {[
              { icon: '🏠', label: 'Home' },
              { icon: '💼', label: 'Office' },
              { icon: '🛍️', label: 'Mall' },
              { icon: '🏫', label: 'Uni' },
            ].map(p => (
              <TouchableOpacity key={p.label} onPress={() => navigation.navigate('Booking')} style={styles.quickDest}>
                <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                <Text style={styles.quickDestLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Live location map */}
        <View style={styles.mapCard}>
          {myLoc ? (
            <OSMMap
              style={styles.liveMap}
              center={myLoc}
              zoom={15}
              fitKey="home"
              markers={[{ id: 'me', latitude: myLoc.latitude, longitude: myLoc.longitude, color: '#2D7FF9', accuracy: myLoc.accuracy, label: 'You are here' }]}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              {locError ? (
                <>
                  <Text style={{ fontSize: 30 }}>📍</Text>
                  <Text style={styles.mapMsg}>{locError.message}</Text>
                  <TouchableOpacity onPress={locError.code === LocationError.PERMISSION_BLOCKED ? openLocationSettings : startWatching} style={styles.mapRetry}>
                    <Text style={styles.mapRetryText}>{locError.code === LocationError.PERMISSION_BLOCKED ? 'Open Settings' : 'Try again'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ActivityIndicator color={C.rose} />
                  <Text style={styles.mapMsg}>Finding your location…</Text>
                </>
              )}
            </View>
          )}
          <View style={styles.mapFooter}>
            <Text style={styles.mapFooterText} numberOfLines={1}>
              {myLoc
                ? `📍 Live location${myLoc.accuracy > LOW_ACCURACY_METERS ? ` (approximate, ±${myLoc.accuracy} m)` : ''}`
                : locError ? '📍 Location off' : '📍 Finding location…'}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SafePoints')}>
              <Text style={styles.mapFooterLink}>Safe Points →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.gridWrap}>
          {quickActions.map(a => (
            <TouchableOpacity key={a.label} onPress={() => navigation.navigate(a.screen)}
              style={[styles.actionCard, { backgroundColor: a.bg }]}>
              <Text style={{ fontSize: 26 }}>{a.icon}</Text>
              <Text style={[styles.actionLabel, { color: a.color }]}>{a.label}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ride Pooling Promo */}
        <TouchableOpacity onPress={() => navigation.navigate('Booking')} style={{ margin: 14 }}>
          <LinearGradient colors={GRAD.primary} style={styles.promo}>
            <Text style={{ fontSize: 36 }}>👯‍♀️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try Ride Pooling!</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 }}>
                Share rides with verified women · Save 35%
              </Text>
            </View>
            <View style={styles.promoBtn}>
              <Text style={{ color: C.rose, fontWeight: '700', fontSize: 12 }}>Book →</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Bottom Nav */}
      <View style={styles.bnav}>
        {[
          { ico: '🏠', lbl: 'Home',    sc: 'home',    fn: () => setTab('home') },
          { ico: '🕐', lbl: 'History', sc: 'history', fn: () => navigation.navigate('RideHistory') },
          { ico: '🛡️', lbl: 'Safety',  sc: 'safety',  fn: () => navigation.navigate('SafetyCenter') },
          { ico: '👤', lbl: 'Profile', sc: 'profile', fn: () => navigation.navigate('Profile') },
        ].map(t => (
          <TouchableOpacity key={t.sc} onPress={t.fn} style={styles.bnavBtn}>
            <Text style={{ fontSize: 21 }}>{t.ico}</Text>
            <Text style={[styles.bnavLabel, tab === t.sc && { color: C.rose, fontWeight: '700' }]}>{t.lbl}</Text>
            {tab === t.sc && <View style={styles.bnavDot} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  header:           { padding: 20, paddingBottom: 68 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  greeting:         { color: 'rgba(255,255,255,0.68)', fontSize: 12 },
  name:             { color: '#fff', fontSize: 21, fontWeight: '800' },
  subtext:          { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  iconBtn:          { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  avatar:           { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)' },
  searchCard:       { backgroundColor: C.white, borderRadius: 24, padding: 18, margin: 14, marginTop: -50, shadowColor: C.rose, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 6 },
  searchTitle:      { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  searchBox:        { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  searchPlaceholder:{ color: C.muted, fontSize: 13 },
  quickDest:        { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', gap: 3 },
  quickDestLabel:   { fontSize: 10, color: C.muted, fontWeight: '600' },
  mapCard:          { backgroundColor: C.white, borderRadius: 20, margin: 14, marginTop: 0, overflow: 'hidden', shadowColor: C.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 },
  mapPlaceholder:   { height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF0F7' },
  liveMap:          { height: 200 },
  mapMsg:           { color: C.muted, fontSize: 12, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  mapRetry:         { marginTop: 10, borderWidth: 1.5, borderColor: C.rose, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  mapRetryText:     { color: C.rose, fontWeight: '700', fontSize: 12 },
  mapFooter:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  mapFooterText:    { fontSize: 12, color: C.text, fontWeight: '600', flex: 1 },
  mapFooterLink:    { fontSize: 12, color: C.rose, fontWeight: '700', marginLeft: 10 },
  gridWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14 },
  actionCard:       { width: '47%', padding: 14, borderRadius: 18, gap: 4 },
  actionLabel:      { fontSize: 12, fontWeight: '700' },
  actionSub:        { fontSize: 10, color: C.muted },
  promo:            { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  promoBtn:         { backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  bnav:             { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', paddingBottom: 20, paddingTop: 10 },
  bnavBtn:          { flex: 1, alignItems: 'center', gap: 2 },
  bnavLabel:        { fontSize: 10, color: C.muted },
  bnavDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: C.rose, marginTop: 1 },
});
