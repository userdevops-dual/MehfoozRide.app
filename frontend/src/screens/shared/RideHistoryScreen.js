// frontend/src/screens/shared/RideHistoryScreen.js
import React, {useState, useEffect} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {rideAPI} from '../../services/api';
import {C} from '../../utils/theme';


export default function RideHistoryScreen({navigation}) {
  const [rides, setRides]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadRides = async () => {
    try {
      const res = await rideAPI.getMyRides();
      setRides(res.rides || []);
    } catch (err) {
      Alert.alert('Could Not Load Rides', err.response?.data?.message || 'Server error. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadRides(); }, []);

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PK', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  };

  const totalSpent = rides.reduce((s, r) => s + (r.actualFare || 0), 0);

  if (selected) {
    const r = selected;
    return (
      <View style={styles.screen}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Ride Details</Text>
        </View>
        <ScrollView>
          <LinearGradient colors={['#27AE60','#1a7a40']} style={styles.detailBanner}>
            <Text style={{fontSize: 48, marginBottom: 8}}>✅</Text>
            <Text style={styles.detailBannerTitle}>Ride Completed</Text>
            <Text style={styles.detailBannerSub}>{formatDate(r.createdAt)}</Text>
          </LinearGradient>
          <View style={styles.detailCard}>
            {[
              {l:'From', v: r.pickupLocation?.address},
              {l:'To',   v: r.dropoffLocation?.address},
              {l:'Fare', v:`Rs. ${r.actualFare || r.estimatedFare}`},
              {l:'Distance', v:`${r.distanceKm} km`},
              {l:'Duration', v:`${r.durationMinutes} min`},
              {l:'Driver', v: r.driver?.name || 'Fatima Malik'},
              {l:"Driver's Rating", v:`${r.driver?.averageRating || 4.9} ⭐`},
            ].map(row => (
              <View key={row.l} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{row.l}</Text>
                <Text style={styles.detailValue}>{row.v}</Text>
              </View>
            ))}
          </View>
          <View style={styles.rideActionsRow}>
            <TouchableOpacity onPress={() => { setSelected(null); navigation.navigate('Booking'); }} style={styles.rebookBtn}>
              <Text style={styles.rebookBtnText}>🔁 Rebook This Ride</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#5C1448','#C84B7A']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn2}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ride History 🕐</Text>
        <View style={styles.statsRow}>
          {[
            {lbl:'Total Rides', val: rides.length},
            {lbl:'Total Spent', val:`Rs.${totalSpent.toLocaleString()}`},
            {lbl:'Avg Rating', val:'4.8 ⭐'},
          ].map(s => (
            <View key={s.lbl} style={styles.statBox}>
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLbl}>{s.lbl}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={C.rose} size="large" style={{marginTop: 40}} />
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRides(); }} colors={[C.rose]} />}
        >
          {rides.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{fontSize: 48}}>🛣️</Text>
              <Text style={styles.emptyText}>No rides yet. Book your first safe ride!</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Booking')} style={styles.bookNowBtn}>
                <Text style={styles.bookNowText}>Book Now →</Text>
              </TouchableOpacity>
            </View>
          ) : rides.map(r => (
            <TouchableOpacity key={r._id} onPress={() => setSelected(r)} style={styles.rideCard}>
              <View style={styles.rideIcon}>
                <Text style={{fontSize: 22}}>🚗</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.rideRoute} numberOfLines={1}>
                  {r.pickupLocation?.address} → {r.dropoffLocation?.address}
                </Text>
                <Text style={styles.rideMeta}>{formatDate(r.createdAt)} · {r.distanceKm} km</Text>
                <View style={styles.rideStatus}>
                  <Text style={styles.rideStatusText}>✓ Completed</Text>
                </View>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={styles.rideFare}>Rs.{r.actualFare || r.estimatedFare}</Text>
                <Text style={styles.rideArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{height: 30}} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           {flex: 1, backgroundColor: C.bg},
  header:           {padding: 20, paddingBottom: 28},
  backBtn2:         {backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 14},
  backText:         {color: '#fff', fontWeight: '600', fontSize: 13},
  title:            {color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14},
  statsRow:         {flexDirection: 'row', gap: 10},
  statBox:          {flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 10, alignItems: 'center'},
  statVal:          {color: '#fff', fontSize: 15, fontWeight: '800'},
  statLbl:          {color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2},
  list:             {flex: 1, padding: 14},
  rideCard:         {backgroundColor: '#fff', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border},
  rideIcon:         {width: 44, height: 44, borderRadius: 22, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center'},
  rideRoute:        {fontSize: 13, fontWeight: '700', color: C.text},
  rideMeta:         {fontSize: 11, color: C.muted, marginTop: 2},
  rideStatus:       {marginTop: 4},
  rideStatusText:   {fontSize: 10, color: C.success, fontWeight: '700'},
  rideFare:         {fontSize: 15, fontWeight: '800', color: C.rose},
  rideArrow:        {color: C.muted, fontSize: 22, marginTop: 2},
  emptyBox:         {alignItems: 'center', paddingTop: 60, gap: 12},
  emptyText:        {fontSize: 14, color: C.muted, textAlign: 'center'},
  bookNowBtn:       {backgroundColor: C.rose, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 10},
  bookNowText:      {color: '#fff', fontWeight: '700', fontSize: 14},
  detailHeader:     {backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border},
  backBtn:          {backgroundColor: C.rosePale, borderRadius: 12, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  backBtnText:      {fontSize: 20, color: C.rose},
  detailHeaderTitle:{fontSize: 16, fontWeight: '800', color: C.text},
  detailBanner:     {padding: 32, alignItems: 'center'},
  detailBannerTitle:{color: '#fff', fontSize: 22, fontWeight: '800'},
  detailBannerSub:  {color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6},
  detailCard:       {backgroundColor: '#fff', borderRadius: 20, margin: 14, padding: 16, shadowColor: '#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, elevation:4},
  detailRow:        {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border},
  detailLabel:      {fontSize: 12, color: C.muted},
  detailValue:      {fontSize: 12, color: C.text, fontWeight: '600'},
  rideActionsRow:   {paddingHorizontal: 14, paddingBottom: 30},
  rebookBtn:        {backgroundColor: C.rose, borderRadius: 16, padding: 14, alignItems: 'center'},
  rebookBtnText:    {color: '#fff', fontWeight: '700', fontSize: 14},
});
