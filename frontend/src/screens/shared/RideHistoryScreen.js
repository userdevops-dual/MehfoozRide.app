// frontend/src/screens/shared/RideHistoryScreen.js
// Real ride history from the server (GET /api/rides/my-rides): date, pickup,
// destination, driver/passenger, vehicle, fare, distance, duration, status,
// rating and payment. Filters + pages. Nothing is filled in on the phone.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { rideAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { C } from '../../utils/theme';

const FILTERS = [['', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['active', 'Active']];
const STATUS = {
  completed:    ['✅ Completed', C.success],
  cancelled:    ['✕ Cancelled', C.danger],
  requested:    ['⏳ Searching', '#B07030'],
  accepted:     ['🚗 Driver on the way', C.info],
  arrived:      ['📍 Driver at pickup', C.info],
  otp_verified: ['🔐 Starting', C.info],
  in_progress:  ['🚗 On trip', C.info],
};
const PAY = { due: 'cash due', collected: 'paid', disputed: 'payment disputed' };
const fmtDate = (iso) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function RideHistoryScreen({ navigation }) {
  const { user, mode } = useAuth();
  const asDriver = user?.role === 'driver' && mode !== 'passenger';
  const [filter, setFilter]   = useState('');
  const [rides, setRides]     = useState([]);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState(null);
  const [open, setOpen]       = useState(null);

  const load = useCallback(async (p = 1, replace = true) => {
    try {
      setError(null);
      const res = await rideAPI.getMyRides({ ...(asDriver ? {} : { as: 'passenger' }), status: filter || undefined, page: p, limit: 15 });
      setRides(r => replace ? res.rides : [...r, ...res.rides]);
      setPage(res.page); setPages(res.pages); setTotal(res.total);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load your rides. Pull down to retry.');
    }
    setLoading(false); setRefreshing(false);
  }, [filter, asDriver]);

  useEffect(() => { setLoading(true); load(1, true); }, [filter]);

  const renderRide = ({ item: r }) => {
    const st = STATUS[r.status] || [r.status, C.muted];
    const expanded = open === r._id;
    const money = asDriver ? r.settlement?.driverEarning ?? r.fare : r.fare;
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(expanded ? null : r._id)} style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.date}>{fmtDate(r.date)}</Text>
          <Text style={[styles.status, { color: st[1] }]}>{st[0]}</Text>
        </View>
        <Text style={styles.place} numberOfLines={1}>🟢 {r.pickup}</Text>
        <Text style={styles.place} numberOfLines={1}>🔴 {r.dropoff}</Text>
        <View style={styles.rowBottom}>
          <Text style={styles.meta}>
            {r.distanceKm ? `${r.distanceKm} km` : ''}{r.durationMinutes ? ` · ${r.durationMinutes} min` : ''}{r.isPooled ? ' · 👯‍♀️ pooled' : ''}
          </Text>
          <Text style={styles.fare}>
            {money != null ? `Rs ${money}` : r.status === 'cancelled' ? '—' : `~Rs ${r.estimatedFare}`}
          </Text>
        </View>
        {r.rating && <Text style={styles.stars}>{'★'.repeat(r.rating.stars)}<Text style={{ color: '#DDD' }}>{'★'.repeat(5 - r.rating.stars)}</Text></Text>}

        {expanded && (
          <View style={styles.detail}>
            {asDriver
              ? <Detail k="Passenger" v={r.passenger?.name} />
              : <>
                  <Detail k="Driver" v={r.driver?.name} />
                  <Detail k="Vehicle" v={[r.driver?.vehicle, r.driver?.vehicleColor, r.driver?.licensePlate].filter(Boolean).join(' · ')} />
                </>}
            <Detail k="Ride type" v={r.rideType} />
            {r.distanceSource && <Detail k="Distance from" v={r.distanceSource === 'gps' ? 'GPS track' : 'planned route'} />}
            {r.settlement && (asDriver
              ? <>
                  <Detail k="Passenger paid" v={`Rs ${r.settlement.payable} (${PAY[r.settlement.status] || r.settlement.status})`} />
                  <Detail k="Commission" v={`Rs ${r.settlement.commission} (${Math.round(r.settlement.commissionRate * 100)}%)`} />
                  <Detail k="Your earning" v={`Rs ${r.settlement.driverEarning}`} />
                </>
              : <Detail k="Payment" v={`Rs ${r.settlement.payable} · ${r.settlement.method} · ${PAY[r.settlement.status] || r.settlement.status}`} />)}
            {r.cancelReason && <Detail k="Reason" v={r.cancelReason} />}
            {r.rating?.tags?.length > 0 && <Detail k="Feedback" v={r.rating.tags.map(t => t.replace(/_/g, ' ')).join(', ')} />}
            {!!r.rating?.comment && <Detail k="Your comment" v={r.rating.comment} />}
            {r.routeDeviated && <Detail k="Route" v="⚠️ driver left the chosen route on this trip" />}
            {r.sosActivated && <Detail k="Safety" v="🆘 SOS was used on this ride" />}
            {!asDriver && r.status === 'completed' && !r.rating && (
              <TouchableOpacity onPress={() => navigation.navigate('RideComplete', { ride: { _id: r._id } })} style={styles.rateBtn}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>⭐ Rate this ride</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={{ fontSize: 18, color: C.rose }}>←</Text></TouchableOpacity>
        <View>
          <Text style={styles.title}>{asDriver ? 'Rides I drove' : 'My rides'}</Text>
          <Text style={styles.subtitle}>{total} ride{total === 1 ? '' : 's'}</Text>
        </View>
      </View>
      <View style={styles.filters}>
        {FILTERS.map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[styles.filter, filter === k && styles.filterOn]}>
            <Text style={[styles.filterText, filter === k && { color: C.rose }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={C.rose} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={rides}
          keyExtractor={r => String(r._id)}
          renderItem={renderRide}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, true); }} />}
          onEndReached={() => { if (page < pages) load(page + 1, false); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<Text style={styles.empty}>{error || 'No rides yet.'}</Text>}
          ListFooterComponent={page < pages ? <ActivityIndicator color={C.rose} /> : null}
        />
      )}
    </View>
  );
}

const Detail = ({ k, v }) => v ? (
  <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
    <Text style={{ width: 110, fontSize: 11, color: C.muted }}>{k}</Text>
    <Text style={{ flex: 1, fontSize: 11, color: C.text, fontWeight: '600' }}>{v}</Text>
  </View>
) : null;

const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.bg },
  header:    { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingTop: 44, borderBottomWidth: 1, borderBottomColor: C.border },
  back:      { backgroundColor: C.rosePale, borderRadius: 12, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 16, fontWeight: '800', color: C.text },
  subtitle:  { fontSize: 11, color: C.muted },
  filters:   { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  filter:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff' },
  filterOn:  { borderColor: C.rose, backgroundColor: C.rosePale },
  filterText:{ fontSize: 12, fontWeight: '600', color: C.muted },
  card:      { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  date:      { fontSize: 11, color: C.muted },
  status:    { fontSize: 11, fontWeight: '800' },
  place:     { fontSize: 13, color: C.text, marginVertical: 1 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  meta:      { fontSize: 11, color: C.muted },
  fare:      { fontSize: 15, fontWeight: '900', color: C.text },
  stars:     { fontSize: 14, color: '#F4C430', marginTop: 4 },
  detail:    { borderTopWidth: 1, borderTopColor: C.border, marginTop: 10, paddingTop: 8 },
  rateBtn:   { backgroundColor: C.rose, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  empty:     { textAlign: 'center', color: C.muted, marginTop: 40 },
});
