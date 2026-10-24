// frontend/src/screens/shared/WalletScreen.js
// Driver: real earnings and statistics (GET /api/driver/stats) — today/week/
// month, last 7 days, commission, cash still to collect (mark it collected),
// rating with categories, behaviour feedback and recent reviews.
// Passenger: what she has paid, from her completed rides. Payment is cash in
// this version — there is no in-app wallet balance or top-up.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { driverAPI, rideAPI } from '../../services/api';
import { C } from '../../utils/theme';

const CAT_LABEL = { safety: '🛡️ Safety', respectful: '🤝 Respectful', professionalism: '💼 Professionalism', punctuality: '⏰ Punctuality', cleanliness: '✨ Cleanliness' };
const rs = (n) => `Rs ${Math.round(n || 0).toLocaleString()}`;

export default function WalletScreen({ navigation }) {
  const { user, mode } = useAuth();
  const isDriver = user?.role === 'driver' && mode !== 'passenger';
  const [stats, setStats]     = useState(null);
  const [due, setDue]         = useState([]);          // driver: rides with cash still due
  const [paid, setPaid]       = useState(null);        // passenger: { total, count, rides }
  const [error, setError]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (isDriver) {
        const [s, h] = await Promise.all([driverAPI.getStats(), rideAPI.getMyRides({ status: 'completed', limit: 50 })]);
        setStats(s.stats);
        setDue(h.rides.filter(r => r.settlement?.status === 'due'));
      } else {
        const h = await rideAPI.getMyRides({ as: 'passenger', status: 'completed', limit: 50 });
        setPaid({ total: h.rides.reduce((a, r) => a + (r.fare || 0), 0), count: h.total, shown: h.rides.length, rides: h.rides.slice(0, 10) });
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load. Pull down to retry.');
    }
    setRefreshing(false);
  }, [isDriver]);
  useEffect(() => { load(); }, []);

  const markCollected = (r) => Alert.alert('Cash received?', `Confirm you received ${rs(r.settlement.payable)} from ${r.passenger?.name || 'the passenger'}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes, received', onPress: async () => {
      try { await rideAPI.confirmPayment(r._id, 'collected'); load(); }
      catch (e) { Alert.alert('Not saved', e.response?.data?.message || 'Try again.'); }
    } },
  ]);

  const loading = isDriver ? !stats : !paid;
  return (
    <View style={s.screen}>
      <LinearGradient colors={['#5C1448', '#C84B7A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>{isDriver ? '💰 My Earnings' : '💵 My Payments'}</Text>
        {isDriver && stats && (
          <View style={s.bigCard}>
            <Text style={s.bigLabel}>Total earned (after {Math.round(stats.commissionRate * 100)}% commission)</Text>
            <Text style={s.bigAmount}>{rs(stats.totalEarnings)}</Text>
            <View style={s.split}>
              <Mini v={rs(stats.todayEarnings)} l="Today" />
              <Mini v={rs(stats.weekEarnings)} l="Last 7 days" />
              <Mini v={rs(stats.monthEarnings)} l="This month" />
            </View>
          </View>
        )}
        {!isDriver && paid && (
          <View style={s.bigCard}>
            <Text style={s.bigLabel}>Paid for completed rides{paid.count > paid.shown ? ` (latest ${paid.shown})` : ''}</Text>
            <Text style={s.bigAmount}>{rs(paid.total)}</Text>
            <Text style={[s.bigLabel, { marginTop: 4 }]}>{paid.count} completed ride{paid.count === 1 ? '' : 's'} · cash payment</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {loading && !error && <ActivityIndicator color={C.rose} style={{ marginTop: 30 }} />}
        {!!error && <Text style={s.empty}>{error}</Text>}

        {isDriver && stats && (
          <>
            {/* Cash to collect */}
            {due.length > 0 && (
              <View style={[s.card, { borderColor: '#F39C12' }]}>
                <Text style={s.cardTitle}>💵 Cash to collect · {rs(stats.cashDue)}</Text>
                {due.map(r => (
                  <View key={r._id} style={s.dueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowMain}>{r.passenger?.name} · {rs(r.settlement.payable)}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{r.dropoff}</Text>
                    </View>
                    <TouchableOpacity onPress={() => markCollected(r)} style={s.dueBtn}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Received</Text></TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Last 7 days */}
            <View style={s.card}>
              <Text style={s.cardTitle}>📊 Last 7 days</Text>
              <WeekBars daily={stats.daily} />
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>🚗 Driving</Text>
              <Stat k="Completed rides" v={stats.totalRides} />
              <Stat k="Rides today" v={stats.todayRides} />
              <Stat k="Pooled rides" v={stats.pooledRides} />
              <Stat k="Distance driven" v={`${stats.totalDistance} km`} />
              <Stat k="Time on trips" v={`${stats.totalHours} h`} />
              <Stat k="Passengers paid (total fares)" v={rs(stats.totalFares)} />
              <Stat k="Platform commission" v={rs(stats.totalCommission)} />
              <Stat k="Acceptance rate" v={stats.acceptanceRate != null ? `${stats.acceptanceRate}% (${stats.requestsOffered} requests)` : 'No requests yet'} />
              <Stat k="Rides I cancelled" v={stats.cancelledByDriver} />
            </View>

            {/* Rating */}
            <View style={s.card}>
              <Text style={s.cardTitle}>⭐ Rating</Text>
              {stats.totalRatings ? (
                <>
                  <Text style={s.ratingBig}>{Number(stats.averageRating).toFixed(1)} <Text style={{ fontSize: 13, color: C.muted }}>from {stats.totalRatings} rating{stats.totalRatings === 1 ? '' : 's'}</Text></Text>
                  {Object.entries(stats.ratingCategories || {}).map(([k, v]) => <Stat key={k} k={CAT_LABEL[k] || k} v={`${v} ★`} />)}
                  {Object.keys(stats.ratingTags || {}).length > 0 && (
                    <View style={s.tags}>
                      {Object.entries(stats.ratingTags).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                        <Text key={t} style={s.tag}>{t.replace(/_/g, ' ')} ×{n}</Text>
                      ))}
                    </View>
                  )}
                  {stats.recentReviews?.filter(r => r.comment).map(r => (
                    <View key={r._id} style={s.review}>
                      <Text style={{ color: '#F4C430' }}>{'★'.repeat(r.stars)}</Text>
                      <Text style={s.rowSub}>“{r.comment}”</Text>
                    </View>
                  ))}
                </>
              ) : <Text style={s.rowSub}>No ratings yet — your rating appears after passengers rate their rides.</Text>}
            </View>
          </>
        )}

        {!isDriver && paid && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Recent payments</Text>
            {paid.rides.length === 0 && <Text style={s.rowSub}>No completed rides yet.</Text>}
            {paid.rides.map(r => (
              <View key={r._id} style={s.dueRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowMain} numberOfLines={1}>{r.pickup} → {r.dropoff}</Text>
                  <Text style={s.rowSub}>{new Date(r.date).toLocaleDateString('en-PK')} · {r.settlement?.status === 'collected' ? 'paid' : r.settlement?.status === 'due' ? 'cash due' : 'cash'}</Text>
                </View>
                <Text style={s.rowMain}>{rs(r.fare)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => navigation.navigate('RideHistory')}><Text style={s.link}>See all rides →</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Bars for the last 7 days (days with no rides show as empty)
const WeekBars = ({ daily = [] }) => {
  const map = Object.fromEntries(daily.map(d => [d._id, d]));
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });   // YYYY-MM-DD
    return { key, label: d.toLocaleDateString('en-PK', { weekday: 'short' }), e: map[key]?.earnings || 0, n: map[key]?.rides || 0 };
  });
  const max = Math.max(1, ...days.map(d => d.e));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6, marginTop: 8 }}>
      {days.map(d => (
        <View key={d.key} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 8, color: C.muted }}>{d.e ? Math.round(d.e) : ''}</Text>
          <View style={{ width: '70%', height: Math.max(2, (d.e / max) * 80), backgroundColor: d.e ? C.rose : C.border, borderRadius: 4 }} />
          <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
};
const Mini = ({ v, l }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{v}</Text>
    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 }}>{l}</Text>
  </View>
);
const Stat = ({ k, v }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
    <Text style={{ fontSize: 12, color: C.muted }}>{k}</Text>
    <Text style={{ fontSize: 12, color: C.text, fontWeight: '700' }}>{v}</Text>
  </View>
);

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.bg },
  header:    { padding: 18, paddingTop: 46, paddingBottom: 20 },
  back:      { color: '#fff', fontSize: 14, marginBottom: 6 },
  title:     { color: '#fff', fontSize: 20, fontWeight: '900' },
  bigCard:   { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 18, padding: 16, marginTop: 14 },
  bigLabel:  { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  bigAmount: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 },
  split:     { flexDirection: 'row', marginTop: 12 },
  card:      { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 6 },
  dueRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  dueBtn:    { backgroundColor: C.success, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  rowMain:   { fontSize: 12, fontWeight: '700', color: C.text },
  rowSub:    { fontSize: 11, color: C.muted, marginTop: 2 },
  ratingBig: { fontSize: 28, fontWeight: '900', color: C.text, marginBottom: 6 },
  tags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag:       { fontSize: 10, color: C.text, backgroundColor: C.rosePale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  review:    { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6, marginTop: 6 },
  link:      { color: C.rose, fontWeight: '700', marginTop: 10, textAlign: 'right' },
  empty:     { textAlign: 'center', color: C.muted, marginTop: 30 },
});
