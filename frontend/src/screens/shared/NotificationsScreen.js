// frontend/src/screens/shared/NotificationsScreen.js
// Recent activity built from the user's real rides (completed, cancelled,
// waiting for a rating, payment status). Push notifications are not part of
// this version, so there are no fake alerts or promotions here.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { rideAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { C } from '../../utils/theme';

const TYPE_CONFIG = {
  ride:   { bg: C.rosePale,  icon: '🚗', color: C.rose    },
  safety: { bg: C.dangerBg,  icon: '🛡️', color: C.danger  },
  rate:   { bg: C.goldLight, icon: '⭐', color: '#A07030' },
  system: { bg: C.successBg, icon: '💵', color: C.success },
};
const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
};

// One ride → its activity items (newest first overall)
const itemsFor = (r, asDriver) => {
  const out = [];
  const where = `${r.pickup} → ${r.dropoff}`;
  if (r.status === 'completed') {
    out.push({ id: `${r._id}-done`, type: 'ride', title: 'Ride completed ✅', body: `${where} · ${asDriver ? `you earned Rs ${r.settlement?.driverEarning ?? r.fare}` : `fare Rs ${r.fare}`}`, at: r.date, ride: r });
    if (!asDriver && !r.rating) out.push({ id: `${r._id}-rate`, type: 'rate', title: 'Rate your ride ⭐', body: `How was your ride with ${r.driver?.name || 'your driver'}?`, at: r.date, ride: r, action: 'rate' });
    if (asDriver && r.settlement?.status === 'due') out.push({ id: `${r._id}-cash`, type: 'system', title: 'Cash to collect 💵', body: `Rs ${r.settlement.payable} from ${r.passenger?.name || 'passenger'} — mark it in My Earnings`, at: r.date, action: 'wallet' });
  } else if (r.status === 'cancelled') {
    out.push({ id: `${r._id}-cx`, type: 'ride', title: 'Ride cancelled', body: `${where}${r.cancelReason ? ` · ${r.cancelReason}` : ''}`, at: r.date });
  }
  if (r.sosActivated) out.push({ id: `${r._id}-sos`, type: 'safety', title: 'SOS was used on this ride 🆘', body: where, at: r.date });
  if (r.routeDeviated) out.push({ id: `${r._id}-dev`, type: 'safety', title: 'Route change recorded ⚠️', body: `The driver left the chosen route on ${where}`, at: r.date });
  return out;
};

export default function NotificationsScreen({ navigation }) {
  const { user, mode } = useAuth();
  const asDriver = user?.role === 'driver' && mode !== 'passenger';
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await rideAPI.getMyRides({ ...(asDriver ? {} : { as: 'passenger' }), limit: 20 });
      setItems(res.rides.flatMap(r => itemsFor(r, asDriver)).sort((a, b) => new Date(b.at) - new Date(a.at)));
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load. Pull down to retry.');
    }
    setRefreshing(false);
  }, [asDriver]);
  useEffect(() => { load(); }, []);

  const open = (n) => {
    if (n.action === 'rate') navigation.navigate('RideComplete', { ride: { _id: n.ride._id } });
    else if (n.action === 'wallet') navigation.navigate('Wallet');
    else navigation.navigate('RideHistory');
  };

  return (
    <View style={s.screen}>
      <LinearGradient colors={['#5C1448', '#C84B7A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Activity 🔔</Text>
        <Text style={s.sub}>From your last 20 rides</Text>
      </LinearGradient>

      <ScrollView style={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {items === null && !error && <ActivityIndicator color={C.rose} style={{ marginTop: 40 }} />}
        {!!error && <Text style={s.emptyText}>{error}</Text>}
        {items?.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 52 }}>🔕</Text>
            <Text style={s.emptyText}>Nothing yet — your ride updates will appear here.</Text>
          </View>
        )}
        {items?.map(n => <NotifCard key={n.id} notif={n} onPress={() => open(n)} />)}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
// ── Single notification card ────────────────────────────────────────────────
function NotifCard({ notif, onPress }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={s.notifCard}>
      <View style={[s.notifIcon, { backgroundColor: cfg.bg }]}>
        <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.notifTitle}>
          {notif.title}
        </Text>
        <Text style={s.notifBody} numberOfLines={2}>{notif.body}</Text>
        <Text style={s.notifTime}>{ago(notif.at)}</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: C.bg },
  header:         { padding: 20, paddingTop: 46, paddingBottom: 24 },
  backBtn:        { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
  backText:       { color: '#fff', fontWeight: '600', fontSize: 13 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title:          { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub:            { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  badge:          { backgroundColor: '#fff', borderRadius: 12, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText:      { color: C.rose, fontWeight: '800', fontSize: 13 },
  markAllBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 10 },
  markAllText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  body:           { flex: 1, padding: 14 },
  sectionLabel:   { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  notifCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  notifCardUnread:{ borderColor: `${C.rose}60`, backgroundColor: C.roseLight || '#FFF8FC' },
  notifIcon:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notifTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  notifBody:      { fontSize: 11, color: C.muted, lineHeight: 16 },
  notifTime:      { fontSize: 10, color: C.muted, marginTop: 5 },
  unreadDot:      { width: 9, height: 9, borderRadius: 5, backgroundColor: C.rose },
  emptyBox:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:      { fontSize: 14, color: C.muted },
  card:           { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle:      { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 14 },
  settingRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  settingLabel:   { fontSize: 13, fontWeight: '600', color: C.text },
  settingSub:     { fontSize: 11, color: C.muted, marginTop: 2 },
});
